# DS Randomizer — Documentation

## 1. Overview

**Node Name:** `DS Randomizer`  
**Category:** `☠️ Deathshot Arsenal/✍️ Prompt`  
**Class:** `DS_Randomizer`  
**Purpose:** An intelligent, semantic prompt variation node for DeathshotArsenal that allows users to repeatedly queue workflows while automatically varying selected characteristics (e.g. hair, age, clothing, lighting, camera angle, location) without requiring manual rewrites.

The core operating principle is:
> **Prompt → Analyze → Detect selected attributes → Replace or intelligently weave variations → Output modified prompt**

The user's original prompt is preserved as a permanent template and is never overwritten by generated variations.

---

## 2. Key Features

- **Semantic Category Detection:**
  - Identifies multi-word descriptive spans (e.g., `"long wavy red hair"`, `"wearing an oversized black leather biker jacket"`, `"golden hour sunset light"`).
  - Replaces existing attributes cleanly, stripping orphan color/texture adjectives so descriptions remain natural and uncorrupted.
- **Context-Aware Zone Placement:**
  - Missing attributes are contextually placed into natural semantic zones rather than dumped at the start or blindly appended to the end:
    - **Subject Traits** (`hair`, `skin`, `body`, `tattoos`, `piercings`): Anchored adjacent to the person noun (`woman`, `man`, `girl`, `model`) or after their pose/action clause.
    - **Clothing** (`panties`, `lingerie`, `outfit`): Anchored after the subject/pose, preceding environment prepositions.
    - **Environment & Location** (`location`, `room_environment`): Anchored in the setting description.
    - **Lighting, Time & Atmosphere**: Positioned at the end of the scene or prompt.
    - **Camera & Optics**: Positioned as shot framing or at the prompt end.
- **Tag-Based Contradiction Prevention:**
  - Automatically analyzes the prompt context for environmental conditions and enforces conflict rules (e.g., `night` prevents selecting `midday sunlight`; `indoor` prevents selecting `beach/street`).
  - Runs in `< 0.1ms` with zero VRAM consumption.
- **Multi-Stage & Checkpoint Synchronization:**
  - Fully compatible with `DS Image Checkpoint` and multi-pass workflows (e.g. Base Generation → Pause Checkpoint → Continue to Upscale).
  - **On Regenerate / New Queue**: Automatically draws fresh randomized variations.
  - **On Continue**: Preserves the exact seed and prompt output so downstream upscalers receive the identical prompt, preventing face and clothing redraw artifacts.
- **Live Upstream Prompt Mirroring:**
  - When wired from an upstream node (such as `DS Generation Hub` or `DS_Prompt`), the node detects the wire, mirrors the live prompt into the Source Prompt box, and displays a `(Wired: [Origin])` badge.
- **External Multi-File JSON Database:**
  - Stored in `custom_nodes/DeathshotArsenal/database/randomizer/` partitioned across modular JSON files (`character.json`, `environment.json`, `camera.json`, `clothing.json`).
  - Users can easily add new variations or new JSON files without touching Python or JavaScript code.
- **Non-Repeating Shuffle-Bag Selection:**
  - Guarantees that variations within each category are consumed before repeating, avoiding repetitive outputs across queues.
- **Category Constraints & Adult Content Safety:**
  - Supports category options such as Age Range presets (`Any (18+)`, `18–24`, `25–35`, `36–50`, `50+`).
  - Enforces adult-only constraints, guaranteeing no minor descriptions are ever generated.
- **Interactive Live Preview & Manual Regeneration:**
  - Dedicated "Preview" button in the node header allows instant inspection of variations before queueing.
- **Visual Partition & Strict Deathshot Design:**
  - Pill track for category group tabs (`All`, `Character`, `Clothing`, `Environment`, `Camera`).
  - 1px gradient divider line separating tabs from sub-options.
  - Dedicated sub-options container with active section indicator, counter badge, and `Select All` / `Clear All` controls.

---

## 3. Sockets & Connectors

### Inputs

| Socket | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `prompt` | `STRING` | Yes | The source prompt template typed into the multiline editor. |
| `text` | `STRING` | No | Optional upstream text connection (`forceInput: True`). When connected, incoming text takes precedence and is mirrored live in the UI. |
| `seed` | `INT` | No | Variation seed. Coordinated automatically during multi-stage continue/regenerate passes. |

### Outputs

| Socket | Type | Description |
| :--- | :--- | :--- |
| `text` | `STRING` | The final randomized prompt text sent to downstream nodes (e.g. `CLIP Text Encode`, `KSampler`). |

---

## 4. UI Layout & Sections

### 1. Header Toolbar
- **Title & Icon:** Visual node header (`DS Randomizer` with dice icon).
- **Status Indicator:** Displays transient badges (e.g. `Variation Generated`, `History Reset`, `Copied Prompt`).
- **Actions:**
  - `Preview` (Shuffle / Refresh icon): Requests an immediate randomized preview from the backend.
  - `Reset History` (Rotate Counter-Clockwise icon): Clears the shuffle-bag history for this node.
  - `Copy Prompt` (Copy icon): Copies the source template to clipboard.
  - `Clear` (Trash icon): Clears the prompt editor.

