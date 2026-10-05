# DS Notes — Documentation

## 1. Overview

**Node Name:** `DS Notes`  
**Category:** `☠️ Deathshot Arsenal/🎨 UI`  
**Class:** `DS_Notes`  
**Purpose:** Rich-text document and workflow documentation node for ComfyUI. Displays formatted notes directly on the ComfyUI canvas with Card-as-Base architecture and dynamic sizing, paired with a dedicated full-screen popup workspace editor for all content editing, formatting, and rich block insertion.

---

## 2. Core Architecture & Separation of Concerns

- **Canvas Node (Read-Only Content Display):**
  - **Purpose:** The node canvas strictly displays the rendered note content with proper sizing and smooth scrollability.
  - **No In-Node Editing:** Direct editing is disabled on the canvas node to ensure consistent workflow viewing without accidental keystroke interception.
  - **Header Actions:** Contains an **Edit** button (opens the dedicated editor modal) and a **Copy** button (copies plain text with visual feedback).
  - **Clean Content Display:** The card is dedicated exclusively to presenting the formatted documentation with no clutter or status footers on the canvas.
  - **Card-as-Base Geometry:** 5px outer margin from node edge, 10px inner padding (`var(--ds-card-padding)`), and corner resize protection (`protectDSResizeCorners`).

- **Dedicated Workspace Editor (Popup Modal):**
  - **Purpose:** Full-featured, spacious modal window for drafting, formatting, and embedding rich workflow documentation.
  - **Visual WYSIWYG Editor:** Complete formatting toolbar (Headings H1-H3, Bold, Italic, Underline, Strikethrough, Clear).
  - **HTML Code View:** Raw source code editing with clean monospace syntax layout.
  - **Live Preview Simulator:** Real-time preview matching the exact in-canvas card layout.
  - **Tabbed Color Picker:** 2D Sat/Val canvas, hue slider, and 36 color presets for text color, highlight color, and page background color.
  - **Rich Blocks & Inserts:** Callout banners (Tip, Note, Warning, Danger, Success), Code Blocks with copy buttons, interactive Table/Grid matrix picker (up to 8x8), Dividers (Glow, Dashed, Dotted, Double, Solid, Star, Zap, Section text), Action buttons, Folder hints, YouTube cards/embeds, and Discord cards.
  - **Unsaved Changes Guard:** Prompts confirmation before discarding unsaved edits when closing.

---

## 3. Sockets & Connectors

*Self-contained in-canvas UI documentation node (`noop`, no execution sockets).*

---

## 4. Workflows & Best Practices

1. **Workflow Instructions:** Place a `DS Notes` node at the start of complex pipelines to guide users through required models, LoRAs, and resolution settings.
2. **Community Sharing:** Embed your Discord link, tutorial YouTube video, and recommended prompt parameters before exporting workflow templates to Civitai or GitHub.
3. **Change Logs & Version Tracking:** Maintain version notes and update histories right beside upgraded node clusters.

