# DS Image Checkpoint — Documentation

## 1. Overview

**Node Name:** `DS Image Checkpoint`  
**Category:** `☠️ Deathshot Arsenal/🖼️ Images`  
**Class:** `DS_ImageCheckpoint`  
**Purpose:** Interactive visual execution gate and workflow stage checkpoint for ComfyUI. Pauses multi-stage generation graphs mid-flow to inspect intermediate outputs, allows single-click re-generation or disk saving, and resumes execution into expensive downstream stages (e.g. upscaling, face detailers, video generation) without re-computing upstream samplers.

---

## 2. Core Capabilities

- **Tri-State Execution Gate:**
  - **`Pause`:** Captures intermediate image tensor, saves a temp snapshot on the server, and prunes downstream execution nodes from the prompt queue, allowing user inspection before committing resources.
  - **`Continue`:** Prunes upstream generation nodes, loads the saved snapshot tensor, and runs only downstream nodes (saving GPU hours on multi-stage workflows).
  - **`Pass`:** Functions as a transparent passthrough without interrupting execution flow.
- **Client-Side Prompt Pruning:** Uses prompt interception on the frontend so worker threads are never blocked in Python while waiting for user interaction.
- **Instant Disk Export:** Built-in modal action to copy the active snapshot image directly into ComfyUI's output directory with timestamp and unique IDs.
- **Workflow State Persistence:** Remembers snapshot and mode states across sessions.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `image` | `IMAGE` | Optional | Incoming image tensor `[B, H, W, C]`. Required in `Pause` and `Pass` modes; skipped in `Continue` mode. |

### Hidden & Serialized Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `PauseState` | `STRING` | JSON payload containing current mode (`pause`, `continue`, `pass`). |
| `unique_id` | `UNIQUE_ID` | Internal ComfyUI node ID. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `image` | `IMAGE` | Passthrough or cached snapshot image batch `[B, H, W, C]`. |

---

## 4. Workflows & Best Practices

1. **Upscale Verification Stage:**
   - Insert `DS Image Checkpoint` between your base diffusion sampler and a 4x upscale / tile-diffusion pipeline.
   - Leave node in `Pause`. Run workflow.
   - Inspect the composition. If pleased, click `Continue` to run the heavy upscale. If displeased, click `Regenerate` to roll a new base image with zero wasted upscale compute.
