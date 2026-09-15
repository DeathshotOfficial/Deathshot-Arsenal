/**
 * DS Node Library Bookmarks
 *
 * ComfyUI's new node browser cannot be re-sorted by custom packs in "Most relevant"
 * (that list is global usage stats). The supported way to put your nodes first is
 * the built-in Bookmarks system — bookmarked nodes get a "Bookmarked" tab that
 * appears before Comfy / Extensions.
 *
 * This seeds all DS_* nodes into a DeathshotArsenal/ bookmark folder on first run,
 * and auto-adds newly installed DS nodes later. Removing a bookmark in ComfyUI sticks.
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const BOOKMARK_SETTING = "Comfy.NodeLibrary.Bookmarks.V2";
const AUTO_SETTING = "DeathshotArsenal.NodeLibrary.AutoBookmark";
const BOOKMARK_FOLDER = "DeathshotArsenal/";

const FALLBACK_DS_NODES = [

  "DS_FuturisticHUD",
  "DS_QuickSave",
  "DS_PipeIn",
  "DS_PipeOut",
  "DS_ImageCompare",
  "DS_SystemMonitor",
  "DS_Resolution",
  "DS_PromptCards",
];

function getSettings() {
  return app.ui?.settings;
}

function readBookmarks(settings) {
  const raw = settings?.getSettingValue?.(BOOKMARK_SETTING);
  return Array.isArray(raw) ? raw.slice() : [];
}

async function writeBookmarks(settings, bookmarks) {
  if (typeof settings.setSettingValueAsync === "function") {
    await settings.setSettingValueAsync(BOOKMARK_SETTING, bookmarks);
    return;
  }
  if (typeof settings.setSettingValue === "function") {
    settings.setSettingValue(BOOKMARK_SETTING, bookmarks);
  }
}

async function fetchDsNodeNames() {
  try {
    const res = await api.fetchApi("/object_info");
    if (!res?.ok) return null;
    const info = await res.json();
    const names = Object.keys(info || {}).filter((n) => n.startsWith("DS_"));
    return names.length ? names.sort() : null;
  } catch (_) {
    return null;
  }
}

async function seedDeathshotBookmarks() {
  const settings = getSettings();
  if (!settings) return;

  if (settings.getSettingValue?.(AUTO_SETTING) === false) return;

  const fetchedDsNodes = await fetchDsNodeNames();
  const dsNodes = fetchedDsNodes || FALLBACK_DS_NODES;
  const wanted = new Set([BOOKMARK_FOLDER, ...dsNodes.map((n) => `${BOOKMARK_FOLDER}${n}`)]);

  let current = readBookmarks(settings);

  // Remove bookmarks for DS nodes that no longer exist. This prevents deleted
  // nodes from lingering in the node-library folder after an update.
  if (fetchedDsNodes) {
    const active = new Set(dsNodes.map((n) => `${BOOKMARK_FOLDER}${n}`));
    current = current.filter((entry) =>
      !entry.startsWith(BOOKMARK_FOLDER + "DS_") || active.has(entry)
    );
  }

  const currentSet = new Set(current);
  let changed = false;

  for (const entry of wanted) {
    if (!currentSet.has(entry)) {
      current.push(entry);
      currentSet.add(entry);
      changed = true;
    }
  }

  if (changed) {
    await writeBookmarks(settings, current);
    console.info(`[DeathshotArsenal] Added ${wanted.size} node library bookmark(s) under ${BOOKMARK_FOLDER}`);
  }
}

app.registerExtension({
  name: "DeathshotArsenal.NodeBookmarks",

  settings: [
    {
      id: AUTO_SETTING,
      name: "Auto-bookmark DeathshotArsenal nodes in node library",
      tooltip:
        "Creates a DeathshotArsenal/ folder in the node library Bookmarks tab (first tab). Disable to stop auto-adding new DS nodes.",
      type: "boolean",
      defaultValue: true,
    },
  ],

  async setup() {
    // Wait for Comfy settings + object_info to be ready.
    setTimeout(() => {
      seedDeathshotBookmarks().catch((e) => {
        console.warn("[DeathshotArsenal] Bookmark seed failed:", e);
      });
    }, 2500);
  },
});
