// DeathshotArsenal/js/Load Images From Folder/gallery_modal.js

/**
 * Fast interactive thumbnail gallery modal with custom switch toggles,
 * styled dropdowns, selection shortcuts, sorting, and lazy-loaded thumbnails.
 */
function createModalDropdown(items, defaultValue, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "ds-fl-dropdown";
  wrap.style.cssText = "width:120px;height:26px;display:inline-block;";

  const display = document.createElement("div");
  display.className = "ds-fl-dropdown-display";
  display.style.cssText = "height:26px;font-size:8.5px;padding:0 22px 0 8px;";

  const menu = document.createElement("div");
  menu.className = "ds-fl-dropdown-menu";
  menu.style.cssText = "top:calc(100% + 2px);font-size:8.5px;";

  let currentValue = defaultValue;

  const renderItems = () => {
    menu.innerHTML = "";
    for (const item of items) {
      const el = document.createElement("div");
      el.className = `ds-fl-dropdown-item ${item.value === currentValue ? 'active' : ''}`;
      el.textContent = item.label;
      el.onclick = (e) => {
        e.stopPropagation();
        currentValue = item.value;
        display.textContent = item.label;
        wrap.classList.remove("open");
        renderItems();
        onChange?.(item.value);
      };
      menu.appendChild(el);
    }
  };

  const initial = items.find(i => i.value === defaultValue);
  display.textContent = initial ? initial.label : (items[0]?.label || "");

  display.onclick = (e) => {
    e.stopPropagation();
    wrap.classList.toggle("open");
  };

  const closeHandler = (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove("open");
  };
  document.addEventListener("pointerdown", closeHandler);
  wrap._cleanup = () => document.removeEventListener("pointerdown", closeHandler);

  wrap.append(display, menu);
  renderItems();
  return wrap;
}

