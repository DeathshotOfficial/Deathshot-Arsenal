"""
DS Video Save - Backend Execution Engine
DeathshotArsenal / DS Node Pack
"""

import os
import sys
import shutil
import subprocess
import json
import re
import tempfile
import wave
import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from PIL import Image, ImageOps, PngImagePlugin

import folder_paths
import server
import threading
import asyncio
import mimetypes
from aiohttp import web

# ------------------------------------------------------------------
# FilenamesResult: acts as list and formats cleanly as string
# ------------------------------------------------------------------
class FilenamesResult(list):
    """Subclass of list for ComfyUI output sockets that returns the primary file when cast to str."""
    def __str__(self) -> str:
        return self[0] if self else ""

    def __repr__(self) -> str:
        return super().__repr__()


# ------------------------------------------------------------------
# FFmpeg Resolution & NVENC Hardware Detection
# ------------------------------------------------------------------
_NVENC_CACHE: Dict[str, bool] = {}


def get_ffmpeg_path() -> str:
    path = shutil.which("ffmpeg")
    if path and os.path.isfile(path):
        return path
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def is_nvenc_available(encoder_name: str) -> bool:
    """Probes if the specific NVENC encoder is operational on the current system."""
    if encoder_name in _NVENC_CACHE:
        return _NVENC_CACHE[encoder_name]

    ffmpeg_bin = get_ffmpeg_path()
    if not ffmpeg_bin:
        _NVENC_CACHE[encoder_name] = False
        return False

    try:
        # Quick 1-frame probe test
        cmd = [
            ffmpeg_bin,
            "-y",
            "-f", "lavfi",
            "-i", "nullsrc=s=64x64:d=0.04",
            "-c:v", encoder_name,
            "-f", "null",
            "-",
        ]
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        res = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            startupinfo=startupinfo,
            timeout=3.0,
        )
        supported = (res.returncode == 0)
    except Exception:
        supported = False

    _NVENC_CACHE[encoder_name] = supported
    return supported


# ------------------------------------------------------------------
# Path Sanitization & Dynamic Directory Resolution
# ------------------------------------------------------------------
def sanitize_path_prefix(prefix: str, fallback: str = "DS_Video") -> str:
    """Sanitizes illegal characters while preserving relative subfolder slashes."""
    prefix = str(prefix or "").strip().strip('"').strip("'")
    prefix = prefix.replace("\\", "/")

    parts = [p.strip() for p in prefix.split("/") if p.strip()]
    cleaned_parts = []
    for part in parts:
        if part in {".", ".."}:
            continue
        # Remove characters prohibited by filesystems: : * ? " < > |
        cleaned = re.sub(r'[:*?"<>|]', "_", part).strip(" .")
        if cleaned:
            cleaned_parts.append(cleaned)

    if not cleaned_parts:
        return fallback
    return "/".join(cleaned_parts)


def resolve_dir_and_prefix(
    filename_prefix: str,
    save_output: bool = True,
    fallback_prefix: str = "DS_Video",
) -> Tuple[str, str, str]:
    """
    Resolves base directory, target directory, and prefix.
    Supports subdirectories like 'ltx/ds_video' or 'ltx/'.
    Ensures target directory is created if missing and contained within base_dir.
    Returns: (base_dir, target_dir, prefix)
    """
    raw_prefix = str(filename_prefix or "").strip().strip('"').strip("'")
    clean_prefix = sanitize_path_prefix(raw_prefix, fallback_prefix)

    base_dir = (
        folder_paths.get_output_directory()
        if save_output
        else folder_paths.get_temp_directory()
    )
    base_dir = os.path.abspath(base_dir)

    # Check if raw prefix ends with slash (indicating entire input is a subfolder)
    if raw_prefix.endswith(("/", "\\")):
        sub_dir = clean_prefix
        prefix = fallback_prefix
    elif "/" in clean_prefix:
        sub_dir, prefix = os.path.split(clean_prefix)
    elif os.path.isdir(os.path.join(base_dir, clean_prefix)):
        sub_dir = clean_prefix
        prefix = fallback_prefix
    else:
        sub_dir = ""
        prefix = clean_prefix

    if not prefix:
        prefix = fallback_prefix

    target_dir = os.path.abspath(os.path.join(base_dir, sub_dir)) if sub_dir else base_dir
    # Security check: ensure target_dir is within base_dir
    try:
        if os.path.commonpath([base_dir, target_dir]) != base_dir:
            target_dir = base_dir
    except Exception:
        target_dir = base_dir

    os.makedirs(target_dir, exist_ok=True)
    return base_dir, target_dir, prefix


