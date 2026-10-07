// DeathshotArsenal/js/Load Images From Folder/os_dialog_bridge.js
import { Button } from "../UIElements/index.js";

/**
 * Open built-in browser folder picker modal.
 * Works universally across all environments (Windows, macOS, Linux, Remote/Docker).
 */
export function openFolderBrowserModal(initialPath, onSelect) {
  document.querySelector(".ds-fl-dir-modal")?.remove();

  const modalBackdrop = document.createElement("div");
  modalBackdrop.className = "ds-fl-modal-backdrop ds-fl-dir-modal";

  const modal = document.createElement("div");
  modal.className = "ds-fl-modal";
  modal.dataset.dsThemed = "true";
  modal.style.cssText = "width:min(520px,94vw);height:min(440px,75vh);";

  // Head
  const head = document.createElement("div");
  head.className = "ds-fl-modal-head";

  const title = document.createElement("div");
  title.className = "ds-fl-modal-title";
  title.textContent = "📁 Browse Folders";

  const closeBtn = Button({
    icon: "x",
    compact: true,
    className: "ds-ui-btn-icon-only ds-fl-modal-close-btn",
    tooltip: "Close",
    onClick: () => close(),
  });

  head.append(title, closeBtn.root);

  // Path info bar
  const pathBar = document.createElement("div");
  pathBar.style.cssText =
    "padding:8px 16px;border-bottom:1px solid var(--ds-color-border,#242a36);font-size:10px;color:var(--ds-color-muted-text,#9ca3af);display:flex;align-items:center;gap:6px;background:var(--ds-color-panel-2,#141822);";
  pathBar.innerHTML = `
    <span style="font-weight:700;">Path:</span>
    <span class="ds-fl-dir-path" style="color:var(--ds-color-text,#e5e7eb);word-break:break-all;font-family:monospace;"></span>
  `;

  // Directory List
  const listEl = document.createElement("div");
  listEl.className = "ds-fl-dir-list";
  listEl.style.cssText =
    "flex:1;overflow-y:auto;padding:10px 16px;background:var(--ds-color-base,#0b0d12);display:flex;flex-direction:column;gap:4px;";
  listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ds-color-muted-text,#8d95a1);">Loading directories...</div>`;

  // Footer
  const foot = document.createElement("div");
  foot.className = "ds-fl-modal-foot";

  const upBtn = Button({
    label: "↑ Up",
    compact: true,
    onClick: (e) => {
      e.stopPropagation();
      if (!activePath) return;
      const clean = activePath.replace(/[\\\/]$/, "");
      const lastSep = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
      if (lastSep > 0) {
        loadDir(clean.slice(0, lastSep));
      } else {
        loadDir("");
      }
    },
  });

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "6px";

  const cancelBtn = Button({
    label: "Cancel",
    compact: true,
    onClick: () => close(),
  });

  const selectThisBtn = Button({
    label: "Select This Folder",
    variant: "primary",
    compact: true,
    onClick: (e) => {
      e.stopPropagation();
      if (activePath) {
        onSelect?.(activePath);
        close();
      }
    },
  });

  actions.append(cancelBtn.root, selectThisBtn.root);
  foot.append(upBtn.root, actions);

  modal.append(head, pathBar, listEl, foot);
  modalBackdrop.appendChild(modal);
  document.body.appendChild(modalBackdrop);

  const pathEl = modal.querySelector(".ds-fl-dir-path");
  let activePath = initialPath || "";

  const close = () => {
    closeBtn.destroy?.();
    upBtn.destroy?.();
    cancelBtn.destroy?.();
    selectThisBtn.destroy?.();
    modalBackdrop.remove();
  };

  modalBackdrop.addEventListener("pointerdown", (e) => {
    if (e.target === modalBackdrop) close();
  });

  const loadDir = async (target) => {
    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ds-color-muted-text,#8d95a1);">Loading...</div>`;
    try {
      const res = await fetch("/ds/folder_loader/list_dir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      if (!res.ok) {
        listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ds-color-danger,#f87171);">Failed to list directory.</div>`;
        return;
      }
      const data = await res.json();
      activePath = data.current || "";
      pathEl.textContent = activePath || "(Select a drive)";
      listEl.innerHTML = "";

      const dirs = data.dirs || [];
      if (dirs.length === 0) {
        listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ds-color-muted-text,#8d95a1);">No subdirectories found.</div>`;
        return;
      }

      for (const dirName of dirs) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ds-ui-btn ds-ui-btn-compact";
        item.style.cssText =
          "width:100%;justify-content:flex-start;text-align:left;height:26px;padding:0 8px;font-size:10px;";
        item.textContent = (data.is_drives ? "💾 " : "📁 ") + dirName;
        item.onclick = (e) => {
          e.stopPropagation();
          if (data.is_drives) {
            loadDir(dirName);
          } else {
            const base = activePath.replace(/[\\\/]$/, "");
            const sep = base.includes("\\") ? "\\" : "/";
            loadDir(base + sep + dirName);
          }
        };
        listEl.appendChild(item);
      }
    } catch (e) {
      listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ds-color-danger,#f87171);">Error: ${e.message}</div>`;
    }
  };

  loadDir(activePath);
}

/**
 * Open native OS directory browser dialog via backend API bridge.
 * Falls back to in-browser folder picker if native dialog returns no path
 * (cancelled, unsupported, or headless) or on any network error.
 */
export async function browseFolderOS(currentPath, onSelect) {
  try {
    const res = await fetch("/ds/browse_folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: currentPath || "" }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.path) {
        onSelect?.(data.path);
        return data.path;
      }
      if (data.cancelled) {
        return null;
      }
    }
  } catch (e) {
    console.warn("[DS Load Images From Folder] Native browse error, falling back to modal:", e);
  }

  openFolderBrowserModal(currentPath, onSelect);
  return null;
}
