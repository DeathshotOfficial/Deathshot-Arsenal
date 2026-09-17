# DS Show Text — Product Requirements Document

## 1. Overview

**Node:** `DS Show Text`  
**Purpose:** Display a STRING value inside a compact DeathshotArsenal preview while passing the exact same value through to a STRING output.

The node is a presentation/debug utility. It must not transform, trim, normalize, or otherwise alter the incoming string.

## 2. User-facing behavior

### Input

- One required `STRING` input named `text`.
- The native ComfyUI STRING widget remains the workflow serialization source of truth.
- The visible frontend editor is read-only; the node is intended to show the value supplied to it.

### Output

- One `STRING` output named `text`.
- Output is byte-for-byte equivalent to the backend input value after the normal Python STRING conversion used by the node (`None` becomes an empty string).

### Preview

- The node body contains a large read-only multiline text preview field.
- Empty strings display an unobtrusive empty-state placeholder.
- Long/multiline content remains readable with scrolling rather than forcing uncontrolled node growth.
- The preview updates on node execution and when a saved workflow is restored.

### Copy

- A compact icon-only copy button appears in the node header.
- The button uses the Lucide **Copy** icon.
- Clipboard behavior uses the modern Clipboard API where available and falls back to `document.execCommand("copy")` for compatible environments.
- Success and failure are communicated inside the node without interrupting the workflow.
- Copying empty text is allowed and reports success when the browser accepts it.

## 3. Persistence

- The node must remain correctly serialized in ComfyUI workflows.
- The underlying native `text` widget must not be removed from `node.widgets`.
- A lightweight `properties.ds_show_text_value` mirror is stored so the custom UI can restore the last visible value reliably across workflow save/load and frontend lifecycle changes.
- Custom DOM UI itself must not become a second serialized widget value.

## 4. Resizing

- Node is resizable using the standard LiteGraph resize handles.
- Minimum size: **300 × 170 px**.
- Preview fills the available body area and adapts to node resizing.
- DOM-widget hit testing must not swallow LiteGraph resize corners.
- No manual drag handle may be introduced when native resize handles are available.

## 5. Theme Manager integration

- The node must call `window.DSGlobalTheme.bindNode(root, node)`.
- All colors, font variables, control dimensions, borders, and accent states must consume the shared DeathshotArsenal theme tokens.
- Theme changes must update the node live without reloading the workflow.
- The implementation must not hard-code a competing visual system.

## 6. DeathshotArsenal UI requirements

- Follow the centralized DS geometry contract: small shell inset, 5 px-ish control radius, 1 px borders, compact spacing.
- Copy is a bordered icon button; it must not appear as naked text or an unstyled icon floating on the canvas.
- Active/success/error states use theme-aware borders/text rather than solid neon fills.
- The node should remain visually compact and consistent with the existing DS node family.

## 7. Error handling

The frontend must fail gracefully when:

- Clipboard permissions are unavailable.
- Clipboard APIs are unsupported.
- Preview data is malformed or missing.
- Workflow properties are absent or partially populated.
- Theme manager is unavailable during early frontend initialization.
- A node is restored with stale/missing UI state.

Errors must not break node execution or prevent the STRING passthrough output from being produced.

## 8. Backend requirements

The Python implementation should be intentionally minimal:

```text
STRING input -> unchanged STRING output
```

The backend may send the current value through `ui.text_preview` to keep the frontend synchronized after execution. No frontend-only transformation may change the actual STRING output.

## 9. Acceptance criteria

1. `DS Show Text` appears in the DeathshotArsenal node category.
2. A connected STRING input is displayed in the preview.
3. The STRING output exactly matches the input.
4. Copy uses a Lucide Copy icon and successfully copies normal/multiline text where browser permissions allow it.
5. Copy failure is reported without throwing an uncaught frontend error.
6. Saving and reopening a workflow restores the displayed text and node size.
7. Node can be resized down to 300 × 170 px and remains usable.
8. The preview scrolls for large text instead of growing uncontrollably.
9. Changing the DS Theme Manager theme updates the node immediately.
10. The node continues to work when the global theme initializes after the node is created.
11. No unrelated DeathshotArsenal files are changed for this feature.
