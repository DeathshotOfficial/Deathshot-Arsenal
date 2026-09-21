# DS Outpaint Stitch — Documentation

## 1. Overview

**Node Name:** `DS Outpaint Stitch`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_OutpaintStitch`  
**Purpose:** High-fidelity original subject restoration node for generative outpainting workflows in ComfyUI. Restores the pristine, uncompressed original input image back into the model's generated outpaint canvas with sub-pixel alignment using authoritative geometry emitted by `DS Outpaint`, featuring Hermite smoothstep edge feathering and statistical mean/variance color matching.

Generative outpainting models frequently alter the core subject through diffusion noise, slight color balance shifts, or unwanted hallucinations inside the original image area. `DS Outpaint Stitch` solves this by seamlessly compositing the untouched source image back into its exact original coordinates on the generated canvas while feathering the boundary and harmonizing color differences.

---

## 2. Core Capabilities

- **Authoritative Geometry Restoration:** Directly ingests the `outpaint_info` dictionary from `DS Outpaint`, extracting exact bounding box coordinates (`left`, `top`, `source_width`, `source_height`, `scale`) for zero-drift alignment.
- **Proportional Upscale Compensation:** Automatically calculates scale multipliers ($s_x = W_{actual} / W_{canvas}$, $s_y = H_{actual} / H_{canvas}$) if the generated image was resized or upscaled downstream, scaling placement coordinates proportionally without user intervention.
- **Hermite Smoothstep Feathering:** Generates an internal 2D Euclidean distance field from canvas edges and evaluates a cubic Hermite smoothstep curve ($3u^2 - 2u^3$) across a configurable radius (`0` to `2048px`), eliminating harsh boundary seams.
- **Global Statistical Color Matching:** Evaluates channel-wise mean ($\mu$) and standard deviation ($\sigma$) between the generated region and the pristine original, dynamically correcting prompt/sampler color shift across the generated margins.
- **Dual Outputs:**
  - `image`: The final photographic composite with the pristine original seamlessly restored into the outpainted canvas.
  - `mask`: A floating-point alpha mask (`0.0` = pristine original, `1.0` = generated outpaint) ready for secondary refinement, selective inpainting, or detail upscaling.
- **Deathshot Dual-Layer Smart Contrast Sliders:**
  - Horizontal bar sliders with dynamic dual-layer text clipping (`clipPath: inset(...)`).
  - High-contrast text coloring automatically calculated via `DSGlobalTheme` luminance tokens.
  - Smooth pointer drag with fine-adjustment mode via Shift-key (`15%` precision rate).
  - Keyboard arrow navigation and direct double-click inline numeric editing.
- **Batch & Tensor Resiliency:** Automatically handles batch expansion/tiling across differing batch sizes and converts between 1-channel, 3-channel (RGB), and 4-channel (RGBA) tensors seamlessly.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `IMAGE` | Yes | Model-generated outpaint canvas tensor `[B, H, W, C]` (float32, 0.0–1.0). |
| `outpaint_info` | `DS_OUTPAINT_INFO` | Yes | Authoritative metadata dictionary emitted by `DS Outpaint` containing reference image tensor and placement geometry. |

### Optional Inputs & Parameters

| Socket / Parameter | Type | Default | Range | Description |
| :--- | :--- | :---: | :---: | :--- |
| `feather` | `INT` | `64` | `0` – `2048` | Boundary blend transition width in pixels. Evaluates cubic Hermite falloff. |
| `color_match` | `FLOAT` | `1.0` | `0.0` – `2.0` | Statistical color matching strength (`0%` to `200%`). Matches mean and variance of generated margins to original core. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Final restitched composite `[B, H, W, C]` with the pristine original preserved. |
| `mask` | `MASK` | Soft float mask `[B, H, W]` (`0.0` = original, `1.0` = generated outpaint). |

---

## 4. UI Controls & Micro-Geometry

```
┌─────────────────────────────────────────────────────────────┐
│ DS Outpaint Stitch                                          │
├─────────────────────────────────────────────────────────────┤
│ (●) image                                         image (●) │
│ (●) outpaint_info                                  mask (●) │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Feather                                           64 px │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Color match                                       100 % │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Slider Controls

1. **`Feather` (0 to 100px on track; up to 2048px via direct numeric edit):**
   - **`0 px`**: Hard pixel boundary; immediate cut between original and generated pixels.
   - **`64 px` (Default)**: Organic smooth transition suitable for most photographic compositions.
   - **`> 128 px`**: Broad atmospheric fade, ideal when outpainting soft backgrounds, skies, or textured landscapes.
2. **`Color match` (0% to 200%):**
   - **`0 %`**: Disabled. Leaves the model's generated colors unaltered.
   - **`100 %` (Default)**: Full statistical alignment matching the generated region's mean and variance to the pristine image.
   - **`150% – 200%`**: Exaggerated tonal alignment for extreme prompt color drift.

