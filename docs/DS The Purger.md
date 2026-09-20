# DS The Purger — Documentation

## 1. Overview

**Node Name:** `DS The Purger`  
**Category:** `☠️ Deathshot Arsenal/💾 Utilities`  
**Class:** `DS_ThePurger`  
**Purpose:** System-management utility and transparent passthrough node for ComfyUI. Provides direct, safe, and coordinated resource cleanup (Purge All, VRAM, RAM, Models, Cache) from within active workflows without destabilizing execution or terminating processes.

`DS The Purger` operates simultaneously as a **workflow passthrough** and an **execution-time resource cleanup trigger**. Users can insert the node anywhere in a pipeline (e.g. between model loading and sampling, between sampling and upscaling, or prior to preview/save nodes) to reclaim memory precisely when needed.

---

## 2. Core Capabilities

- **Transparent Universal Passthrough:** Accepts any ComfyUI data type (`IMAGE`, `MODEL`, `LATENT`, `CLIP`, `VAE`, `CONDITIONING`, etc.) and outputs the identical value unchanged.
- **Dynamic Type Inference:** Automatically inspects upstream and downstream connections, dynamically resolving slot types and updating LiteGraph wire colors (e.g. `IMAGE` turns blue, `MODEL` turns purple, `LATENT` turns pink).
- **Execution-Time Invocation:** Purge operations are executed strictly when workflow processing reaches the node in the queue. Selecting buttons in the UI sets the target action without running premature or mock purges.
- **Thread-Safe Synchronization:** All cleanup routines run under a dedicated mutex lock (`_PURGE_LOCK`), preventing race conditions, double-free memory conflicts, and pipeline crashes.
- **Genuine Before/After Metrics:** Measures true hardware and system memory allocations before and after execution using `torch.cuda` and `psutil`, reporting accurate freed bytes without simulated or fabricated figures.
- **Ultra-Compact Baseless Surface:** Built on an ultra-compact single horizontal strip (`32px` locked height) rendered in pure Canvas2D, completely free of native browser dropdowns or header chrome.
- **Deathshot Theme Integration:** Automatically subscribes to `DSGlobalTheme` for synchronized colors, contrast-aware active fills, and custom fonts.
- **Live Diagnostics & Auto-Reset:** Displays real-time status (`READY`, `PURGING`, `PURGED`, `PARTIAL`, `FAILED`), automatically resets back to `READY` after 3.5 seconds, and retains full metrics in a persistent hover tooltip.
- **Deathshot Floating Action Toolbar Integration:** Registers with the Deathshot Gear Menu, exposing an interactive configuration popover to reorder or toggle purge actions globally.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `value` | `*` (Dynamic) | Yes | Any compatible ComfyUI data type (`IMAGE`, `MODEL`, `LATENT`, `CLIP`, etc.). Automatically infers and adopts the connected upstream type. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `value` | `*` (Dynamic) | Identical data received at the input, forwarded unchanged with zero computational overhead. |

> [!NOTE]
> `DS The Purger` enforces strictly single-socket geometry (one input on the left boundary, one output on the right boundary). When connected upstream, both sockets dynamically reflect the data type and wire color of the connected link.

---

## 4. Purge Operations & Target Resources

The node provides dedicated cleanup modes selectable via horizontal canvas buttons:

| Action | Description | Primary Cleanup Mechanisms |
| :--- | :--- | :--- |
| **`ALL`** | Coordinated comprehensive cleanup of all resident models, caches, GPU VRAM, and system RAM. | Executes sequential pipeline: Unload Models → Clear Cache → Sync & Flush VRAM → Python GC & Working Set Trim. |
| **`VRAM`** | Reclaims unreferenced GPU allocations and clears allocator caches. | `torch.cuda.synchronize()`, `torch.cuda.empty_cache()`, `torch.cuda.ipc_collect()`, `comfy.model_management.soft_empty_cache()`. |
| **`RAM`** | Collects Python heap garbage and trims process working set. | `gc.collect(2)` across all 3 generations; Windows `psapi.EmptyWorkingSet` process memory trimming. |
| **`MODELS`** | Unloads resident model weights and LoRA cache from memory. | `comfy.model_management.unload_all_models()`, `lora_cache.clear()`, unreferenced model weight release, followed by CUDA memory allocator flush. |
| **`CACHE`** | Flushes disposable framework, node, and CUDA allocator caches. | `comfy.model_management.soft_empty_cache(force=True)`, `torch.cuda.empty_cache()`. |

---