export function openGalleryModal({
  node,
  folderPath,
  initialSelected = [],
  includeSubfolders = true,
  keepFolderStructure = false,
  sortBy = "name",
  sortDir = "asc",
  onApply,
}) {
  document.querySelector(".ds-fl-gallery-modal")?.remove();

  if (!document.getElementById("ds-load-images-from-folder-link")) {
    const link = document.createElement("link");
    link.id = "ds-load-images-from-folder-link";
    link.rel = "stylesheet";
    link.href = "/extensions/DeathshotArsenal/Load%20Images%20From%20Folder/folder_loader.css";
    document.head.appendChild(link);
  }

  const cleanInitialPath = str(folderPath || "").trim().replace(/^["']|["']$/g, "");
  let currentPath = cleanInitialPath;
  let files = [];
  let selectedSet = new Set(initialSelected);
  let firstNCount = 5;
  let currentSort = sortBy;
  let currentDir = sortDir;
  let isRecursive = includeSubfolders;
  let isKeepFolders = keepFolderStructure;
  let searchQuery = "";

  function str(v) { return String(v || ""); }

  const backdrop = document.createElement("div");
  backdrop.className = "ds-fl-modal-backdrop ds-fl-gallery-modal";
  backdrop.dataset.dsThemed = "true";
  backdrop.style.position = "fixed";
  backdrop.style.inset = "0";
  backdrop.style.zIndex = "999999";
  backdrop.style.display = "flex";
  backdrop.style.alignItems = "center";
  backdrop.style.justifyContent = "center";

  backdrop.innerHTML = `
    <div class="ds-fl-modal" data-ds-themed="true">
      <div class="ds-fl-modal-head">
        <div class="ds-fl-modal-title">
          <span>SELECT IMAGES</span>
          <span style="font-size:9.5px;color:var(--ds-text-muted,#9ca3af);font-weight:400;margin-left:8px;font-family:monospace;" data-folder-label></span>
        </div>
        <button class="ds-fl-modal-close" data-close title="Close (Esc)">✕</button>
      </div>

      <div class="ds-fl-modal-toolbar">
        <div class="ds-fl-tool-row">
          <div class="ds-fl-tool-left">
            <button class="ds-fl-btn" data-all>Select all</button>
            <button class="ds-fl-btn" data-none>None</button>
            <div style="display:inline-flex;align-items:center;gap:4px;">
              <span style="font-size:9px;color:var(--ds-text-muted,#9ca3af);">First:</span>
              <div class="ds-fl-stepper">
                <input type="text" class="ds-fl-stepper-val" data-first-n value="5" style="width:28px;">
                <div class="ds-fl-stepper-btns">
                  <button class="ds-fl-step-btn" data-fn-up>▲</button>
                  <button class="ds-fl-step-btn" data-fn-down>▼</button>
                </div>
              </div>
              <button class="ds-fl-btn" data-select-first>Select</button>
            </div>
          </div>
          <div class="ds-fl-tool-right">
            <input type="text" class="ds-fl-input" data-search placeholder="Filter images..." style="width:130px;height:26px;">
            <span class="ds-fl-label" style="margin-left:4px;">Sort:</span>
            <div data-sort-host style="display:inline-block;"></div>
            <button class="ds-fl-btn" data-sort-dir style="height:26px;">${currentDir === 'asc' ? '▲ Asc' : '▼ Desc'}</button>
          </div>
        </div>

        <div class="ds-fl-tool-row">
          <div class="ds-fl-tool-left" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <!-- Custom DS Switch Toggle 1: Include Subfolders -->
            <button type="button" class="ds-fl-toggle ${isRecursive ? 'is-on' : ''}" data-toggle-subfolders style="display:inline-flex;align-items:center;gap:10px;padding:0 14px 0 10px;height:28px;border-radius:999px;width:auto;flex:0 0 auto;box-sizing:border-box;cursor:pointer;">
              <span class="ds-fl-toggle-track" style="width:28px;height:16px;min-width:28px;flex-shrink:0;position:relative;margin:0;box-sizing:border-box;"><span class="ds-fl-toggle-thumb"></span></span>
              <span class="ds-fl-toggle-label" style="font-size:10px;line-height:1;white-space:nowrap;user-select:none;margin:0;">Include subfolders</span>
            </button>

            <!-- Custom DS Switch Toggle 2: Keep Folder Structure -->
            <button type="button" class="ds-fl-toggle ${isKeepFolders ? 'is-on' : ''}" data-toggle-keepfolders style="display:inline-flex;align-items:center;gap:10px;padding:0 14px 0 10px;height:28px;border-radius:999px;width:auto;flex:0 0 auto;box-sizing:border-box;cursor:pointer;">
              <span class="ds-fl-toggle-track" style="width:28px;height:16px;min-width:28px;flex-shrink:0;position:relative;margin:0;box-sizing:border-box;"><span class="ds-fl-toggle-thumb"></span></span>
              <span class="ds-fl-toggle-label" style="font-size:10px;line-height:1;white-space:nowrap;user-select:none;margin:0;">Keep folder structure in name</span>
            </button>
          </div>

          <div class="ds-fl-tool-right">
            <span class="ds-fl-badge" data-count-badge>Selected: 0 / 0</span>
          </div>
        </div>
      </div>

      <div class="ds-fl-grid-wrap" style="flex:1;overflow-y:auto;padding:16px 20px;background:var(--ds-bg, var(--ds-panel, #12151c));">
        <div class="ds-fl-grid" data-grid>
          <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ds-text-muted,#8d95a1);">Loading folder files...</div>
        </div>
      </div>

      <div class="ds-fl-modal-foot">
        <div style="font-size:9px;color:var(--ds-text-muted,#8d95a1);" data-foot-info></div>
        <div style="display:flex;gap:8px;">
          <button class="ds-fl-btn" data-cancel>Cancel</button>
          <button class="ds-fl-btn ds-fl-btn-primary" data-done style="width:100px;">Done</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const modal = backdrop.querySelector(".ds-fl-modal");
  const gridWrap = backdrop.querySelector(".ds-fl-grid-wrap");

  // Apply active Deathshot theme variables to modal
  const applyTheme = () => {
    try {
      if (window.DSGlobalTheme) {
        window.DSGlobalTheme.applyToElement(backdrop);
        if (modal) window.DSGlobalTheme.applyToElement(modal);
        if (gridWrap) window.DSGlobalTheme.applyToElement(gridWrap);
      }
    } catch (_) {}

    try {
      const nodeEl = node?.widgets?.find(w => w?.name === "ds_folder_loader_ui")?.element ||
                     document.querySelector(".ds-fl-root[data-ds-themed='true']") ||
                     document.querySelector("[data-ds-themed='true']");
      if (nodeEl) {
        const computed = window.getComputedStyle(nodeEl);
        const vars = [
          "--ds-accent",
          "--ds-accent-rgb",
          "--ds-bg",
          "--ds-panel",
          "--ds-panel-2",
          "--ds-panel-3",
          "--ds-border",
          "--ds-text",
          "--ds-text-muted",
          "--ds-input-bg",
          "--ds-hover",
          "--ds-radius",
          "--ds-font",
          "--ds-font-family",
          "--ds-font-size",
        ];
        for (const v of vars) {
          const val = computed.getPropertyValue(v)?.trim();
          if (val) {
            backdrop.style.setProperty(v, val);
            if (modal) modal.style.setProperty(v, val);
            if (gridWrap) gridWrap.style.setProperty(v, val);
          }
        }
      }
    } catch (_) {}
  };

  applyTheme();
  const unsubTheme = window.DSGlobalTheme?.subscribe?.(() => applyTheme());

  const folderLabel = backdrop.querySelector("[data-folder-label]");
  const countBadge = backdrop.querySelector("[data-count-badge]");
  const footInfo = backdrop.querySelector("[data-foot-info]");
  const grid = backdrop.querySelector("[data-grid]");
  const toggleSubfolders = backdrop.querySelector("[data-toggle-subfolders]");
  const toggleKeepFolders = backdrop.querySelector("[data-toggle-keepfolders]");
  const searchInput = backdrop.querySelector("[data-search]");
  const sortDirBtn = backdrop.querySelector("[data-sort-dir]");
  const firstNInput = backdrop.querySelector("[data-first-n]");

  const sortDropdown = createModalDropdown(
    [
      { value: "name", label: "Name" },
      { value: "date", label: "Date Modified" },
      { value: "size", label: "File Size" },
      { value: "type", label: "Type (extension)" },
    ],
    currentSort,
    (val) => {
      currentSort = val;
      fetchFiles();
    }
  );
  backdrop.querySelector("[data-sort-host]")?.replaceWith(sortDropdown);

  folderLabel.textContent = currentPath || "(No folder selected)";

  const close = () => {
    unsubTheme?.();
    sortDropdown._cleanup?.();
    window.removeEventListener("keydown", handleKey);
    backdrop.remove();
  };

  const handleKey = (e) => {
    if (e.key === "Escape") close();
  };
  window.addEventListener("keydown", handleKey);

  backdrop.querySelector("[data-close]").onclick = close;
  backdrop.querySelector("[data-cancel]").onclick = close;
  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) close();
  });

  // IntersectionObserver for lazy thumbnail loading
  let observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src && !img.src) {
          img.src = src;
        }
        observer.unobserve(img);
      }
    }
  }, { root: backdrop.querySelector(".ds-fl-grid-wrap"), rootMargin: "150px" });

  const updateCounts = () => {
    const total = files.length;
    const selected = selectedSet.size;
    countBadge.textContent = `Selected: ${selected} / ${total}`;
    footInfo.textContent = `${total} images found · ${selected} ready for execution`;
  };

  const renderGrid = () => {
    grid.innerHTML = "";
    observer.disconnect();

    const filtered = searchQuery
      ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.rel_path.toLowerCase().includes(searchQuery.toLowerCase()))
      : files;

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--ds-text-muted,#8d95a1);">No images found in this folder matching your criteria.</div>`;
      updateCounts();
      return;
    }

    const frag = document.createDocumentFragment();

    for (const file of filtered) {
      const isSelected = selectedSet.has(file.rel_path);
      const card = document.createElement("div");
      card.className = `ds-fl-card ${isSelected ? 'selected' : ''}`;
      card.dataset.rel = file.rel_path;
      card.title = `${file.rel_path}\nSize: ${(file.size / 1024).toFixed(1)} KB`;

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "ds-fl-card-thumb-wrap";
      thumbWrap.style.background = "var(--ds-input-bg, var(--ds-panel-3, #0a0c10))";

      const check = document.createElement("div");
      check.className = "ds-fl-card-check";
      check.textContent = isSelected ? "✓" : "";

      const img = document.createElement("img");
      img.className = "ds-fl-card-thumb";
      img.alt = file.name;
      img.dataset.src = `/ds/thumbnail?path=${encodeURIComponent(file.full_path)}&t=${file.mtime}`;

      thumbWrap.append(check, img);

      const nameEl = document.createElement("div");
      nameEl.className = "ds-fl-card-name";
      nameEl.textContent = isKeepFolders ? file.rel_path : file.name;

      card.append(thumbWrap, nameEl);

      card.onclick = (e) => {
        e.stopPropagation();
        if (selectedSet.has(file.rel_path)) {
          selectedSet.delete(file.rel_path);
          card.classList.remove("selected");
          check.textContent = "";
        } else {
          selectedSet.add(file.rel_path);
          card.classList.add("selected");
          check.textContent = "✓";
        }
        updateCounts();
      };

      observer.observe(img);
      frag.appendChild(card);
    }

    grid.appendChild(frag);
    updateCounts();
  };

  const fetchFiles = async () => {
    if (!currentPath) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:#f87171;">Please enter or browse a folder path first on the node.</div>`;
      return;
    }

    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ds-text-muted,#8d95a1);">Scanning directory: ${currentPath}...</div>`;

    try {
      const res = await fetch("/ds/folder_scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: currentPath,
          recursive: isRecursive,
          sort_by: currentSort,
          sort_dir: currentDir,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Scan failed" }));
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:#f87171;">Folder scan error: ${err.error || 'Cannot access folder. Check path.'}</div>`;
        return;
      }

      const data = await res.json();
      files = data.files || [];

      // If initialSelected is empty and files exist, select all by default
      if (initialSelected.length === 0 && files.length > 0 && selectedSet.size === 0) {
        selectedSet = new Set(files.map(f => f.rel_path));
      }

      renderGrid();
    } catch (e) {
      console.error("[DS Gallery Modal] fetch error:", e);
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:#f87171;">Network error contacting scanner: ${e.message}</div>`;
    }
  };

  // Selection shortcuts
  backdrop.querySelector("[data-all]").onclick = () => {
    for (const f of files) selectedSet.add(f.rel_path);
    renderGrid();
  };

  backdrop.querySelector("[data-none]").onclick = () => {
    selectedSet.clear();
    renderGrid();
  };

  backdrop.querySelector("[data-fn-up]").onclick = () => {
    firstNCount = Math.max(1, firstNCount + 1);
    firstNInput.value = firstNCount;
  };

  backdrop.querySelector("[data-fn-down]").onclick = () => {
    firstNCount = Math.max(1, firstNCount - 1);
    firstNInput.value = firstNCount;
  };

  firstNInput.onchange = () => {
    firstNCount = Math.max(1, parseInt(firstNInput.value) || 1);
    firstNInput.value = firstNCount;
  };

  backdrop.querySelector("[data-select-first]").onclick = () => {
    selectedSet.clear();
    const count = Math.min(firstNCount, files.length);
    for (let i = 0; i < count; i++) {
      selectedSet.add(files[i].rel_path);
    }
    renderGrid();
  };

  // Custom switch toggles
  toggleSubfolders.onclick = () => {
    isRecursive = !isRecursive;
    toggleSubfolders.classList.toggle("is-on", isRecursive);
    fetchFiles();
  };

  toggleKeepFolders.onclick = () => {
    isKeepFolders = !isKeepFolders;
    toggleKeepFolders.classList.toggle("is-on", isKeepFolders);
    renderGrid();
  };

  searchInput.oninput = () => {
    searchQuery = searchInput.value.trim();
    renderGrid();
  };


  sortDirBtn.onclick = () => {
    currentDir = (currentDir === "asc") ? "desc" : "asc";
    sortDirBtn.textContent = (currentDir === "asc") ? "▲ Asc" : "▼ Desc";
    fetchFiles();
  };

  // Done action
  backdrop.querySelector("[data-done]").onclick = () => {
    const orderedSelected = files.map(f => f.rel_path).filter(r => selectedSet.has(r));
    onApply?.({
      selectedFiles: orderedSelected,
      includeSubfolders: isRecursive,
      keepFolderStructure: isKeepFolders,
      sortBy: currentSort,
      sortDir: currentDir,
      totalFiles: files.length,
    });
    close();
  };

  // Initial fetch
  fetchFiles();
}
