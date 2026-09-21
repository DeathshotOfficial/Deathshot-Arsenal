# DS Outpaint & DS Outpaint Stitch — Documentation

## 1. Overview

**Node Names:** `DS Outpaint` & `DS Outpaint Stitch`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Classes:** `DS_Outpaint`, `DS_OutpaintStitch`  
**Purpose:** High-precision, interactive canvas expansion and generative outpainting suite for ComfyUI. Combines real-time client-side canvas preview, ratio-locked or per-side pixel padding, target megapixel scaling, multiple snapping, integrated socket-lane resolution telemetry, and lossless downstream original image restitching with smoothstep feathering and statistical color matching.

---

## 2. Core Capabilities

### DS Outpaint (Canvas Extender)
- **Dual Expansion Modes:**
  - **`To ratio`**: Automatically calculates symmetric or directional padding to achieve exact aspect ratios (e.g. `1:1`, `16:9`, `9:16`, `21:9`, `4:5`, `3:2`).
  - **`By side`**: Precise manual pixel padding per side (`pad_left`, `pad_top`, `pad_right`, `pad_bottom`) up to `16384px`.
- **Directional Bias:** Expand uniformly (`Both`) or anchor to `Left`, `Right`, `Top`, or `Bottom` edges depending on whether the target ratio is wider or taller than the source image.
- **Target Megapixel (MP) Rescaling:** Uniformly rescales the entire canvas (source image + padding) to hit an exact total pixel count (e.g. `1.0 MP`, `1.5 MP`, `2.0 MP`, `3.0 MP`, or custom decimals like `1.3 MP`) while maintaining proportional pad ratios.
- **Dimension Snapping:** Outward multiple snapping (`8`, `16`, `32`, `64`, or custom multiples up to `1024`) ensuring dimensions align with VAE latent downsampling factors (e.g. 8x compression).
- **Socket-Lane Resolution HUD:** High-contrast canvas HUD drawn between the input slot and output slots displaying:
  - Input resolution (`IN: W×H`).
  - Output canvas resolution (`OUT: W×H`).
  - Directional chevron indicator (`❯❯`).
  - Green expansion indicator badge (`OUT ▲`) when canvas padding is active.
- **Real-Time Client-Side Preview:** Interactive canvas viewport showing live padded bounds, directional pad pixel measurement tags, total resolution badge, and safe dimension limits verification (>16,384px or >64 MP safety thresholds).
- **Upstream Image Sniffing:** Automatically queries upstream image sources (direct connections, reroutes, loaders, and preview caches) to display live interactive previews before queuing workflows.
- **Collapsible Compact Interface:** Single-click toggle between full control grid and an ultra-compact 22px summary pill bar.
- **Customizable Preset Drawer:** Dedicated settings popover for toggling aspect ratio chips, managing custom megapixel presets, and choosing pad fill colors.

### DS Outpaint Stitch (Lossless Reconstruction)
- **Authoritative Geometry Restoration:** Re-inserts the pristine, uncompressed original input image back into the model's generated outpaint canvas with sub-pixel alignment using geometry from `outpaint_info`.
- **Hermite Smoothstep Feathering:** Edge-aware boundary blending (0 to 2048px) with quintic Hermite smoothing to prevent harsh seams between generated content and the original image.
- **Global Statistical Color Matching:** Mean and standard deviation color transfer (0% to 200%) matching the tonal balance of generated margins to the pristine original core, eliminating prompt/sampler color drift.
- **Dual Outputs:** Generates both the final composite `IMAGE` and a floating-point `MASK` (0.0 = pristine original, 1.0 = generated outpaint) for downstream refinement, inpainting, or detail upscaling.
- **Dual-Layer Smart Contrast Sliders:** Deathshot horizontal bar sliders with split-boundary text clipping (`clipPath: inset(...)`), Shift-key fine adjustments, arrow navigation, and double-click numeric editing.

---

## 3. Node Specifications

### DS Outpaint

#### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `IMAGE` | Yes | Batch of input images `[B, H, W, C]` (float32, 0.0–1.0). |

