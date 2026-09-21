# DS Control Panel — Documentation

## 1. Overview

**Node Name:** `DS Control Panel`  
**Category:** `☠️ Deathshot Arsenal/🎛️ Control`  
**Class:** `DS_ControlPanel`  
**Purpose:** Centralized workflow dashboard and macro control interface for ComfyUI. Consolidates up to 16 user-defined controls (sliders, numeric steppers, toggles, dropdown combos, text inputs, seed pickers) onto a single sleek panel where each row directly powers an output socket.

---

## 2. Core Capabilities

- **16 Configurable Output Channels:** Emits universal wildcard outputs (`value_1` through `value_16`) that dynamically coerce to integers, floats, booleans, strings, or seeds.
- **Dynamic Control Row Types:**
  - **Integer / Float Sliders:** Configurable min, max, step, and unit suffixes.
  - **Toggle Switches:** Accessible ON/OFF booleans for conditional switches or bypass logic.
  - **Combo Dropdowns:** Pre-populated option lists for mode switching.
  - **Text Fields:** Direct string entry for prompt fragments or prefix/suffix tokens.
  - **Seed Generator:** In-row seed randomizer with randomize/fixed/increment controls.
- **Workflow Streamlining:** Replaces sprawling scattered widget noodles with a single centralized "cockpit" placed at the start of complex workflows.

---

## 3. Sockets & Connectors

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `value_1` – `value_16` | `*` (Wildcard) | Dynamic outputs coerced from the corresponding UI control row. |

---

## 4. Workflows & Best Practices

1. **Master Control Deck:** Wire `value_1` (steps), `value_2` (cfg), `value_3` (denoise), `value_4` (sampler combo), and `value_5` (seed) into multiple KSamplers across a two-stage base+refiner pipeline to synchronize settings from one card.
