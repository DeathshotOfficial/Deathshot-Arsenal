# DS Futuristic HUD — Documentation

## 1. Overview

**Node Name:** `DS Futuristic HUD`  
**Category:** `☠️ Deathshot Arsenal/🎨 UI`  
**Class:** `DS_FuturisticHUD`  
**Purpose:** Sci-fi and cyberpunk styled live viewport telemetry heads-up display (HUD) for ComfyUI. Overlays high-tech circular arc gauges and digital readouts on the canvas or screen corners, reporting CPU, GPU, VRAM, RAM, Temperatures, Disk I/O, and Network speeds in real time.

---

## 2. Core Capabilities

- **Always-on-Top Viewport Overlay:** Optional `overlay_mode` pins the HUD to the browser viewport, floating above the canvas during pan and zoom.
- **Corner Anchoring & Layout:** Dock to `Bottom-Right`, `Bottom-Left`, `Top-Right`, or `Top-Left` in horizontal or vertical orientations.
- **Sci-Fi Color Themes:** Presets including `Cyberpunk`, `Sci-Fi Blue`, `Red Alert`, `Matrix`, `Rainbow`, `Dracula`, `Gold`, and fully customizable per-metric hex palettes.
- **Radial Arc Gauges:** Rendered with customizable scale, thickness, and glow effects for:
  - CPU usage & clock activity
  - GPU core load & temperatures
  - VRAM allocated percentage
  - System RAM usage
  - Disk storage utilization
  - Network I/O throughput (Mbps)

---

## 3. Sockets & Connectors

*Self-contained in-canvas HUD overlay (`OUTPUT_NODE = False`).*

---

## 4. Workflows & Best Practices

1. **Stream / Demo Overlay:** Use `DS Futuristic HUD` in `Cyberpunk` mode when recording workflow tutorials or livestreams to display sleek, dynamic hardware metrics.