#### Hidden & Serialized Parameters

| Parameter | Type | Default | Description |
| :--- | :--- | :---: | :--- |
| `mode` | `STRING` | `"To ratio"` | Expansion mode: `"To ratio"` or `"By side"`. |
| `ratio` | `STRING` | `"3:2"` | Target aspect ratio (e.g. `"1:1"`, `"16:9"`, `"9:16"`, `"21:9"`). |
| `direction` | `STRING` | `"Both"` | Expansion anchor: `"Both"`, `"Left"`, `"Right"`, `"Top"`, or `"Bottom"`. |
| `pad_left` | `INT` | `0` | Manual left padding in pixels (`0` – `16384`). |
| `pad_top` | `INT` | `0` | Manual top padding in pixels (`0` – `16384`). |
| `pad_right` | `INT` | `0` | Manual right padding in pixels (`0` – `16384`). |
| `pad_bottom` | `INT` | `0` | Manual bottom padding in pixels (`0` – `16384`). |
| `snap_enabled` | `BOOLEAN` | `True` | Whether outward dimension snapping is active. |
| `snap_multiple`| `INT` | `8` | Dimension multiple for VAE alignment (`1` – `1024`). |
| `target_mp` | `FLOAT` | `0.0` | Target megapixel scaling (`0.0` = disabled, `0.1` – `100.0`). |
| `fill_color` | `STRING` | `"#808080"` | Hex color string for canvas padding (default neutral gray). |

#### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Padded canvas image batch `[B, H, W, C]` with original placed at designated offsets. |
| `width` | `INT` | Final canvas width in pixels. |
| `height` | `INT` | Final canvas height in pixels. |
| `outpaint_info` | `DS_OUTPAINT_INFO` | Comprehensive geometry and reference dictionary for `DS Outpaint Stitch`. |

---

### DS Outpaint Stitch

#### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `IMAGE` | Yes | Model-generated outpaint canvas `[B, H, W, C]`. |
| `outpaint_info` | `DS_OUTPAINT_INFO` | Yes | Authoritative metadata dictionary emitted by `DS Outpaint`. |
| `feather` | `INT` | No | Feather edge blending width in pixels (`0` – `2048`, default `64`). |
| `color_match` | `FLOAT` | No | Color match strength (`0.0` – `2.0` / `0%` – `200%`, default `1.0`). |

#### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Restitched composite image batch `[B, H, W, C]` with pristine original restored. |
| `mask` | `MASK` | Floating-point alpha mask `[B, H, W]` (`0.0` = pristine original, `1.0` = outpaint). |

---

## 4. Architectural Data Flow & Pipeline

```
 ┌────────────────────────┐
 │   Input Image Tensor   │
 └───────────┬────────────┘
             │
             ▼
 ┌────────────────────────────────────────────────────────┐
 │                      DS Outpaint                       │
 │  1. Determine Base Expansion (Ratio vs By Side)        │
 │  2. Apply Target MP Uniform Rescaling                  │
 │  3. Apply VAE Snap Multiple (Outward Distribution)     │
 │  4. Emit Padded Tensor + Authoritative Geometry Packet │
 └───────────┬────────────────────────────────┬───────────┘
             │                                │
             │ [image]                        │ [outpaint_info]
             ▼                                │
 ┌────────────────────────┐                   │
 │   Diffusion Inpainting │                   │
 │     / Sampler Pass     │                   │
 └───────────┬────────────┘                   │
             │                                │
             │ [image (generated)]            │
             ▼                                ▼
 ┌────────────────────────────────────────────────────────┐
 │                   DS Outpaint Stitch                   │
 │  1. Extract Authoritative Placement Geometry           │
 │  2. Proportionally Rescale if Upscaled Downstream      │
 │  3. Apply Statistical Mean/Variance Color Matching     │
 │  4. Evaluate Hermite Smoothstep 2D Distance Field      │
 │  5. Blend Pristine Original onto Generated Canvas      │
 └───────────┬────────────────────────────────┬───────────┘
             │                                │
             ▼                                ▼
 ┌────────────────────────┐       ┌───────────────────────┐
 │ Restitched Final Image │       │ Outpaint Region Mask  │
 └────────────────────────┘       └───────────────────────┘
```

