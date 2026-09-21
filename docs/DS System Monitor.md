# DS System Monitor — Documentation

## 1. Overview

**Node Name:** `DS System Monitor`  
**Category:** `☠️ Deathshot Arsenal/🖥️ Monitoring`  
**Class:** `DS_SystemMonitor`  
**Purpose:** Full-featured, expandable system performance and workflow telemetry dashboard for ComfyUI. Provides real-time interactive time-series graphs for GPU, VRAM, CPU, and RAM metrics with customizable update frequencies and persistent layout configurations.

---

## 2. Core Capabilities

- **Interactive Time-Series Telemetry:** Real-time scrolling canvas charts rendering multi-second rolling histories of hardware utilization.
- **Configurable Refresh Intervals:** Independently adjust telemetry poll intervals (`100ms`–`2000ms`) and chart rendering intervals.
- **Persistent Dashboard Dimensions:** Saves custom dashboard widths (`dashW`) and heights (`dashH`) to `config/system_monitor_layout.json`.
- **Non-Intrusive Workflow Execution:** Operates as a visual diagnostic node with zero computational impact on generation queues.

---

## 3. Sockets & Connectors

*Terminal Dashboard Node (`OUTPUT_NODE = True`).*

---

## 4. Workflows & Best Practices

1. **Benchmarking & Pipeline Profiling:** Expand `DS System Monitor` during complex multi-LoRA or high-step video workflows to identify GPU bottlenecks, CPU swap thrashing, or memory saturation.
