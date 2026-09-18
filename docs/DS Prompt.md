# DS Prompt — Documentation

## 1. Overview

**Node Name:** `DS Prompt`  
**Category:** `☠️ Deathshot Arsenal/✍️ Prompt`  
**Class:** `DS_Prompt`  
**Purpose:** A streamlined, distraction-free multiline prompt editor for ComfyUI. Combines one-click clipboard management, wired LoRA trigger word concatenation, an expandable effective prompt preview, and zoom-aware canvas resizing into a unified interface.

---

## 2. Core Capabilities

- **Multiline Prompt Editing:**
  - High-performance DOM textarea styled to match the active Deathshot theme.
  - Native spellcheck suppression and auto-dirty canvas notification on change.
- **Dynamic LoRA Trigger Concatenation:**
  - Connect optional wired trigger strings (e.g., from LoRA loaders or trigger extraction nodes).
  - Configurable concatenation order: place triggers **Before** or **After** your main prompt text.
  - Intelligent deduplication: prevents duplicate trigger text if the user has already manually included the words in the prompt field.
- **Effective Prompt Preview:**
  - Collapsible preview drawer directly beneath the editor.
  - Displays the live evaluated prompt with wired triggers included as it will be sent to the text encoder.
- **One-Click Toolbar Actions:**
  - **Copy:** Copies the active prompt text to clipboard (or the effective prompt if the preview is expanded) with visual confirmation.
  - **Replace:** One-click replacement of prompt text directly from the system clipboard.
  - **Clear:** Wipes the prompt content with immediate status feedback.
  - **Expand / Collapse:** Toggles the effective prompt preview tray.
  - **Trigger Position Selector:** Segmented switch (`Before` / `After`) controlling trigger placement.
- **Zoom-Compensated Corner Resizing:**
  - Integrated bottom-right resize grip.
  - Automatically divides pointer movement by ComfyUI canvas scale for 1:1 cursor-following resize behavior regardless of zoom level.
- **Seamless State Serialization:**
  - Dual-layer persistence keeps workflow serialization clean and reliable across all modern ComfyUI frontend versions.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `text` | `STRING` | Yes | The primary prompt text typed into the multiline editor. |
| `trigger_position` | `STRING` | No | Placement of wired LoRA triggers relative to the main prompt (`before` or `after`). Default: `after`. |
| `lora_triggers` | `STRING` | No | Optional wired trigger words string. Concatenated with the prompt based on `trigger_position`. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `text` | `STRING` | The effective composed prompt string (prompt + triggers). |

---

## 4. UI Controls & Toolbar

### 1. Toolbar Elements
- **Title & Icon:** Visual node header indicator.
- **Status Indicator:** Displays transient feedback badges (e.g. `Copied`, `Replaced`, `Cleared`).
- **Action Buttons:**
  - `Copy` (Lucide Copy icon): Copies the current prompt or effective prompt to the clipboard.
  - `Replace` (Lucide Refresh / Replace icon): Reads text from the clipboard and replaces the prompt text.
  - `Clear` (Trash icon): Empties the prompt field.
- **Trigger Position Segmented Switch:**
  - `Before`: Prepends wired trigger words before the prompt (`triggers, prompt`).
  - `After`: Appends wired trigger words after the prompt (`prompt, triggers`).
- **Expand Preview Button:** Expands or collapses the "Effective prompt" drawer below the textarea.

### 2. Editor & Preview
- **Prompt Textarea:** Full-bleed editing area for writing positive or negative prompts.
- **Effective Prompt View:** Live read-only drawer reflecting the concatenated result sent to downstream nodes.

### 3. Corner Resize Grip
- Dedicated handle at the bottom-right corner for smooth, intuitive node resizing on the canvas.

---

## 5. Workflow Integration Tips

- **Connecting with LoRAs:** Connect the triggers output from a LoRA loader directly to `lora_triggers`. The final text sent downstream to `CLIP Text Encode` will automatically contain the triggers without having to manually type them.
- **Fast Clipboard Swapping:** Use `Replace` to immediately paste prompt ideas from external sites or clipboard managers without selecting and deleting old text.