### Interaction Contract
- **Drag**: Click and drag horizontally to adjust values.
- **Fine Drag (`Shift + Drag`)**: Slows adjustment rate to 15% for sub-pixel precision.
- **Keyboard (`Arrow Keys`)**: Nudges value by 1 unit (`Shift + Arrow` nudges by 5 units).
- **Direct Entry (`Double Click`)**: Opens an inline numeric input field. Press `Enter` to commit or `Escape` to cancel.

---

## 5. Technical Architecture & Algorithms

### End-to-End Processing Pipeline

```
[Generated Canvas Tensor]               [outpaint_info Dictionary]
          │                                        │
          │                                        ├──► Extract pristine reference image
          │                                        ├──► Extract canvas_w, canvas_h
          │                                        └──► Extract left, top, src_w, src_h
          │                                                    │
          ▼                                                    ▼
[Scale Factor Calculation] ◄───────────────────────────────────┘
   sx = W / canvas_w, sy = H / canvas_h
   x0 = left * sx, y0 = top * sy
   x1 = (left + src_w) * sx, y1 = (top + src_h) * sy
          │
          ▼
[Pristine Interpolation] ──► Bilinear resize pristine to [y1 - y0, x1 - x0] if needed
          │
          ▼
[Statistical Color Match]
   μ_orig, σ_orig = mean/std(pristine)
   μ_gen,  σ_gen  = mean/std(generated)
   I_matched = (I_gen - μ_gen) * (σ_orig / (σ_gen + 1e-5)) + μ_orig
   I_working = (1 - C) * I_gen + C * I_matched
          │
          ▼
[Hermite Distance Field Mask]
   dx = min(x, target_w - 1 - x) [if horizontal pad active]
   dy = min(y, target_h - 1 - y) [if vertical pad active]
   d = min(dx, dy)
   u = clamp(d / feather, 0, 1)
   weight = u * u * (3 - 2 * u)
          │
          ▼
[Alpha Compositing]
   result[:, y0:y1, x0:x1] = pristine * weight + I_working * (1 - weight)
   mask[:, y0:y1, x0:x1]   = 1.0 - weight
          │
          ├──► image [B, H, W, C]
          └──► mask  [B, H, W]
```

### Mathematical Specifications

#### 1. Proportional Geometry Scaling
If an upscaler or resizing node is placed between `DS Outpaint` and `DS Outpaint Stitch`:
$$s_x = \frac{W_{actual}}{W_{canvas}}, \quad s_y = \frac{H_{actual}}{H_{canvas}}$$
$$x_0 = \text{round}(left \times s_x), \quad y_0 = \text{round}(top \times s_y)$$
$$x_1 = \text{round}((left + source\_width) \times s_x), \quad y_1 = \text{round}((top + source\_height) \times s_y)$$

#### 2. Statistical Color Transfer
To harmonize diffusion generation drift across channels:
$$\mu_{orig} = \frac{1}{N} \sum_{i=1}^{N} P_i, \quad \sigma_{orig} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} (P_i - \mu_{orig})^2}$$
$$\mu_{gen} = \frac{1}{M} \sum_{j=1}^{M} G_j, \quad \sigma_{gen} = \sqrt{\frac{1}{M} \sum_{j=1}^{M} (G_j - \mu_{gen})^2}$$
$$G'_{matched} = (G - \mu_{gen}) \times \frac{\sigma_{orig}}{\sigma_{gen} + 10^{-5}} + \mu_{orig}$$
$$G_{final} = \text{clamp}((1 - C) \times G + C \times G'_{matched}, 0.0, 1.0)$$

#### 3. Hermite Smoothstep Blending
The 2D boundary distance $d(x, y)$ is normalized against the feather radius:
$$u = \text{clamp}\left(\frac{d(x, y)}{\text{feather}}, 0.0, 1.0\right)$$
The weight field $W$ evaluates the cubic Hermite polynomial:
$$W(x, y) = u^2 (3 - 2u)$$
- When $u = 0$ (outer edge): $W = 0$, giving 100% generated outpaint.
- When $u = 1$ (deep core): $W = 1$, giving 100% pristine original.
- Between $0 < u < 1$: First derivative $\frac{dW}{du} = 6u(1 - u)$ is zero at both endpoints, ensuring mathematically zero-tangent, artifact-free transitions.

---

## 6. Workflows & Best Practices

1. **Standard Inpainting Outpaint Pipeline:**
   - Connect source image to `DS Outpaint`.
   - Wire `DS Outpaint` output `image` to inpainting sampler (using `VAE Encode (for Inpainting)` with outpaint margin mask).
   - Route sampler `IMAGE` output and `DS Outpaint`'s `outpaint_info` directly into `DS Outpaint Stitch`.
   - The final output retains 100% untouched subject sharpness while extending canvas margins organically.
2. **Upscaled Outpaint Pipeline:**
   - If generating outpaint at lower latent resolution (e.g. 1024px) and then upscaling via an NN model (e.g. 4x-UltraSharp) to 4096px, pass the upscaled image directly to `DS Outpaint Stitch`. It will automatically scale geometry to match the 4096px canvas.
3. **Selective Re-Touch with Mask Output:**
   - Connect `DS Outpaint Stitch` output `mask` into a detailer or second-pass KSampler to perform denoise refinement only across the blended boundary zone.