def resolve_output_path(
    filename_prefix: str,
    ext: str,
    save_output: bool = True,
    fallback_prefix: str = "DS_Video",
) -> Tuple[str, str, str]:
    """
    Resolves target folder, sequential filename, and absolute path.
    Returns: (target_dir, filename, full_path)
    """
    base_dir, target_dir, prefix = resolve_dir_and_prefix(
        filename_prefix, save_output=save_output, fallback_prefix=fallback_prefix
    )

    # Calculate next sequential counter
    pattern = re.compile(rf"^{re.escape(prefix)}_(\d+)\.{re.escape(ext)}$", re.IGNORECASE)
    max_counter = 0
    try:
        for entry in os.listdir(target_dir):
            m = pattern.match(entry)
            if m:
                try:
                    max_counter = max(max_counter, int(m.group(1)))
                except ValueError:
                    pass
    except Exception:
        pass

    counter = max_counter + 1
    filename = f"{prefix}_{counter:05d}.{ext}"
    full_path = os.path.abspath(os.path.join(target_dir, filename))
    return target_dir, filename, full_path


# ------------------------------------------------------------------
# Audio Serialization Helper
# ------------------------------------------------------------------
def write_temp_wav(audio_dict: Optional[Dict[str, Any]]) -> Optional[str]:
    """Writes ComfyUI audio dict {'waveform': tensor, 'sample_rate': int} to a temporary WAV file."""
    if not isinstance(audio_dict, dict):
        return None
    waveform = audio_dict.get("waveform")
    sample_rate = audio_dict.get("sample_rate")
    if waveform is None or sample_rate is None:
        return None

    if not isinstance(waveform, torch.Tensor):
        try:
            waveform = torch.tensor(waveform)
        except Exception:
            return None

    if waveform.numel() == 0:
        return None

    # Normalization of dimensions: ComfyUI audio is typically [batch, channels, samples] or [channels, samples]
    if waveform.ndim == 3:
        waveform = waveform[0]
    elif waveform.ndim == 1:
        waveform = waveform.unsqueeze(0)

    channels = int(waveform.shape[0])
    sample_rate = int(sample_rate)
    # Target sample rate standardization if needed (44.1k or 48k)
    if sample_rate <= 0:
        sample_rate = 44100

    # Convert float32 [-1.0, 1.0] to int16 PCM
    wav_tensor = waveform.detach().cpu().clamp(-1.0, 1.0)
    audio_pcm = (wav_tensor * 32767.0).numpy().astype(np.int16)

    # Interleave channels for WAV format: [channels, samples] -> [samples, channels]
    if channels > 1:
        interleaved = audio_pcm.T.tobytes()
    else:
        interleaved = audio_pcm.tobytes()

    temp_dir = folder_paths.get_temp_directory()
    os.makedirs(temp_dir, exist_ok=True)
    temp_wav = tempfile.NamedTemporaryFile(suffix=".wav", dir=temp_dir, delete=False)
    temp_path = temp_wav.name
    temp_wav.close()

    try:
        with wave.open(temp_path, "wb") as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(sample_rate)
            wf.writeframes(interleaved)
        return temp_path
    except Exception as e:
        print(f"[DS Video Save] Error writing temp wav: {e}", flush=True)
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        return None


# ------------------------------------------------------------------
# Metadata Serialization & Path Security Helpers
# ------------------------------------------------------------------
def escape_ffmpeg_metadata(key: str, value: str) -> str:
    """Escapes special characters required by FFmpeg's FFMETADATA format."""
    val = str(value)
    val = val.replace("\\", "\\\\").replace(";", "\\;").replace("#", "\\#").replace("=", "\\=").replace("\n", "\\\n")
    return f"{key}={val}"


def create_temp_metadata_file(
    prompt: Optional[Dict[str, Any]],
    extra_pnginfo: Optional[Dict[str, Any]],
) -> Optional[str]:
    """
    Serializes prompt and workflow into a temporary FFmpeg metadata file (FFMETADATA1 format).
    This avoids command-line length limits on Windows and ensures workflow can be recovered.
    """
    meta_dict: Dict[str, Any] = {}
    if prompt:
        meta_dict["prompt"] = prompt
    if extra_pnginfo:
        meta_dict.update(extra_pnginfo)
    if not meta_dict:
        return None

    temp_dir = folder_paths.get_temp_directory()
    os.makedirs(temp_dir, exist_ok=True)
    temp_meta = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", dir=temp_dir, delete=False, encoding="utf-8")
    temp_path = temp_meta.name
    try:
        temp_meta.write(";FFMETADATA1\n")
        meta_json = json.dumps(meta_dict, ensure_ascii=False)
        temp_meta.write(escape_ffmpeg_metadata("comment", meta_json) + "\n")
        if "workflow" in meta_dict:
            temp_meta.write(escape_ffmpeg_metadata("workflow", json.dumps(meta_dict["workflow"], ensure_ascii=False)) + "\n")
        if "prompt" in meta_dict:
            temp_meta.write(escape_ffmpeg_metadata("prompt", json.dumps(meta_dict["prompt"], ensure_ascii=False)) + "\n")
        temp_meta.close()
        return temp_path
    except Exception as e:
        print(f"[DS Video Save] Error writing temp metadata: {e}", flush=True)
        try:
            temp_meta.close()
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception:
            pass
        return None


