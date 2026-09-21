# DS Seed — Documentation

## 1. Overview

**Node Name:** `DS Seed`  
**Category:** `☠️ Deathshot Arsenal/🔢 Values`  
**Class:** `DS_Seed`  
**Purpose:** Dedicated random seed generator and integer controller for ComfyUI. Supplies 64-bit random seeds to samplers with customizable control-after-generate modes (`Randomize`, `Fixed`, `Increment`, `Decrement`).

---

## 2. Core Capabilities

- **64-Bit Integer Support:** Safely operates across values up to `9,007,199,254,740,991` ($2^{53} - 1$).
- **Generation Modes:**
  - **Randomize:** Generates a fresh random integer on every queue.
  - **Fixed:** Locks the current seed to reproduce generations identically.
  - **Increment / Decrement:** Steps the seed by $+1$ or $-1$ sequentially for prompt variations.
- **Master Seed Synchronization:** Connect the single `seed` output to multiple samplers across a pipeline to guarantee identical noise initialization.

---

## 3. Sockets & Connectors

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `seed` | `INT` | 64-bit seed integer. |
