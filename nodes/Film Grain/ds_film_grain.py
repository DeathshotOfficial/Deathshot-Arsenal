# DeathshotArsenal/nodes/Film Grain/ds_film_grain.py

import os
import sys
import math
import random
import logging
import torch
import numpy as np
from PIL import Image

import folder_paths

LOG = "[DeathshotArsenal|FilmGrain]"

# GLSL ES 3.0 fragment shader
GLSL_FRAGMENT_SHADER = """#version 300 es
precision highp float;

uniform sampler2D u_image0;
uniform vec2 u_resolution;
uniform float u_float0; // grain amount      [0.0 – 1.0]   typical: 0.2–0.8
uniform float u_float1; // grain size        [0.01 – 2.0]  lower = finer grain
uniform float u_float2; // color amount      [0.0 – 1.0]   0 = monochrome, 1 = RGB grain
uniform float u_float3; // shadow focus      [0.0 – 1.0]   0 = uniform, 1 = shadows only
uniform int   u_int0;   // noise mode        [0 or 1]      0 = smooth, 1 = grainy

in vec2 v_texCoord;
layout(location = 0) out vec4 fragColor0;

// High-quality integer hash (pcg-like)
uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// 2D -> 1D hash input
uint hash2d(uvec2 p) {
    return pcg(p.x + pcg(p.y));
}

// Hash to float [0, 1]
float hashf(uvec2 p) {
    return float(hash2d(p)) / float(0xffffffffu);
}

// Hash to float with offset (for RGB channels)
float hashf(uvec2 p, uint offset) {
    return float(pcg(hash2d(p) + offset)) / float(0xffffffffu);
}

// Convert uniform [0,1] to roughly Gaussian distribution
// Using simple approximation: average of multiple samples
float toGaussian(uvec2 p) {
    float sum = hashf(p, 0u) + hashf(p, 1u) + hashf(p, 2u) + hashf(p, 3u);
    return (sum - 2.0) * 0.7;  // Centered, scaled
}

float toGaussian(uvec2 p, uint offset) {
    float sum = hashf(p, offset) + hashf(p, offset + 1u) 
              + hashf(p, offset + 2u) + hashf(p, offset + 3u);
    return (sum - 2.0) * 0.7;
}

// Smooth noise with better interpolation
float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    
    // Quintic interpolation (less banding than cubic)
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    
    uvec2 ui = uvec2(i);
    float a = toGaussian(ui);
    float b = toGaussian(ui + uvec2(1u, 0u));
    float c = toGaussian(ui + uvec2(0u, 1u));
    float d = toGaussian(ui + uvec2(1u, 1u));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float smoothNoise(vec2 p, uint offset) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    
    uvec2 ui = uvec2(i);
    float a = toGaussian(ui, offset);
    float b = toGaussian(ui + uvec2(1u, 0u), offset);
    float c = toGaussian(ui + uvec2(0u, 1u), offset);
    float d = toGaussian(ui + uvec2(1u, 1u), offset);
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    vec4 color = texture(u_image0, v_texCoord);
    
    // Luminance (Rec.709)
    float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    
    // Grain UV (resolution-independent)
    vec2 grainUV = v_texCoord * u_resolution / max(u_float1, 0.01);
    uvec2 grainPixel = uvec2(grainUV);
    
    float g;
    vec3 grainRGB;
    
    if (u_int0 == 1) {
        // Grainy mode: pure hash noise (no interpolation = no banding)
        g = toGaussian(grainPixel);
        grainRGB = vec3(
            toGaussian(grainPixel, 100u),
            toGaussian(grainPixel, 200u),
            toGaussian(grainPixel, 300u)
        );
    } else {
        // Smooth mode: interpolated with quintic curve
        g = smoothNoise(grainUV);
        grainRGB = vec3(
            smoothNoise(grainUV, 100u),
            smoothNoise(grainUV, 200u),
            smoothNoise(grainUV, 300u)
        );
    }
    
    // Luminance weighting (less grain in highlights)
    float lumWeight = mix(1.0, 1.0 - luma, clamp(u_float3, 0.0, 1.0));
    
    // Strength
    float strength = u_float0 * 0.15;
    
    // Color vs monochrome grain
    vec3 grainColor = mix(vec3(g), grainRGB, clamp(u_float2, 0.0, 1.0));
    
    color.rgb += grainColor * strength * lumWeight;
    fragColor0 = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
"""

_glsl_renderer = None
try:
    from comfy_extras.nodes_glsl import _render_shader_batch
    _glsl_renderer = _render_shader_batch
except Exception as e:
    logging.warning(f"{LOG} comfy_extras.nodes_glsl unavailable, will use GPU tensor fallback: {e}")


