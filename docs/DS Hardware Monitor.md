# DS Hardware Monitor — Documentation

## 1. Overview

**Node Name:** `DS Hardware Monitor`  
**Category:** `☠️ Deathshot Arsenal/🖥️ Monitoring`  
**Class:** `DS_HardwareMonitor`  
**Purpose:** Compact, real-time hardware telemetry and memory management HUD for ComfyUI. Tracks GPU utilization, dedicated VRAM usage, system RAM, CPU load, device temperatures, fan speeds, and power draw with 1-second WebSocket updates and one-click VRAM purge actions.

---

## 2. Core Capabilities

- **Real-Time Telemetry Daemon:** Background monitoring thread probing hardware every 1 second via NVML, `nvidia-smi`, `psutil`, and PyTorch CUDA diagnostics.
- **Tracked Metrics:**
  - **GPU:** Core utilization percentage, device name, temperature (°C), fan speed, and power draw (Watts).
  - **VRAM:** Allocated VRAM, total capacity, free memory, and session peak memory consumption.
  - **CPU & RAM:** Multi-core CPU utilization percentage, used RAM, and total physical memory.
- **One-Click Memory Reclamation:**
  - **`Free VRAM`:** Calls `comfy.model_management.soft_empty_cache()` and releases unallocated PyTorch memory pools.
  - **`Unload Models`:** Fully purges cached diffusion models, VAEs, and CLIP encoders from GPU memory into system RAM without restarting ComfyUI.
- **Zero Graph Overhead:** Operates as a visual-only DOM HUD without affecting prompt execution speed or blocking worker threads.

---

## 3. Sockets & Connectors

*Self-contained in-canvas HUD (`OUTPUT_NODE = False`).*

---

## 4. Workflows & Best Practices

1. **VRAM Spill Prevention:** Keep `DS Hardware Monitor` pinned on the canvas when running heavy Flux, Hunyuan, or SD3.5 workflows to monitor memory spikes before out-of-memory (OOM) errors occur.
