/**
 * DeathshotArsenal fix for DOM widget cards shrinking after the properties panel opens.
 *
 * ComfyUI frontend 1.51 renders "custom" DOM widgets in the right properties panel
 * through WidgetLegacy, which writes widget.width = <panel width>. The canvas then
 * sizes the card as (widget.width ?? node.width) and never resets it, so the card
 * stays panel-wide and looks shifted left of the node until the page is reloaded.
 *
 * DS cards always fill the node width, so keep widget.width unset on DS DOM widgets.
 */
import { app } from "/scripts/app.js";

function isDSNode(node) {
  return node.constructor?.nodeData?.python_module?.includes("DeathshotArsenal");
}

app.registerExtension({
  name: "DeathshotArsenal.DomWidgetWidthCompat",
  init() {
    const proto = window.LiteGraph?.LGraphNode?.prototype;
    const original = proto?.addDOMWidget;
    if (!original) return;
    proto.addDOMWidget = function (...args) {
      const widget = original.apply(this, args);
      if (widget && isDSNode(this)) {
        Object.defineProperty(widget, "width", { configurable: true, get: () => undefined, set() {} });
      }
      return widget;
    };
  },
});