def is_safe_path(path: str) -> bool:
    """Validates that a path is within allowed ComfyUI directories to prevent path traversal."""
    if not path:
        return False
    try:
        abs_path = os.path.abspath(path)
        allowed_dirs = [
            os.path.abspath(folder_paths.get_output_directory()),
            os.path.abspath(folder_paths.get_temp_directory()),
            os.path.abspath(folder_paths.get_input_directory()),
            os.path.abspath(folder_paths.base_path),
        ]
        return any(os.path.commonpath([d, abs_path]) == d for d in allowed_dirs if os.path.isdir(d))
    except Exception:
        return False


_APAD_CACHE: Optional[bool] = None


def supports_apad_whole_dur(ffmpeg_bin: str) -> bool:
    """Checks if the local FFmpeg build supports apad=whole_dur."""
    global _APAD_CACHE
    if _APAD_CACHE is not None:
        return _APAD_CACHE
    try:
        res = subprocess.run([ffmpeg_bin, "-h", "filter=apad"], capture_output=True, text=True, timeout=2.0)
        _APAD_CACHE = "whole_dur" in (res.stdout or "")
    except Exception:
        _APAD_CACHE = False
    return _APAD_CACHE


def register_video_save_routes():
    """Safely registers the HTTP routes required by DS Video Save."""
    if server.PromptServer.instance is None or server.PromptServer.instance.routes is None:
        return
    routes = server.PromptServer.instance.routes

    def _is_registered(method: str, path: str) -> bool:
        for r in routes:
            if getattr(r, "method", "").upper() == method.upper() and getattr(r, "path", "") == path:
                return True
        return False

    if not _is_registered("GET", "/ds/video_save/preview"):
        @routes.get("/ds/video_save/preview")
        async def video_save_preview(request):
            try:
                path = request.query.get("path", "")
                path = str(path or "").strip().strip('"').strip("'")
                if not path or not os.path.isfile(path):
                    return web.Response(status=404)
                if not is_safe_path(path):
                    return web.Response(status=403, text="Forbidden path")

                ext = os.path.splitext(path)[1].lower()
                content_type_map = {
                    ".mp4": "video/mp4",
                    ".webm": "video/webm",
                    ".mov": "video/quicktime",
                    ".mkv": "video/x-matroska",
                    ".gif": "image/gif",
                    ".webp": "image/webp",
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                }
                content_type = content_type_map.get(ext) or mimetypes.guess_type(path)[0] or "application/octet-stream"
                filename = os.path.basename(path)
                safe_filename = filename.replace("\\", "\\\\").replace('"', '\\"')
                headers = {
                    "Content-Type": content_type,
                    "Content-Disposition": f"inline; filename=\"{safe_filename}\"",
                }
                return web.FileResponse(path, headers=headers)
            except (asyncio.CancelledError, ConnectionResetError):
                raise
            except Exception as e:
                return web.Response(status=500, text=str(e))

    if not _is_registered("POST", "/ds/video_save/open"):
        @routes.post("/ds/video_save/open")
        async def video_save_open(request):
            try:
                data = await request.json()
                path = str(data.get("path", "")).strip().strip('"').strip("'")
                if not path or not os.path.isfile(path) or not is_safe_path(path):
                    return web.json_response({"success": False, "error": "File not found or invalid"}, status=404)
                if os.name == "nt":
                    os.startfile(path)
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", path])
                else:
                    subprocess.Popen(["xdg-open", path])
                return web.json_response({"success": True})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

    if not _is_registered("POST", "/ds/video_save/folder"):
        @routes.post("/ds/video_save/folder")
        async def video_save_folder(request):
            try:
                data = await request.json()
                path = str(data.get("path", "")).strip().strip('"').strip("'")
                prefix = str(data.get("prefix", "")).strip().strip('"').strip("'")

                base_dir = folder_paths.get_output_directory()
                folder = None

                if path and os.path.exists(path) and is_safe_path(path):
                    folder = path if os.path.isdir(path) else os.path.dirname(path)

                if not folder and prefix:
                    clean = sanitize_path_prefix(prefix)
                    if prefix.strip().endswith(("/", "\\")):
                        sub_dir = clean
                    else:
                        sub_dir = os.path.dirname(clean)
                    if sub_dir:
                        folder = os.path.abspath(os.path.join(base_dir, sub_dir))

                if not folder or not is_safe_path(folder):
                    folder = os.path.abspath(base_dir)

                os.makedirs(folder, exist_ok=True)
                if os.name == "nt":
                    os.startfile(folder)
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", folder])
                else:
                    subprocess.Popen(["xdg-open", folder])
                return web.json_response({"success": True})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

    if not _is_registered("GET", "/ds/video_save/state"):
        @routes.get("/ds/video_save/state")
        async def video_save_state(request):
            try:
                nodes_state = getattr(DS_VideoSave, "LAST_STATE", {})
                return web.json_response({"nodes": nodes_state})
            except Exception as e:
                return web.json_response({"nodes": {}, "error": str(e)})


