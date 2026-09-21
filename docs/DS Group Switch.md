# DS Group Switch — Documentation

## 1. Overview

**Node Name:** `DS Group Switch`  
**Category:** `☠️ Deathshot Arsenal/🔀 Routing`  
**Class:** `DS_GroupSwitch`  
**Purpose:** Interactive canvas group bypass and mute controller for ComfyUI. Provides a dedicated dashboard to toggle, bypass, or mute entire visual canvas node groups from a single master control deck without selecting individual nodes.

---

## 2. Core Capabilities

- **Automated Group Discovery:** Detects all visual LiteGraph node groups present on the active ComfyUI canvas.
- **Master Group Toggles:**
  - **Active / Bypass:** Toggles execution state for all nodes enclosed inside the target group.
  - **Mute / Unmute:** Mutes node outputs without deleting wire connections.
- **Chromeless Dashboard:** Clean, compact UI integrating directly with Deathshot's global theme tokens.

---

## 3. Sockets & Connectors

*Self-contained in-canvas group manager (`OUTPUT_NODE = True`).*

---

## 4. Workflows & Best Practices

1. **Modular Workflow Management:** Place `DS Group Switch` at the top of large multi-stage canvases to toggle optional stages (e.g. `Face Detailer Group`, `Upscale Group`, `Watermark Group`) on and off with 1 click.
