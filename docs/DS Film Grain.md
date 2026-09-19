# DS Film Grain — Documentation

## 1. Overview

**Node Name:** `DS Film Grain`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_FilmGrain`  
**Purpose:** High-performance, GPU-accelerated photographic film grain processing for ComfyUI featuring real-time interactive WebGL2 live preview, native GLSL ES 3.0 shader execution, and Deathshot signature micro-geometry UI.

`DS Film Grain` applies authentic, organic film emulsion texture to images directly on the GPU. Powered by an integer-hash PCG noise generator with Gaussian distribution approximation and quintic Hermite curve interpolation, it delivers true photographic texture without digital banding or harsh clipping.

---

## 2. Core Capabilities

- **GPU Shader Execution:** Direct GPU rendering via ComfyUI's ANGLE / GLES3 pipeline (`comfy_extras.nodes_glsl`), eliminating per-pixel CPU processing overhead.
- **Dynamic ComfyUI Blueprint Linking:** Automatically links to ComfyUI's official `Film_Grain_15.frag` blueprint on startup, ensuring that upstream shader updates are immediately inherited.
- **Real-Time WebGL2 Live Preview:** Interactive viewport running the exact GLSL ES 3.0 fragment shader in the browser canvas. Adjusting parameters updates shader uniforms live at 60 fps without workflow re-queuing or shader recompilation.
- **Deathshot Horizontal Bar Sliders:** Custom filled-track bar sliders with dual-layer smart text clipping (`clipPath: inset(...)`), smooth pointer dragging, and direct double-click numeric editing without browser spinner controls.
- **Luminance-Based Shadow Focus:** Rec. 709 perceptual luminance weighting (`0.2126 R + 0.7152 G + 0.0722 B`) that naturally concentrates grain density in shadows and midtones while keeping highlights clean without darkening base image tones.
- **Full Workflow Serialization:** Complete parameter persistence across workflow saves, loads, and canvas resizing.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `IMAGE` | Yes | Batch of input images `[B, H, W, C]` (float32, 0.0–1.0). |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Processed output image batch `[B, H, W, C]` with photographic film grain applied. |

---

## 4. UI Controls & Parameters

### Primary Controls (Horizontal Bar Sliders)

#### `Grain Amount`
- **Default:** `0.30` (Range: `0.00` – `1.00`, step `0.01`)
- **Function:** Controls overall grain visibility and intensity.
- **Behavior:** Scales the noise amplitude ($strength = amount \times 0.15$). At `0.00`, grain is bypassed completely. At `0.30`, it produces a subtle, balanced emulsion layer. Higher values increase textural contrast while preserving highlight/shadow boundaries.

#### `Grain Size`
- **Default:** `0.50` (Range: `0.01` – `2.00`, step `0.01`)
- **Function:** Controls the spatial scale and frequency of the grain pattern.
- **Behavior:** Modulates the spatial UV grid frequency ($grainUV = \frac{UV \times resolution}{size}$). Lower values produce fine, dense microscopic grain; higher values yield larger organic clumps.

#### `Color Amount`
- **Default:** `0.00` (Range: `0.00` – `1.00`, step `0.01`)
- **Function:** Blends between monochromatic luminance grain and chromatic RGB grain.
- **Behavior:**
  - `0.00` (Monochrome): All color channels share the same noise scalar, simulating traditional silver-halide black-and-white film.
  - `1.00` (RGB): Red, green, and blue channels receive independent noise offsets, simulating multi-layer color film emulsion dye clouds.

#### `Shadow Focus`
- **Default:** `0.00` (Range: `0.00` – `1.00`, step `0.01`)
- **Function:** Controls tonal weighting across the luminance range.
- **Behavior:** Uses perceptual luminance ($luma = 0.2126R + 0.7152G + 0.0722B$). At `0.00`, grain is distributed uniformly across all tones. At `1.00`, grain is biased into shadows ($weight = 1.0 - luma$), tapering off in pure highlights without altering underlying exposure.

---

### Grain Mode Selection

- **`Smooth` (Default):**
  - Evaluates continuous quintic Hermite interpolated noise (`smoothNoise`).
  - Produces soft, gradual tonal transitions between micro-clusters, ideal for portraits, subtle film looks, and clean AI image finishing.
- **`Grainy`:**
  - Evaluates pure, un-interpolated Gaussian hash noise (`toGaussian`).
  - Delivers crisp, acute silver-halide crystal micro-contrast, resembling pushed high-ISO film stocks (e.g. Kodak Tri-X 400 or Ilford Delta 3200).

---

## 5. Technical Architecture & Shader Engine

### GLSL ES 3.0 Fragment Pipeline

```
[Input Image (u_image0)] ──► Texture Sampling (v_texCoord)
                                     │
                                     ├──► Luminance Rec. 709 Calculation
                                     │
[Grain UV Coordinates]   ──► PCG Hash Generator ──► Central Limit Gaussian (4-sample sum)
                                     │
                                     ├──► Smooth Mode: Quintic Hermite Interpolation
                                     └──► Grainy Mode: Pure Pixel-Aligned Crystal Hash
                                     │
[Chroma Blending]        ──► Mix (Mono ◄──► RGB) via Color Amount
                                     │
[Luminance Weighting]    ──► Mix (1.0 ◄──► 1.0 - Luma) via Shadow Focus
                                     │
[Compositing]            ──► Color + (GrainColor * Strength * LumWeight)
                                     │
                                     ▼
                           [Final Pixel Output]
```

### Randomness & Spatial Stability

The procedural noise is generated via an integer-state PCG hash:

```glsl
uint pcg(uint v) {
    uint state = v * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}
```

This guarantees:
1. Zero repeating patterns or tiling artifacts.
2. Perfect spatial stability across static frames without frame-timing jitter.
3. Deterministic output across different hardware architectures.

---

## 6. Performance & Batch Compatibility

- **Batch Execution:** Fully compatible with ComfyUI image batches `[B, H, W, C]`. All frames in a batch are processed in GPU VRAM with uniform parameter consistency.
- **Uniform Caching:** In the interactive WebGL2 viewport, uniform updates (`u_float0`–`u_float3`, `u_int0`) re-render immediately without recompiling the GLSL shader program.
- **Zero-Copy Pipeline:** Output textures remain in GPU memory during shader passes and convert directly to PyTorch tensors for downstream nodes.