---

## 5. Parameter Reference & Math Specification

### Aspect Ratio Calculation
When `mode` is set to `"To ratio"`, the aspect ratio $R = W_{target} / H_{target}$ is compared against the input aspect ratio $R_{in} = W_{in} / H_{in}$:
- If $R > R_{in}$, horizontal padding is added:
  $$\Delta W = \lceil H_{in} \times R \rceil - W_{in}$$
  $\Delta W$ is distributed between `left` and `right` according to `direction` (`Left`, `Both`, `Right`).
- If $R < R_{in}$, vertical padding is added:
  $$\Delta H = \lceil W_{in} / R \rceil - H_{in}$$
  $\Delta H$ is distributed between `top` and `bottom` according to `direction` (`Top`, `Both`, `Bottom`).

### Target Megapixel Rescaling
When `target_mp` $> 0$, a uniform scale factor is applied to both the source image and every padding margin:
$$S = \sqrt{\frac{MP \times 10^6}{W_{base} \times H_{base}}}$$
$$W_{scaled} = \text{round}(W_{in} \times S), \quad H_{scaled} = \text{round}(H_{in} \times S)$$
$$\text{pad}' = \text{round}(\text{pad} \times S)$$

This guarantees that the original aspect ratio and the exact visual framing remain identical regardless of the target output resolution.

### VAE Outward Snapping
Latent diffusion architectures require spatial dimensions to be exact multiples of $M$ (typically $8$ or $16$):
$$W_{final} = \lceil W / M \rceil \times M$$
$$H_{final} = \lceil H / M \rceil \times M$$
Any residual padding difference $\delta = W_{final} - W$ is distributed outwards according to the active anchor direction, keeping the source image completely un-distorted.

### Statistical Color Matching
To match tonal drift introduced by diffusion models:
$$\mu_{orig} = \text{mean}(I_{pristine}), \quad \sigma_{orig} = \text{std}(I_{pristine})$$
$$\mu_{gen} = \text{mean}(I_{gen}), \quad \sigma_{gen} = \text{std}(I_{gen})$$
$$I_{matched} = (I_{gen} - \mu_{gen}) \times \frac{\sigma_{orig}}{\sigma_{gen} + 10^{-5}} + \mu_{orig}$$
$$I_{working} = (1 - C) \times I_{gen} + C \times I_{matched}$$
where $C \in [0.0, 2.0]$ is the `color_match` strength.

### Hermite Smoothstep Feathering
Feathering evaluates the 2D Euclidean distance $d(x, y)$ from the original image boundaries towards the center. The normalized distance $u = \text{clamp}(d / \text{feather}, 0.0, 1.0)$ is interpolated via cubic Hermite smoothstep:
$$W(x, y) = u^2 \times (3 - 2u)$$
The final pixel output restores the pristine original with zero boundary artifacts:
$$I_{final} = I_{pristine} \times W + I_{working} \times (1 - W)$$

---

## 6. Best Practices & Workflows

1. **Standard Generative Outpainting:**
   - Connect image to `DS Outpaint`.
   - Set desired ratio (e.g. `16:9` widescreen expansion from a `1:1` square photo).
   - Invert the emitted `mask` or generate a mask with `fill_color` thresholding, then feed to `VAE Encode (for Inpainting)` or an outpaint sampler.
   - Route the sampler output and `outpaint_info` directly into `DS Outpaint Stitch` to ensure the original subject retains 100% photographic fidelity.
2. **Upscaling & Multi-Stage Expansion:**
   - If an upscaler is placed between `DS Outpaint` and `DS Outpaint Stitch`, `DS Outpaint Stitch` automatically detects resolution differences and proportionally scales placement coordinates so the original image aligns perfectly.
3. **Color Matching Fine-Tuning:**
   - Use `color_match = 100%` (default) for seamless transitions in natural photos.
   - Reduce to `0%` if intentional stylistic color grading or lighting changes were prompted in the outpainted region.
