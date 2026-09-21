# DS Prompt Cards — Documentation

## 1. Overview

**Node Name:** `DS Prompt Cards`  
**Category:** `☠️ Deathshot Arsenal/📝 Prompt`  
**Class:** `DS_PromptCards`  
**Purpose:** Visual library and reference card manager for image and video prompting in ComfyUI. Organizes prompt text paired with reference visual assets (poses, characters, cinematic styles, lighting setups) in an interactive card catalogue that persists globally across sessions and workflows.

---

## 2. Core Capabilities

- **Image + Prompt Pairing:** Each card stores an image/video thumbnail alongside its detailed positive/negative prompt string and custom tags.
- **Global Disk Persistence:** Cards are saved globally to `cards/cards.json` on disk, surviving node deletion, workflow resets, or ComfyUI restarts. All instances of `DS Prompt Cards` share this synchronized library.
- **Grid & List Display Modes:** View cards in compact list rows or visual grid tiles with adjustable card sizing (`S`, `M`, `L`).
- **Detail Editing Modal:** Click any card to open a full-resolution inspection modal with a large image viewport and an auto-saving multi-line prompt editor.
- **Organization & Library Management:**
  - Pin important reference cards to the top of the collection.
  - Real-time search filter across prompt text and labels.
  - Drag-and-drop card re-ordering.
  - Export and import entire card libraries as portable JSON bundles.
- **Instant Clipboard Injection:** 1-click copy button to copy full card prompts directly to the system clipboard for immediate pasting into prompt text areas.

---

## 3. Sockets & Connectors

*Self-contained in-canvas library manager. Operates as an interactive utility on the canvas.*

---

## 4. Workflows & Best Practices

1. **Pose & Style Reference Management:** Save recurring character LoRA triggers, camera movement prompts, and lighting recipes as cards to quickly paste them into active generation workflows.
