// DeathshotArsenal/js/Load Images From Folder/os_dialog_bridge.js

/**
 * Open built-in browser folder picker modal.
 * Works universally across all environments (Windows, macOS, Linux, Remote/Docker).
 */
export function openFolderBrowserModal(initialPath, onSelect) {
  document.querySelector(".ds-fl-dir-modal")?.remove();

  const modal = document.createElement("div");
  modal.className = "ds-fl-modal-backdrop ds-fl-dir-modal";
  modal.innerHTML = `
    <div class="ds-fl-modal" style="width:min(520px,94vw);height:min(440px,75vh);">
      <div class="ds-fl-modal-head">
        <div class="ds-fl-modal-title">📁 Browse Folders</div>
        <button class="ds-fl-modal-close" data-close>✕</button>
      </div>
      <div style="padding:8px 12px;border-bottom:1px solid var(--ds-border,#242a36);font-size:9.5px;color:var(--ds-text-muted,#9ca3af);display:flex;align-items:center;gap:6px;background:var(--ds-panel-2,#141822);">
        <span style="font-weight:700;">Path:</span>
        <span class="ds-fl-dir-path" style="color:var(--ds-text,#e5e7eb);word-break:break-all;font-family:monospace;"></span>
      </div>
      <div class="ds-fl-dir-list" style="flex:1;overflow-y:auto;padding:8px;background:var(--ds-bg, var(--ds-panel, #12151c));display:flex;flex-direction:column;gap:3px;">
        <div style="padding:20px;text-align:center;color:var(--ds-text-muted,#8d95a1);">Loading directories...</div>
      </div>
      <div class="ds-fl-modal-foot">
        <button class="ds-fl-btn" data-up>↑ Up</button>
        <div style="display:flex;gap:6px;">
          <button class="ds-fl-btn" data-cancel>Cancel</button>
          <button class="ds-fl-btn ds-fl-btn-primary" data-select-this>Select This Folder</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const pathEl = modal.querySelector(".ds-fl-dir-path");
  const listEl = modal.querySelector(".ds-fl-dir-list");
  let activePath = initialPath || "";

  const close = () => modal.remove();
  modal.querySelector("[data-close]").onclick = close;
  modal.querySelector("[data-cancel]").onclick = close;
  modal.addEventListener("pointerdown", (e) => {
    if (e.target === modal) close();
  });

  const loadDir = async (target) => {
    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ds-text-muted,#8d95a1);">Loading...</div>`;
    try {
      const res = await fetch("/ds/folder_loader/list_dir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target }),
      });
      if (!res.ok) {
        listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#f87171;">Failed to list directory.</div>`;
        return;
      }
      const data = await res.json();
      activePath = data.current || "";
      pathEl.textContent = activePath || "(Select a drive)";
      listEl.innerHTML = "";

      const dirs = data.dirs || [];
      if (dirs.length === 0) {
        listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ds-text-muted,#8d95a1);">No subdirectories found.</div>`;
        return;
      }

      for (const dirName of dirs) {
        const item = document.createElement("button");
        item.className = "ds-fl-btn";
        item.style.cssText = "width:100%;justify-content:flex-start;text-align:left;height:28px;padding:0 8px;font-size:9.5px;";
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
      listEl.innerHTML = `<div style="padding:20px;text-align:center;color:#f87171;">Error: ${e.message}</div>`;
    }
  };

  modal.querySelector("[data-up]").onclick = (e) => {
    e.stopPropagation();
    if (!activePath) return;
    const clean = activePath.replace(/[\\\/]$/, "");
    const lastSep = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
    if (lastSep > 0) {
      loadDir(clean.slice(0, lastSep));
    } else {
      loadDir(""); // Show drives
    }
  };

  modal.querySelector("[data-select-this]").onclick = (e) => {
    e.stopPropagation();
    if (activePath) {
      onSelect?.(activePath);
      close();
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
        // User deliberately cancelled the native dialog; do NOT open in-browser modal
        return null;
      }
    }
  } catch (e) {
    console.warn("[DS Load Images From Folder] Native browse error, falling back to modal:", e);
  }

  // Fallback: only open in-browser directory browser modal if native browse failed/errored or unsupported
  openFolderBrowserModal(currentPath, onSelect);
  return null;
}