def _get_shader_code():
    """Dynamically load official ComfyUI Film Grain shader blueprint if available."""
    try:
        comfy_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        glsl_dir = os.path.join(comfy_root, "blueprints", ".glsl")
        candidates = [
            os.path.join(glsl_dir, "Film_Grain_15.frag"),
            os.path.join(glsl_dir, "Film_Grain.frag"),
        ]
        for p in candidates:
            if os.path.isfile(p):
                with open(p, "r", encoding="utf-8") as f:
                    code = f.read().strip()
                    if code:
                        return code
    except Exception as e:
        logging.warning(f"{LOG} Note on dynamic shader blueprint load: {e}")
    return GLSL_FRAGMENT_SHADER


def register_film_grain_routes():
    try:
        import server
        from aiohttp import web
        if not hasattr(server.PromptServer, "instance") or not server.PromptServer.instance:
            return
        routes = server.PromptServer.instance.routes

        @routes.get("/ds/film_grain/shader")
        async def _get_shader_endpoint(request):
            return web.json_response({"shader": _get_shader_code()})
    except Exception as e:
        logging.warning(f"{LOG} Note on route registration: {e}")


try:
    register_film_grain_routes()
except Exception:
    pass


def _clamp(val, min_val, max_val, default_val):
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default_val
        return max(min_val, min(max_val, f))
    except Exception:
        return default_val


