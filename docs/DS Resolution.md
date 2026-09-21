# DS Resolution — Documentation

## 1. Overview

**Node Name:** `DS Resolution`  
**Category:** `☠️ Deathshot Arsenal/🔢 Values`  
**Class:** `DS_Resolution`  
**Purpose:** Aspect ratio and megapixel-driven dimension calculation utility for ComfyUI. Supplies downstream empty latent image nodes, upscalers, or canvas formatters with exact pixel widths and heights derived from standard photographic aspect ratios, orientation toggles, and megapixel tiers.

---

## 2. Core Capabilities

- **Aspect Ratio Selection:** Clean interactive chip grid featuring standard ratios (`1:1`, `4:5`, `3:4`, `2:3`, `9:16`, `16:9`, `21:9`, `1:2`).
- **Orientation Flipping:** Instant portrait/landscape swap with single-click orientation toggle.
- **Megapixel Targeting:** Scales dimensions to match target megapixel tiers (e.g. `0.5 MP`, `1.0 MP`, `1.5 MP`, `2.0 MP`) while maintaining strict aspect ratios.
- **VAE Multiple Alignment:** Enforces 8-pixel or 16-pixel boundary divisibility for clean latent compression.
- **Dual Outputs:** Clean integer outputs for `width` and `height`.

---

## 3. Sockets & Connectors

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `width` | `INT` | Calculated width in pixels (`64`–`16384`). |
| `height` | `INT` | Calculated height in pixels (`64`–`16384`). |

---

## 4. Workflows & Best Practices

1. **Model Latent Conditioning:** Route `width` and `height` directly into `Empty Latent Image` or `DS Generation Hub` to dynamically swap resolutions across multiple samplers from one centralized node.