# ------------------------------------------------------------------
# Video Save Node Implementation
# ------------------------------------------------------------------
class AnyType(str):
    def __ne__(self, other):
        return False

    def __eq__(self, other):
        return True


ANY = AnyType("*")


class DS_VideoSave:
    LAST_STATE: Dict[str, Any] = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Images": ("IMAGE",),
            },
            "optional": {
                "Audio": ("AUDIO",),
                "FPS": (ANY,),
                "Meta_batch": ("*",),
            },
            "hidden": {
                "filename_prefix": ("STRING", {"default": "DS_Video"}),
                "loop_count": ("INT", {"default": 0, "min": 0, "max": 100, "step": 1}),
                "pix_fmt": ("STRING", {"default": "yuv420p"}),
                "crf": ("INT", {"default": 12, "min": 0, "max": 51, "step": 1}),
                "save_metadata": ("BOOLEAN", {"default": True}),
                "trim_to_audio": ("BOOLEAN", {"default": False}),
                "lossless": ("BOOLEAN", {"default": True}),
                "save_output": ("BOOLEAN", {"default": True}),
                "selected_format": ("STRING", {"default": "h264-mp4"}),
                "active_category": ("STRING", {"default": "Video"}),
                "config_json": ("STRING", {"default": ""}),
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("LIST",)
    RETURN_NAMES = ("Filenames",)
    OUTPUT_NODE = True
    CATEGORY = "☠️ Deathshot Arsenal/🎬 Video"
    FUNCTION = "video_save"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Always re-execute on queue so new videos or updated counters are produced
        return float("nan")

    def video_save(
        self,
        Images: torch.Tensor,
        Audio: Optional[Dict[str, Any]] = None,
        FPS: Optional[Any] = None,
        Meta_batch: Optional[Any] = None,
        filename_prefix: str = "DS_Video",
        loop_count: int = 0,
        pix_fmt: str = "yuv420p",
        crf: int = 12,
        save_metadata: bool = True,
        trim_to_audio: bool = False,
        lossless: bool = True,
        save_output: bool = True,
        selected_format: str = "h264-mp4",
        active_category: str = "Video",
        config_json: str = "",
        prompt: Optional[Dict[str, Any]] = None,
        extra_pnginfo: Optional[Dict[str, Any]] = None,
        unique_id: Optional[str] = None,
        **kwargs,
    ):
        # 1. Validation of empty image batch
        if Images is None or getattr(Images, "shape", None) is None or Images.shape[0] == 0:
            raise ValueError("DS Video Save: Input Images batch is empty")

        fps = FPS if FPS is not None else kwargs.get("fps", None)

        # 2. Parse config_json if provided from frontend UI
        if config_json:
            try:
                cfg = json.loads(config_json)
                if isinstance(cfg, dict):
                    if "active_category" in cfg:
                        active_category = str(cfg["active_category"])
                    if "selected_format" in cfg:
                        selected_format = str(cfg["selected_format"])
                    if "prefix" in cfg:
                        filename_prefix = str(cfg["prefix"])
                    elif "filename_prefix" in cfg:
                        filename_prefix = str(cfg["filename_prefix"])
                    if "loop_count" in cfg:
                        loop_count = int(cfg["loop_count"])
                    if "pix_fmt" in cfg:
                        pix_fmt = str(cfg["pix_fmt"])
                    if "crf" in cfg:
                        crf = int(cfg["crf"])
                    if "save_metadata" in cfg:
                        save_metadata = bool(cfg["save_metadata"])
                    if "trim_to_audio" in cfg:
                        trim_to_audio = bool(cfg["trim_to_audio"])
                    if "lossless" in cfg:
                        lossless = bool(cfg["lossless"])
                    if "save_output" in cfg:
                        save_output = bool(cfg["save_output"])
                    if fps is None and "fps" in cfg:
                        try:
                            fps = float(cfg["fps"])
                        except (ValueError, TypeError):
                            pass
            except Exception as e:
                print(f"[DS Video Save] Note: config_json parse fallback: {e}", flush=True)

        if fps is None and "fps" in kwargs:
            fps = kwargs["fps"]

        if fps is not None:
            try:
                if isinstance(fps, dict):
                    found_fps = None
                    for k in ("loaded_fps", "source_fps", "fps", "frame_rate"):
                        if k in fps and fps[k] is not None:
                            try:
                                found_fps = float(fps[k])
                                break
                            except (ValueError, TypeError):
                                pass
                    fps = found_fps
                elif isinstance(fps, (list, tuple)) and len(fps) > 0:
                    fps = fps[0]
                if hasattr(fps, "item"):
                    fps = fps.item()
                if fps is not None:
                    fps = float(fps)
            except Exception:
                fps = None

        if fps is None or fps <= 0:
            fps = 24.0

        num_frames, height, width = Images.shape[0], Images.shape[1], Images.shape[2]

        # 3. Handle Category & Formats
        fallback_notice = None
        saved_paths: List[str] = []
        has_audio = False

        # Handle Image formats
        if active_category == "Image" or selected_format in {"image/gif", "image/webp"}:
            fmt = selected_format.lower()
            duration_ms = max(1, int(round(1000.0 / fps)))
            pil_frames = [
                Image.fromarray((Images[i].detach().cpu().clamp(0.0, 1.0).numpy() * 255.0).astype(np.uint8))
                for i in range(num_frames)
            ]

            if fmt == "image/webp":
                target_dir, filename, full_path = resolve_output_path(
                    filename_prefix, "webp", save_output=save_output, fallback_prefix="DS_Webp"
                )
                save_kwargs: Dict[str, Any] = {
                    "save_all": True,
                    "append_images": pil_frames[1:] if len(pil_frames) > 1 else [],
                    "duration": duration_ms,
                    "loop": loop_count,
                    "lossless": lossless,
                    "quality": 100 if lossless else 90,
                }
                if save_metadata:
                    exif = Image.Exif()
                    if prompt is not None:
                        exif[0x0110] = f"prompt:{json.dumps(prompt, ensure_ascii=False)}"
                    if extra_pnginfo is not None and "workflow" in extra_pnginfo:
                        exif[0x010f] = f"workflow:{json.dumps(extra_pnginfo['workflow'], ensure_ascii=False)}"
                    elif extra_pnginfo is not None:
                        for k, v in extra_pnginfo.items():
                            exif[0x010f] = f"{k}:{json.dumps(v, ensure_ascii=False)}"
                    save_kwargs["exif"] = exif

                pil_frames[0].save(full_path, "WEBP", **save_kwargs)
                saved_paths.append(full_path)

            else:  # image/gif
                target_dir, filename, full_path = resolve_output_path(
                    filename_prefix, "gif", save_output=save_output, fallback_prefix="DS_Gif"
                )
                save_kwargs: Dict[str, Any] = {
                    "save_all": True,
                    "append_images": pil_frames[1:] if len(pil_frames) > 1 else [],
                    "duration": duration_ms,
                    "loop": loop_count,
                    "disposal": 2,
                }
                if save_metadata:
                    meta_dict: Dict[str, Any] = {}
                    if prompt:
                        meta_dict["prompt"] = prompt
                    if extra_pnginfo:
                        meta_dict.update(extra_pnginfo)
                    if meta_dict:
                        save_kwargs["comment"] = json.dumps(meta_dict, ensure_ascii=False)

                pil_frames[0].save(full_path, "GIF", **save_kwargs)
                saved_paths.append(full_path)

        # Handle Video formats
        else:
            saved_paths, fallback_notice, has_audio = self._encode_video_ffmpeg(
                Images=Images,
                Audio=Audio,
                fps=fps,
                filename_prefix=filename_prefix,
                selected_format=selected_format,
                loop_count=loop_count,
                pix_fmt=pix_fmt,
                crf=crf,
                save_metadata=save_metadata,
                trim_to_audio=trim_to_audio,
                save_output=save_output,
                prompt=prompt,
                extra_pnginfo=extra_pnginfo,
            )

        primary_path = saved_paths[0] if saved_paths else ""
        if unique_id and primary_path:
            DS_VideoSave.LAST_STATE[str(unique_id)] = {
                "last_path": primary_path,
                "format": selected_format,
                "fps": fps,
                "has_audio": has_audio,
            }
        print(f"[DS Video Save] Successfully exported: {primary_path} (Total files: {len(saved_paths)})", flush=True)

        # Build UI return payload
        ui_item = {
            "filename": os.path.basename(primary_path),
            "subfolder": os.path.relpath(
                os.path.dirname(primary_path),
                folder_paths.get_output_directory() if save_output else folder_paths.get_temp_directory(),
            ).replace("\\", "/"),
            "type": "output" if save_output else "temp",
            "format": selected_format,
            "fps": fps,
            "fullpath": primary_path,
            "fallback": fallback_notice,
            "has_audio": has_audio,
        }
        if ui_item["subfolder"] in {".", ""}:
            ui_item["subfolder"] = ""

        return {
            "ui": {
                "video": [ui_item],
                "last_path": [primary_path],
                "has_audio": [has_audio],
                "fallback": [fallback_notice] if fallback_notice else [],
            },
            "result": (FilenamesResult(saved_paths),),
        }

    # ------------------------------------------------------------------
    # FFmpeg Streaming Video Encoder
    # ------------------------------------------------------------------
    def _encode_video_ffmpeg(
        self,
        Images: torch.Tensor,
        Audio: Optional[Dict[str, Any]],
        fps: float,
        filename_prefix: str,
        selected_format: str,
        loop_count: int,
        pix_fmt: str,
        crf: int,
        save_metadata: bool,
        trim_to_audio: bool,
        save_output: bool,
        prompt: Optional[Dict[str, Any]],
        extra_pnginfo: Optional[Dict[str, Any]],
    ) -> Tuple[List[str], Optional[str], bool]:
        ffmpeg_bin = get_ffmpeg_path()
        num_frames = Images.shape[0]
        H, W = int(Images.shape[1]), int(Images.shape[2])
        # FFmpeg requires even dimensions for YUV formats
        even_w = W if W % 2 == 0 else W - 1
        even_h = H if H % 2 == 0 else H - 1

        fallback_notice: Optional[str] = None

        # 1. Check for PNG sequence formats
        if selected_format in {"8bit-png", "16bit-png"}:
            is_16bit = (selected_format == "16bit-png")
            base_dir, target_dir, prefix = resolve_dir_and_prefix(
                filename_prefix, save_output=save_output, fallback_prefix="DS_Video"
            )

            pattern = re.compile(rf"^{re.escape(prefix)}_(\d{{5}})_(\d{{5}})\.png$", re.IGNORECASE)
            max_batch = 0
            try:
                for entry in os.listdir(target_dir):
                    m = pattern.match(entry)
                    if m:
                        max_batch = max(max_batch, int(m.group(1)))
            except Exception:
                pass
            batch_counter = max_batch + 1

            output_paths: List[str] = []
            if is_16bit:
                pattern_path = os.path.join(target_dir, f"{prefix}_{batch_counter:05d}_%05d.png")
                cmd = [
                    ffmpeg_bin, "-y",
                    "-f", "rawvideo", "-vcodec", "rawvideo",
                    "-s", f"{W}x{H}", "-pix_fmt", "rgb48le", "-r", str(fps),
                    "-i", "-",
                    "-c:v", "png", "-pix_fmt", "rgb48be",
                    "-start_number", "0",
                    pattern_path,
                ]
                startupinfo = None
                if os.name == "nt":
                    startupinfo = subprocess.STARTUPINFO()
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                proc = subprocess.Popen(
                    cmd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    startupinfo=startupinfo,
                )

                stderr_chunks: List[bytes] = []
                def _drain_png_stderr():
                    try:
                        while True:
                            c = proc.stderr.read(4096)
                            if not c:
                                break
                            stderr_chunks.append(c)
                    except Exception:
                        pass
                stderr_th = threading.Thread(target=_drain_png_stderr, daemon=True)
                stderr_th.start()

                for idx in range(num_frames):
                    arr_16 = (Images[idx].detach().cpu().clamp(0.0, 1.0).numpy() * 65535.0).astype(np.uint16)
                    output_paths.append(os.path.join(target_dir, f"{prefix}_{batch_counter:05d}_{idx:05d}.png"))
                    try:
                        proc.stdin.write(arr_16.tobytes())
                    except (BrokenPipeError, OSError):
                        break

                try:
                    proc.stdin.flush()
                except Exception:
                    pass
                try:
                    proc.stdin.close()
                except Exception:
                    pass
                proc.wait()
                stderr_th.join(timeout=5.0)
                if proc.returncode != 0:
                    err_msg = b"".join(stderr_chunks).decode("utf-8", errors="replace")
                    raise RuntimeError(f"FFmpeg 16-bit PNG sequence failed: {err_msg}")
            else:
                for idx in range(num_frames):
                    frame_name = f"{prefix}_{batch_counter:05d}_{idx:05d}.png"
                    frame_path = os.path.join(target_dir, frame_name)
                    frame_data = Images[idx].detach().cpu().clamp(0.0, 1.0).numpy()
                    arr_8 = (frame_data * 255.0).astype(np.uint8)
                    pil_img = Image.fromarray(arr_8)

                    pnginfo = None
                    if save_metadata and idx == 0:
                        pnginfo = PngImagePlugin.PngInfo()
                        if prompt:
                            pnginfo.add_text("prompt", json.dumps(prompt, ensure_ascii=False))
                        if extra_pnginfo:
                            for k, v in extra_pnginfo.items():
                                pnginfo.add_text(k, json.dumps(v, ensure_ascii=False))

                    pil_img.save(frame_path, "PNG", pnginfo=pnginfo, compress_level=4)
                    output_paths.append(frame_path)

            return output_paths, None, False

        # 2. Determine container extension and video codec parameters
        ext = "mp4"
        vcodec = "libx264"
        custom_pix_fmt = pix_fmt if pix_fmt in {"yuv420p", "yuv420p10le"} else "yuv420p"
        extra_video_args: List[str] = []
        is_prores = False
        is_gif = False

        if selected_format == "h264-mp4":
            ext = "mp4"
            vcodec = "libx264"
            extra_video_args = ["-crf", str(crf), "-preset", "medium"]

        elif selected_format == "h265-mp4":
            ext = "mp4"
            vcodec = "libx265"
            extra_video_args = ["-crf", str(crf), "-preset", "medium"]

        elif selected_format == "nvenc_h264-mp4":
            ext = "mp4"
            if is_nvenc_available("h264_nvenc"):
                vcodec = "h264_nvenc"
                extra_video_args = ["-cq:v", str(crf), "-preset", "p4"]
            else:
                fallback_notice = "h264_nvenc not available. Fell back to libx264 CPU encoder."
                vcodec = "libx264"
                extra_video_args = ["-crf", str(crf), "-preset", "medium"]

        elif selected_format == "nvenc_hevc-mp4":
            ext = "mp4"
            if is_nvenc_available("hevc_nvenc"):
                vcodec = "hevc_nvenc"
                extra_video_args = ["-cq:v", str(crf), "-preset", "p4"]
                if custom_pix_fmt == "yuv420p10le":
                    custom_pix_fmt = "p010le"
            else:
                fallback_notice = "hevc_nvenc not available. Fell back to libx265 CPU encoder."
                vcodec = "libx265"
                extra_video_args = ["-crf", str(crf), "-preset", "medium"]

        elif selected_format == "nvenc_av1-mp4":
            ext = "mp4"
            if is_nvenc_available("av1_nvenc"):
                vcodec = "av1_nvenc"
                extra_video_args = ["-cq:v", str(crf), "-preset", "p4"]
            else:
                fallback_notice = "av1_nvenc not available. Fell back to libsvtav1 CPU encoder."
                vcodec = "libsvtav1"
                extra_video_args = ["-crf", str(crf), "-preset", "6"]

        elif selected_format == "av1-webm":
            ext = "webm"
            vcodec = "libsvtav1"
            extra_video_args = ["-crf", str(crf), "-preset", "6"]

        elif selected_format == "webm":
            ext = "webm"
            vcodec = "libvpx-vp9"
            extra_video_args = ["-crf", str(crf), "-b:v", "0"]

        elif selected_format == "ProRes":
            ext = "mov"
            vcodec = "prores_ks"
            custom_pix_fmt = "yuv422p10le"
            extra_video_args = ["-profile:v", "3"]  # ProRes 422 HQ
            is_prores = True

        elif selected_format == "ffv1-mkv":
            ext = "mkv"
            vcodec = "ffv1"
            extra_video_args = ["-level", "3"]

        elif selected_format == "ffmpeg-gif":
            ext = "gif"
            is_gif = True

        else:
            ext = "mp4"
            vcodec = "libx264"
            extra_video_args = ["-crf", str(crf), "-preset", "medium"]

        # 3. Resolve target destination path
        target_dir, filename, full_path = resolve_output_path(
            filename_prefix, ext, save_output=save_output, fallback_prefix="DS_Video"
        )

        # 4. Handle Audio if provided
        temp_audio_file = None
        has_audio = False
        if not is_gif and Audio is not None:
            temp_audio_file = write_temp_wav(Audio)
            has_audio = bool(temp_audio_file and os.path.exists(temp_audio_file))

        # 5. Handle Metadata file
        temp_metadata_file = None
        if save_metadata and not is_gif:
            temp_metadata_file = create_temp_metadata_file(prompt, extra_pnginfo)

        video_duration = float(num_frames) / float(fps)

        # 6. Build FFmpeg command
        cmd: List[str] = [
            ffmpeg_bin,
            "-y",
            "-v", "warning",
        ]

        # In FFmpeg, -stream_loop applies to the input that follows it
        if loop_count > 0 and ext in {"mp4", "webm", "mkv", "mov"}:
            cmd.extend(["-stream_loop", str(loop_count)])

        # Input 0: Raw video frames via stdin
        cmd.extend([
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{W}x{H}",
            "-pix_fmt", "rgb24",
            "-r", str(fps),
            "-i", "-",
        ])

        input_count = 1

        # Input 1: Audio if present
        if temp_audio_file and not is_gif:
            cmd.extend(["-i", temp_audio_file])
            audio_input_idx = input_count
            input_count += 1
        else:
            audio_input_idx = None

        # Input 2 (or 1): Metadata file if present
        if temp_metadata_file:
            cmd.extend(["-i", temp_metadata_file])
            metadata_input_idx = input_count
            input_count += 1
        else:
            metadata_input_idx = None

        # Video filter options
        vf_filters: List[str] = []
        if (W % 2 != 0 or H % 2 != 0) and not is_gif:
            vf_filters.append(f"crop={even_w}:{even_h}:0:0")

        if is_gif:
            palette_filter = "split[s0][s1];[s0]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[s1][p]paletteuse=dither=sierra2_4a"
            if vf_filters:
                vf_filters.append(palette_filter)
            else:
                vf_filters = [palette_filter]
            cmd.extend(["-vf", ",".join(vf_filters)])
            if loop_count >= 0:
                cmd.extend(["-loop", str(loop_count)])
        else:
            cmd.extend(["-c:v", vcodec])
            cmd.extend(["-pix_fmt", custom_pix_fmt])
            if vf_filters:
                cmd.extend(["-vf", ",".join(vf_filters)])
            cmd.extend(extra_video_args)

        # Audio stream integration
        if temp_audio_file and not is_gif:
            if ext in {"mp4", "mov"}:
                acodec = "pcm_s16le" if is_prores else "aac"
            elif ext == "webm":
                acodec = "libopus"
            elif ext == "mkv":
                acodec = "flac"
            else:
                acodec = "aac"

            cmd.extend(["-c:a", acodec])

            if trim_to_audio:
                cmd.append("-shortest")
            else:
                if supports_apad_whole_dur(ffmpeg_bin):
                    cmd.extend(["-af", f"apad=whole_dur={video_duration:.3f}", "-t", f"{video_duration:.3f}"])
                else:
                    cmd.extend(["-af", "apad", "-t", f"{video_duration:.3f}"])
        else:
            cmd.append("-an")

        # Map metadata from file if present
        if metadata_input_idx is not None:
            cmd.extend(["-map_metadata", str(metadata_input_idx)])

        # MP4 / MOV container flags
        if ext in {"mp4", "mov"} and not is_gif:
            cmd.extend(["-movflags", "+faststart+use_metadata_tags"])

        cmd.append(full_path)

        # 7. Stream frames directly into FFmpeg stdin pipe with concurrent stderr drain
        startupinfo = None
        if os.name == "nt":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        proc = None
        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                startupinfo=startupinfo,
            )

            stderr_chunks: List[bytes] = []

            def _drain_stderr():
                try:
                    while True:
                        chunk = proc.stderr.read(4096)
                        if not chunk:
                            break
                        stderr_chunks.append(chunk)
                except Exception:
                    pass

            stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
            stderr_thread.start()

            broken_pipe = False
            for i in range(num_frames):
                # Clamp and convert single frame directly to uint8
                frame_arr = (Images[i].detach().cpu().clamp(0.0, 1.0).numpy() * 255.0).astype(np.uint8)
                try:
                    proc.stdin.write(frame_arr.tobytes())
                except (BrokenPipeError, OSError):
                    broken_pipe = True
                    break

            try:
                proc.stdin.flush()
            except Exception:
                pass
            try:
                proc.stdin.close()
            except Exception:
                pass

            proc.wait()
            stderr_thread.join(timeout=10.0)

            stderr_text = b"".join(stderr_chunks).decode("utf-8", errors="replace")

            if proc.returncode != 0 or broken_pipe:
                print(f"[DS Video Save] FFmpeg encoding error (code {proc.returncode}): {stderr_text}", flush=True)

                # If NVENC failed at runtime during pipeline, retry with CPU fallback
                if "nvenc" in vcodec:
                    fallback_codec = "libsvtav1" if "av1" in vcodec else ("libx265" if "hevc" in vcodec else "libx264")
                    print(f"[DS Video Save] Retrying with CPU fallback: {fallback_codec}", flush=True)
                    fallback_notice = f"{vcodec} failed at runtime. Fell back to {fallback_codec} CPU encoder."
                    return self._encode_video_ffmpeg(
                        Images=Images,
                        Audio=Audio,
                        fps=fps,
                        filename_prefix=filename_prefix,
                        selected_format=fallback_codec.replace("lib", "") + "-mp4",
                        loop_count=loop_count,
                        pix_fmt=pix_fmt,
                        crf=crf,
                        save_metadata=save_metadata,
                        trim_to_audio=trim_to_audio,
                        save_output=save_output,
                        prompt=prompt,
                        extra_pnginfo=extra_pnginfo,
                    )
                raise RuntimeError(f"FFmpeg failed with returncode {proc.returncode}: {stderr_text.strip() or 'Unknown error'}")

            # Verify output file
            if not os.path.isfile(full_path) or os.path.getsize(full_path) == 0:
                raise RuntimeError(f"FFmpeg exited with code {proc.returncode} but output file is missing or empty: {full_path}")

        finally:
            if proc is not None and proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=2.0)
                except Exception:
                    pass
            if temp_audio_file and os.path.exists(temp_audio_file):
                try:
                    os.remove(temp_audio_file)
                except Exception:
                    pass
            if temp_metadata_file and os.path.exists(temp_metadata_file):
                try:
                    os.remove(temp_metadata_file)
                except Exception:
                    pass

        return [full_path], fallback_notice, has_audio


# Register routes at module load time if server is available
try:
    register_video_save_routes()
except Exception as e:
    print(f"[DS Video Save] Route registration deferred: {e}", flush=True)

