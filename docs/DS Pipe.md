# DS Pipe (Universal) — Documentation

## 1. Overview

**Node Names:** `DS Pipe In (Universal)` & `DS Pipe Out (Universal)`  
**Category:** `☠️ Deathshot Arsenal/🔀 Routing`  
**Classes:** `DS_PipeIn`, `DS_PipeOut`  
**Purpose:** Universal multi-bus bus routing and wire decluttering system for ComfyUI. Aggregates up to 64 heterogeneous connections (models, clips, vaes, prompts, latents, masks, images, settings) into a single unified `pipe` cable, transmitting it across large canvas distances to be unpacked cleanly.

---

## 2. Core Capabilities

- **Universal Multi-Type Packing:** Ingests any combination of data types into an ordered `DS_PIPE` payload without rigid schema definitions.
- **Dynamic Slot Naming:** Automatically names unpacked output sockets based on the source nodes and labels connected to `DS Pipe In`.
- **Up to 64 Bus Channels:** Supports massive complex workflows with zero cable clutter.
- **Sub-Graph Organization:** Drastically reduces wire entanglement between separate canvas zones.

---

## 3. Sockets & Connectors

### DS Pipe In

#### Inputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `input_1` ... `input_N` | `*` (Wildcard) | Arbitrary inputs packed into the bus cable in numerical order. |

#### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `pipe` | `DS_PIPE` | Bundled multi-signal bus payload. |

---

### DS Pipe Out

#### Inputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `pipe` | `DS_PIPE` | Connected bus cable from `DS Pipe In`. |

#### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `output_1` ... `output_N` | `*` (Wildcard) | Unpacked signals in identical sequence to `DS Pipe In`. |

---

## 4. Workflows & Best Practices

1. **Clean Canvas Layouts:** Pack `MODEL`, `CLIP`, `VAE`, `POSITIVE`, and `NEGATIVE` into one `pipe` at the loader station and route a single link across the canvas to your KSamplers.