### 2. Section A — Source Prompt (Template)
- Multiline text editor styled to match the active Deathshot theme.
- Displays `(Wired: [Origin])` badge and mirrors incoming text when connected to an upstream prompt generator.
- Holds the canonical template. Keystrokes automatically persist into workflow state.
- Will **never** be overwritten by generated variations.

### 3. Section B — Randomize Categories & Sub-Options
- **Group Tabs Track:** Pill track to filter categories by `All`, `Character / Person`, `Clothing`, `Environment`, or `Camera / Photography`.
- **Partition Divider:** Visual boundary line cleanly dividing navigation tabs from category attributes.
- **Sub-Options Container:**
  - Header showing active section label (e.g. `ALL ATTRIBUTES`, `CHARACTER / PERSON ATTRIBUTES`) and active counter badge.
  - Quick action buttons: `Select All` and `Clear All` for visible attributes.
  - Clickable chips for each category. Active chips display an accent border and bottom 2px accent indicator bar.
  - Dedicated preset selectors (e.g., `Age Range: Any (18+), 18–24, 25–35, 36–50, 50+`).

### 4. Section C — Generated Preview (Output)
- Read-only preview textarea displaying the latest randomized variation.
- Dedicated `Copy Preview` button to grab the output text with one click.
- Automatically updates on workflow queue completion (`onExecuted`) or when clicking the `Preview` toolbar button.

---

## 5. System Architecture: Current System vs. AI-Powered (WIP)

### Multi-Tab Comparison

````carousel
<!-- slide -->
### Tab 1: Current System (Semantic Rule-Based Engine & Shuffle-Bag)

**Architecture Status:** Production Ready (Active)

- **Execution Engine:** Fast Python regex token-span matching + Shuffle-Bag variation selector.
- **Latency:** `< 0.2 ms` (Instantaneous execution).
- **VRAM / RAM Usage:** `0 MB` VRAM. Runs purely on CPU with minimal footprint.
- **Model Dependencies:** None. No weights to download; works immediately offline on any machine.
- **Contradiction Control:** Tag-based matrix (`CONFLICTING_TAGS`) prevents incompatible combinations (e.g., `night` vs `midday sunlight`, `indoor` vs `beach`).
- **Multi-Stage Support:** Seamlessly coordinates with `DS Image Checkpoint` to hold identical prompt text during `continue` (upscale passes) and randomize during `regenerate`.
- **User Control:** 100% predictable and controllable. Outputs only curated attributes from the JSON databases.

<!-- slide -->
### Tab 2: TODO / WIP: AI-Powered Engine (CLIP Semantic Scoring & SLM Expansion)

**Architecture Status:** Planned / In Research & Development (WIP)

- **Planned Capabilities:**
  1. **CLIP Embedding Cosine Similarity (Ranking Mode):**
     - Uses the workflow's existing CLIP text encoder to convert the prompt into a latent embedding vector.
     - Calculates cosine similarity against pre-computed database descriptors to rank the most contextually relevant attributes (e.g. automatically ranking film noir lighting higher for dark moody scenes).
  2. **Small Language Model (SLM) Natural Grammar Weaving:**
     - Optional integration with lightweight local models (e.g., *Qwen-2.5-0.5B-Instruct* or *SuperPrompt-v1*).
     - Rewrites and blends newly injected descriptors into grammatically seamless, complex narrative prose.
  3. **Zero-VRAM Hybrid Toggle:**
     - The AI-powered features will be implemented as an **optional toggle**.
     - When toggled OFF: Defaults to the ultra-fast rule-based system (0 VRAM, < 0.2ms).
     - When toggled ON: Activates CLIP/SLM semantic scoring for users who desire deep linguistic synthesis and have available GPU overhead.
````

---

## 6. Database Architecture & Customization

The randomizer database is located at:
```text
custom_nodes/DeathshotArsenal/database/randomizer/
├── character.json
├── environment.json
├── camera.json
└── clothing.json
```

### Schema Structure
```json
{
  "group": "character",
  "name": "Character / Person",
  "categories": [
    {
      "id": "hair_color",
      "name": "Hair Color",
      "insertion_zone": "subject",
      "detection_terms": [
        "\\b(blonde|brunette|redhead|auburn|jet-black)\\b"
      ],
      "cleanup_patterns": [
        "\\b(blonde|brunette|redhead|auburn|jet-black)\\b"
      ],
      "entries": [
        {"text": "platinum blonde", "tags": ["light"]},
        {"text": "deep raven black", "tags": ["dark"]}
      ]
    }
  ]
}
```

The backend dynamically discovers and indexes all `.json` files in this directory on startup. You can also trigger an immediate database reload without restarting ComfyUI by sending a POST request to `/ds/randomizer/reload_db`.
