// DeathshotArsenal/js/Version Check/ds_version_check.js
import { registerCardNode } from "../UIElements/card_layout.js";
import { DSIcon } from "../UIElements/index.js";

const CSS = "/extensions/DeathshotArsenal/Version%20Check/ds_version_check.css";
const TILE_H = 46;
const TILE_GAP = 6;

if (!document.querySelector(`link[href*="ds_version_check.css"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

const ROWS = [
  { key: "comfyui", label: "ComfyUI", icon: "layers" },
  { key: "frontend", label: "Frontend", icon: "code" },
  { key: "pytorch", label: "PyTorch", icon: "flame" },
  { key: "deathshot", label: "Arsenal", icon: "zap" },
];

async function loadVersions() {
  try {
    const res = await fetch("/ds/version_check");
    if (res.ok) {
      const data = await res.json();
      return { comfyui: data.comfyui, frontend: data.frontend, pytorch: data.pytorch, deathshot: data.deathshot };
    }
  } catch (_) {}
  try {
    const res = await fetch("/system_stats");
    if (res.ok) {
      const sys = (await res.json()).system || {};
      return { comfyui: sys.comfyui_version, frontend: sys.required_frontend_version, pytorch: sys.pytorch_version };
    }
  } catch (_) {}
  return {};
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  el.remove();
  return Promise.resolve();
}

function buildVersionCheck(node, card) {
  node.constructor.title_mode = LiteGraph.NO_TITLE;
  node.flags = node.flags || {};
  node.flags.no_title = true;
  node.title = "";
  node._dsNodeBaseOptOut = true;
  node.bgcolor = "transparent";
  node.color = "transparent";
  node.boxcolor = "transparent";

  let versions = {};
  const values = {};

  const grid = document.createElement("div");
  grid.className = "ds-vc-grid";
  for (const row of ROWS) {
    const tile = document.createElement("div");
    tile.className = "ds-vc-tile";
    const head = document.createElement("div");
    head.className = "ds-vc-tile-label";
    head.append(DSIcon(row.icon, { size: 11 }), row.label);
    const value = document.createElement("div");
    value.className = "ds-vc-tile-value";
    value.textContent = "…";
    tile.append(head, value);
    grid.appendChild(tile);
    values[row.key] = value;
  }

  const render = () => {
    for (const row of ROWS) {
      const v = versions[row.key] || "—";
      values[row.key].textContent = v;
      values[row.key].title = v;
    }
  };

  const refresh = async () => {
    grid.classList.add("is-loading");
    versions = await loadVersions();
    grid.classList.remove("is-loading");
    render();
  };

  const [copyBtn, refreshBtn] = card.ds.root.querySelectorAll(".ds-ui-card-actions .ds-ui-btn");
  copyBtn.addEventListener("click", async () => {
    await copyText(ROWS.map((r) => `${r.key === "deathshot" ? "Deathshot Arsenal" : r.label}:${versions[r.key] || "—"}`).join("\n"));
    copyBtn.replaceChildren(DSIcon("check", { size: 12 }));
    setTimeout(() => copyBtn.replaceChildren(DSIcon("copy", { size: 12 })), 1400);
  });
  refreshBtn.addEventListener("click", refresh);

  card.fixed(grid, { height: TILE_H * 2 + TILE_GAP, interactive: false });
  refresh();
}

registerCardNode("DS_VersionCheck", buildVersionCheck, {
  title: "Versions",
  icon: "info",
  actions: [
    { icon: "copy", tooltip: "Copy versions" },
    { icon: "refresh-cw", tooltip: "Refresh" },
  ],
  minWidth: 260,
  width: 290,
  lockHeight: true,
});
