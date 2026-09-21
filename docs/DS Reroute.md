# DS Reroute — Documentation

## 1. Overview

**Node Name:** `DS Reroute`  
**Category:** `Routing`  
**Class:** `DS_Reroute`  
**Purpose:** Zero-overhead signal passthrough and wire management junction with an editable descriptive text label.

---

## 2. Core Capabilities

- **Zero Computational Overhead:** Passthrough node with direct memory reference forwarding (`(value,)`).
- **Editable Inline Label:** Displays custom workflow annotations directly on the routing pill (e.g. `Base Model`, `Denoised Latent`, `High-Res Face`).
- **Universal Wildcard Type:** Connects seamlessly to any output or input socket on the canvas.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `value` | `*` (Wildcard) | Yes | Incoming signal. |
| `label` | `STRING` | No | Optional descriptive text note displayed on the junction. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `value` | `*` (Wildcard) | Unmodified passthrough of input value. |
