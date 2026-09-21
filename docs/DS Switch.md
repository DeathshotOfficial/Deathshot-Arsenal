# DS Switch — Documentation

## 1. Overview

**Node Name:** `DS Switch`  
**Category:** `☠️ Deathshot Arsenal/🔀 Routing`  
**Class:** `DS_Switch`  
**Purpose:** Conditional multi-input router with server-side lazy evaluation for ComfyUI. Directs exactly one active input row out of multiple dynamically created slots to a single output, guaranteeing that unselected branches are never computed upstream.

---

## 2. Core Capabilities

- **Server-Side Lazy Evaluation:** Implements `check_lazy_status` to ensure ComfyUI's execution engine computes *only* the upstream branch connected to the selected row, preventing unselected checkpoints, samplers, or upscalers from consuming GPU cycles.
- **Dynamic Slot Growth:** Automatically spawns a new empty input socket whenever the last socket is connected.
- **Mutually Exclusive Radio Selector:** Interactive frontend controls ensure only one input is toggled active at any time.
- **Universal Wildcard Support:** Compatible with any data type (`IMAGE`, `MODEL`, `CLIP`, `VAE`, `LATENT`, `MASK`, `STRING`, `INT`, `FLOAT`).

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `selected_index` | `INT` | Yes | 0-based index of the active input slot. |
| `input_1` ... `input_N` | `*` (Wildcard) | Optional | Dynamic lazy input slots. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `*` | `*` (Wildcard) | Passthrough of the selected active input value. |

---

## 4. Workflows & Best Practices

1. **Model / Sampler Branch Toggling:** Use `DS Switch` to toggle between SDXL, Flux, or SD1.5 branches without executing all three pipelines.
