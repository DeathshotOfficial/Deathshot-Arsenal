# DS Any Switch — Documentation

## 1. Overview

**Node Name:** `DS Any Switch`  
**Category:** `☠️ Deathshot Arsenal/🔀 Routing`  
**Class:** `DS_AnySwitch`  
**Purpose:** Cascading fallback selector that passes through the first non-empty value from an ordered set of wildcard inputs (`any_01`, `any_02`, etc.).

---

## 2. Core Capabilities

- **Cascading Fallback Evaluation:** Evaluates input slots in top-to-bottom order (`any_01`, `any_02`, `any_03`...) and outputs the first slot that contains a valid, non-empty payload.
- **Smart Empty Detection:** Recognizes `None`, empty string `""`, empty dictionaries, or dictionary contexts that contain no usable model/clip pairs as empty.
- **Dynamic Slot Expansion:** Automatically exposes additional fallback sockets as connections are made.
- **Universal Compatibility:** Transparently handles any ComfyUI data type.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `any_01` ... `any_N` | `*` (Wildcard) | Optional | Cascading inputs evaluated in numerical order. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `*` | `*` (Wildcard) | First non-empty value encountered. |

---

## 4. Workflows & Best Practices

1. **Default Value Fallback:** Connect a secondary default prompt or fallback LoRA into `any_02` while leaving `any_01` wired to an optional input node.
