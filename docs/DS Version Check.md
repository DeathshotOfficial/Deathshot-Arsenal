# DS Version Check — Documentation

## 1. Overview

**Node Name:** `DS Version Check`  
**Category:** `☠️ Deathshot Arsenal/💾 Utilities`  
**Class:** `DS_VersionCheck`  
**Purpose:** Real-time environment diagnostic and package version inspector node for ComfyUI. Displays active version telemetry for ComfyUI core, PyTorch, CUDA, Python, operating system, frontend bundle, and Deathshot Arsenal directly in the canvas.

---

## 2. Core Capabilities

- **Instant Stack Diagnostics:** Queries the host environment and displays:
  - ComfyUI core release version.
  - PyTorch version and compiled CUDA driver toolkit version.
  - ComfyUI Frontend package version.
  - Python runtime version and OS architecture.
  - Deathshot Arsenal version.
- **Copyable Environment Report:** Single-click action to copy clean diagnostic markdown to the clipboard for bug reports and environment auditing.
- **Zero Execution Footprint:** Visual utility node with zero impact on workflow generation execution.

---

## 3. Sockets & Connectors

*Self-contained in-canvas diagnostic node (`OUTPUT_NODE = False`).*

---

## 4. Workflows & Best Practices

1. **Troubleshooting & Support:** Include `DS Version Check` when sharing workflows or reporting issues to quickly confirm driver and package compatibility.