## 5. UI Controls & Visual Design

### Canvas Interface (32px Strip)

```
[● IN]  [ ALL ]  [ VRAM ]  [ RAM ]  [ MODELS ]  [ CACHE ]    [ ● READY ]  [OUT ●]
```

1. **Action Buttons:**
   - Single click selects the active purge action for the next workflow execution.
   - Active button is highlighted with `var(--ds-accent)` fill and contrast-aware typography.
   - Inactive buttons maintain subtle panel backgrounds with theme-adaptive borders and hover highlights.
2. **Status Indicator Pill:**
   - Displays real-time status:
     - `● READY` (Muted/Idle)
     - `● PURGING` (Accent cyan/running)
     - `● PURGED` (Accent cyan/successful)
     - `● PARTIAL` (Amber warning)
     - `● FAILED` (Red error)
   - Automatically resets to `READY` 3.5 seconds after execution ends, or immediately when a new workflow queue starts.
3. **Hover Diagnostics Tooltip:**
   - Hovering over the status pill displays a detailed diagnostic card showing the action taken, status, VRAM freed, RAM freed, and execution time in milliseconds (e.g. `Last Run: ALL • PURGED • VRAM: 3.4 MB • RAM: 614.4 MB • 113.9ms`).
4. **Width Resizing & Persistence:**
   - Dynamically calculates the minimum required width based on active visible buttons.
   - User-resized widths are stored in `properties.custom_width` and persisted across workflow saves and page refreshes. Extra width is distributed proportionally across buttons.

---

## 6. Deathshot Toolbar & Settings Popover

Clicking the gear icon in the Deathshot Floating Action Toolbar opens the **DS The Purger Configuration Popover**:

- **Enable / Disable Buttons:** Toggle switches for each individual action (`ALL`, `VRAM`, `RAM`, `MODELS`, `CACHE`). Disabled actions are removed from the canvas strip, and the node snuggly shrinks to fit.
- **Reorder Actions:** Up/down arrow controls allow custom ordering of buttons on the canvas.
- **Multi-Line Text Readability:** Clean, full-sentence descriptions explaining each purge mode without text truncation or animation jitter.
- **Global Config Persistence:** Settings are saved to `custom_nodes/DeathshotArsenal/config/the_purger.json` and synchronized across all open Purger nodes in real time.
- **Quick Actions:** Includes `Enable All` and `Reset Defaults` buttons in the footer.

---

## 7. Example Workflows

### 1. Mid-Workflow Model Cleanup (Between Generation & Upscaling)
```
Load Checkpoint ──► KSampler ──► DS The Purger (MODELS) ──► Ultimate SD Upscale ──► Preview
```
*Reclaims multi-gigabyte diffusion model weights before the upscaler loads, preventing out-of-memory errors on high-resolution passes.*

### 2. End-of-Workflow VRAM Flush
```
... ──► DS Film Grain ──► DS The Purger (VRAM) ──► DS Image Preview
```
*Passes the final image batch through to preview while releasing CUDA allocator cache and temporary GPU tensor buffers.*

### 3. Queue-to-Queue Clean Slate
```
Load Image ──► DS The Purger (ALL) ──► Image Processing ──► Save Image
```
*Ensures each generation starts with clean RAM and VRAM working sets, preventing gradual memory leaks during large batch runs.*

---

## 8. Technical Architecture

```
                                  [ Workflow Execution ]
                                             │
                                             ▼
                                  [ DS The Purger.purge() ]
                                             │
                             ┌───────────────┴───────────────┐
                             │                               │
                       [ Any Value ]             [ execute_purge_operation() ]
                             │                               │
                             ▼                       [ _PURGE_LOCK ]
                    (Return Unchanged)                       │
                                             ┌───────────────┼───────────────┐
                                             ▼               ▼               ▼
                                         [ Models ]      [ Cache ]     [ VRAM / RAM ]
                                             │               │               │
                                             └───────────────┼───────────────┘
                                                             │
                                                             ▼
                                                    [ Measure Metrics ]
                                                    [ Broadcast Status ]
```

### Safety Guarantees
- **No Force-Kills:** Never calls `os._exit()`, `sys.exit()`, or terminates host processes.
- **Safe Working-Set Trimming:** Windows API `EmptyWorkingSet` releases only idle physical memory pages back to the operating system without unloading loaded DLLs or executable handles.
- **Exception Boundary:** Purge failures are caught and logged without breaking data passthrough, guaranteeing downstream workflow execution continues uninterrupted.