class DS_FilmGrain:
    """
    DS Film Grain adds controllable photographic film grain to an input image.
    Uses native GLSL GPU shader via ANGLE / GLES3 for authentic photographic texture.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "grain_amount": ("FLOAT", {
                    "default": 0.30,
                    "min": 0.00,
                    "max": 1.00,
                    "step": 0.01,
                    "display": "slider"
                }),
                "grain_size": ("FLOAT", {
                    "default": 0.50,
                    "min": 0.01,
                    "max": 2.00,
                    "step": 0.01,
                    "display": "slider"
                }),
                "color_amount": ("FLOAT", {
                    "default": 0.00,
                    "min": 0.00,
                    "max": 1.00,
                    "step": 0.01,
                    "display": "slider"
                }),
                "shadow_focus": ("FLOAT", {
                    "default": 0.00,
                    "min": 0.00,
                    "max": 1.00,
                    "step": 0.01,
                    "display": "slider"
                }),
                "grain_mode": (["Smooth", "Grainy"], {
                    "default": "Smooth"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "apply_grain"
    CATEGORY = "☠️ Deathshot Arsenal/🖼️ Images"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("NaN")

    def _save_temp_preview(self, tensor, prefix="film_grain_"):
        """Save a fast temp WebP image for the frontend WebGL / DOM preview."""
        if tensor is None:
            return None
        try:
            if tensor.ndim == 4:
                first_frame = tensor[0]
            else:
                first_frame = tensor

            arr = 255.0 * first_frame.detach().cpu().numpy()
            arr = np.clip(arr, 0, 255).astype(np.uint8)
            if arr.shape[-1] == 1:
                arr = np.repeat(arr, 3, axis=-1)
            elif arr.shape[-1] > 3:
                arr = arr[..., :3]

            img = Image.fromarray(arr)
            temp_dir = folder_paths.get_temp_directory()
            rand_id = random.randint(100000, 999999)
            filename = f"{prefix}{rand_id}.webp"
            filepath = os.path.join(temp_dir, filename)

            img.save(filepath, format="WEBP", quality=92, method=2)

            return {
                "filename": filename,
                "subfolder": "",
                "type": "temp"
            }
        except Exception as e:
            logging.error(f"{LOG} Fast temp preview save failed: {e}")
            return None

    def _render_with_glsl(self, image_tensor, amount, size, color, shadow, mode_int):
        """Renders image batch using ComfyUI's GPU GLSL pipeline."""
        b, h, w, c = image_tensor.shape
        # Prepare numpy batch [B][1][H, W, 4]
        # GLSL expects RGBA float32 [0, 1]
        np_images = image_tensor.detach().cpu().numpy().astype(np.float32)

        image_batches = []
        for i in range(b):
            frame = np_images[i]
            if c == 3:
                alpha = np.ones((h, w, 1), dtype=np.float32)
                frame = np.concatenate([frame, alpha], axis=-1)
            elif c == 1:
                frame = np.repeat(frame, 3, axis=-1)
                alpha = np.ones((h, w, 1), dtype=np.float32)
                frame = np.concatenate([frame, alpha], axis=-1)
            image_batches.append([frame])

        outputs = _glsl_renderer(
            fragment_code=_get_shader_code(),
            width=w,
            height=h,
            image_batches=image_batches,
            floats=[float(amount), float(size), float(color), float(shadow)],
            ints=[int(mode_int)]
        )

        # outputs: list of batch outputs, each output is list of images (H, W, 4)
        out_frames = []
        for b_out in outputs:
            img_rgba = b_out[0]
            if c == 3:
                out_frames.append(img_rgba[..., :3])
            else:
                out_frames.append(img_rgba)

        out_arr = np.stack(out_frames, axis=0)
        return torch.from_numpy(out_arr).to(device=image_tensor.device, dtype=image_tensor.dtype)

    def _render_with_torch_fallback(self, image_tensor, amount, size, color, shadow, mode_int):
        """Mathematical fallback mirroring the GLSL shader in PyTorch if ANGLE is unavailable."""
        b, h, w, c = image_tensor.shape
        device = image_tensor.device
        rgb = image_tensor[..., :3]

        luma = 0.2126 * rgb[..., 0:1] + 0.7152 * rgb[..., 1:2] + 0.0722 * rgb[..., 2:3]
        lum_weight = (1.0 - shadow) + shadow * (1.0 - luma)
        strength = amount * 0.15

        # Spatial grid based on size
        inv_size = 1.0 / max(size, 0.01)
        grid_h = max(2, int(h * inv_size))
        grid_w = max(2, int(w * inv_size))

        if mode_int == 1:
            # Grainy mode: crisp Gaussian noise
            raw_g = torch.randn((b, h, w, 1), device=device) * 0.7
            if color > 0.001:
                raw_rgb = torch.randn((b, h, w, 3), device=device) * 0.7
                grain_color = (1.0 - color) * raw_g + color * raw_rgb
            else:
                grain_color = raw_g
        else:
            # Smooth mode: interpolated noise
            g_low = torch.randn((b, 1, grid_h, grid_w), device=device) * 0.7
            g_up = torch.nn.functional.interpolate(g_low, size=(h, w), mode="bicubic", align_corners=False).permute(0, 2, 3, 1)
            if color > 0.001:
                rgb_low = torch.randn((b, 3, grid_h, grid_w), device=device) * 0.7
                rgb_up = torch.nn.functional.interpolate(rgb_low, size=(h, w), mode="bicubic", align_corners=False).permute(0, 2, 3, 1)
                grain_color = (1.0 - color) * g_up + color * rgb_up
            else:
                grain_color = g_up

        res = torch.clamp(rgb + grain_color * strength * lum_weight, 0.0, 1.0)
        out = image_tensor.clone()
        out[..., :3] = res
        return out

    def apply_grain(self, image=None, grain_amount=0.30, grain_size=0.50,
                    color_amount=0.00, shadow_focus=0.00, grain_mode="Smooth", **kwargs):
        """
        Applies photographic film grain shader to image batch.
        Flow: Image -> DS Film Grain -> Image
        """
        try:
            if image is None:
                raise ValueError("No input image was provided to DS Film Grain")
            if not torch.is_tensor(image) or image.ndim != 4:
                raise ValueError(f"Expected IMAGE tensor [B, H, W, C], got: {type(image)}")

            amount = _clamp(grain_amount, 0.0, 1.0, 0.30)
            size = _clamp(grain_size, 0.01, 2.0, 0.50)
            color = _clamp(color_amount, 0.0, 1.0, 0.00)
            shadow = _clamp(shadow_focus, 0.0, 1.0, 0.00)
            is_grainy = str(grain_mode).strip().lower() == "grainy"
            mode_int = 1 if is_grainy else 0
            mode_str = "Grainy" if is_grainy else "Smooth"

            # Passthrough if amount is 0
            if amount <= 0.0001:
                img_info = self._save_temp_preview(image)
                ui_data = {
                    "film_grain": [{
                        "preview": img_info or {"filename": "", "type": "temp", "subfolder": ""},
                        "dims": [int(image.shape[2]), int(image.shape[1])],
                        "amount": amount,
                        "size": size,
                        "color": color,
                        "shadow": shadow,
                        "mode": mode_str,
                    }]
                }
                return {"ui": ui_data, "result": (image.clone(),)}

            # Run GLSL GPU shader via comfy_extras if available
            if _glsl_renderer is not None:
                try:
                    out = self._render_with_glsl(image, amount, size, color, shadow, mode_int)
                except Exception as gl_err:
                    logging.warning(f"{LOG} GLSL execution error, using fallback: {gl_err}")
                    out = self._render_with_torch_fallback(image, amount, size, color, shadow, mode_int)
            else:
                out = self._render_with_torch_fallback(image, amount, size, color, shadow, mode_int)

            # Generate preview WebP for node UI
            img_info = self._save_temp_preview(out)
            ui_data = {
                "film_grain": [{
                    "preview": img_info or {"filename": "", "type": "temp", "subfolder": ""},
                    "dims": [int(image.shape[2]), int(image.shape[1])],
                    "amount": amount,
                    "size": size,
                    "color": color,
                    "shadow": shadow,
                    "mode": mode_str,
                }]
            }

            return {"ui": ui_data, "result": (out,)}

        except Exception as e:
            logging.error(f"{LOG} apply_grain fatal error: {e}", exc_info=True)
            fallback = image if (image is not None and torch.is_tensor(image)) else torch.zeros((1, 64, 64, 3), dtype=torch.float32)
            return {"ui": {"film_grain": [{"error": str(e)}]}, "result": (fallback,)}
