/**
 * DeathshotArsenal compatibility for ComfyUI-Manager's Fix node (recreate).
 *
 * Current LiteGraph frontends use string node ids. Some Manager versions pass
 * that id directly to LGraphNode.connect(), while connect() only auto-resolves
 * numeric ids. That throws before Manager removes the original node, leaving
 * the replacement stacked on top of it.
 *
 * Resolve string ids here at the LiteGraph boundary. This is intentionally a
 * tiny compatibility shim and does not replace Manager's recreate workflow.
 */
import { app } from "/scripts/app.js";

let patched = false;

function patch() {
  if (patched) return true;
  const LG = window.LiteGraph;
  const proto = LG?.LGraphNode?.prototype;
  if (!proto?.connect) return false;

  const original = proto.connect;
  if (original.__dsStringIdCompat) {
    patched = true;
    return true;
  }

  function connectCompat(slot, target, targetSlot, ...rest) {
    let resolved = target;
    if (typeof target === "string") {
      resolved = this.graph?.getNodeById?.(target) || app?.graph?.getNodeById?.(target) || target;
    }
    return original.call(this, slot, resolved, targetSlot, ...rest);
  }

  connectCompat.__dsStringIdCompat = true;
  connectCompat.__dsOriginal = original;
  proto.connect = connectCompat;
  patched = true;
  console.log("[DeathshotArsenal] LiteGraph string-id connect compatibility enabled.");
  return true;
}

app.registerExtension({
  name: "DeathshotArsenal.NodeFixerCompat",
  setup() {
    if (patch()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (patch() || tries >= 40) clearInterval(timer);
    }, 100);
  },
});
