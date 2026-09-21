# DS Notes — Documentation

## 1. Overview

**Node Name:** `DS Notes`  
**Category:** `☠️ Deathshot Arsenal/🎨 UI`  
**Class:** `DS_Notes`  
**Purpose:** Rich-text document and workflow documentation node for ComfyUI. Provides an in-canvas compact preview with a comprehensive full-screen popup workspace editor, supporting typography, colored callouts, media cards, dividers, tables, and workflow links.

---

## 2. Core Capabilities

- **Full-Featured WYSIWYG Editor:** Open a spacious popup modal with complete rich text formatting (Headings, Bold, Italic, Underline, Strikethrough, Monospace Code, and Lists).
- **In-Canvas Compact Preview:** Displays formatted HTML directly on the ComfyUI canvas node body, dynamically scaling with zoom and pan.
- **Cyberpunk & Modern Dividers:** Built-in stylized horizontal rules, including Glowing neon lines, gradients, cyber dashes, and minimal lines.
- **Interactive Callout Banners:** Pre-styled callout blocks for `PRO TIP`, `WARNING`, `INFO`, and `ALERT` with embedded icons and editable text.
- **Rich Media & Social Cards:** Embed responsive YouTube preview cards, Discord server badges, action buttons, and decorative SVG icon stamps.
- **Custom Tables & Grids:** Insert structured rows and columns to organize parameter cheatsheets, recommended models, or step-by-step instructions.
- **Embedded Serialization:** Note content, background styles, and settings are preserved in `ds_notes_data`, embedded directly into workflow JSON files and exported PNG metadata (`EXTRA_PNGINFO`).

---

## 3. Sockets & Connectors

*Self-contained in-canvas UI documentation node (`noop`, no execution sockets).*

---

## 4. UI Controls & Workspace

- **Edit Note Button:** Launches the full-screen modal workspace editor.
- **Toolbar:** Floating formatting bar with font styles, colors, alignment, callout generators, and link inserters.
- **Export & Download:** Save notes as clean Markdown, HTML, or plain text for documentation sharing.
- **Canvas Resizing:** Free-form corner resizing to expand note cards to any size on the graph.

---

## 5. Workflows & Best Practices

1. **Workflow Instructions:** Place a `DS Notes` node at the start of complex pipelines to guide users through required models, LoRAs, and resolution settings.
2. **Community Sharing:** Embed your Discord link, tutorial YouTube video, and recommended prompt parameters before exporting workflow templates to Civitai or GitHub.
3. **Change Logs & Version Tracking:** Maintain version notes and update histories right beside upgraded node clusters.
