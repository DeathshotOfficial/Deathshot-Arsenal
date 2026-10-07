// DeathshotArsenal/js/Load Images From Folder/gallery_modal.js
import { Button, Dropdown, Stepper, Toggle, DSIcon } from "../UIElements/index.js";

/**
 * Fast interactive thumbnail gallery modal with unified DS UI components,
 * dropdown sorting menu, toggle switches, selection shortcuts, and lazy-loaded thumbnails.
 */
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

  const cleanInitialPath = String(folderPath || "").trim().replace(/^["']|["']$/g, "");
  let currentPath = cleanInitialPath;
  let files = [];
  let selectedSet = new Set(initialSelected);
  let firstNCount = 5;
  let currentSort = sortBy;
  let currentDir = sortDir;
  let isRecursive = includeSubfolders;
  let isKeepFolders = keepFolderStructure;
  let searchQuery = "";

  const backdrop = document.createElement("div");
  backdrop.className = "ds-fl-modal-backdrop ds-fl-gallery-modal";

  const modal = document.createElement("div");
  modal.className = "ds-fl-modal";
  modal.dataset.dsThemed = "true";

  // Modal Header
  const head = document.createElement("div");
  head.className = "ds-fl-modal-head";

  const titleGroup = document.createElement("div");
  titleGroup.className = "ds-fl-modal-title";
  titleGroup.innerHTML = `
    <span>SELECT IMAGES</span>
    <span class="ds-fl-modal-folder-label" data-folder-label></span>
  `;

  const closeBtn = Button({
    icon: "x",
    compact: true,
    className: "ds-ui-btn-icon-only ds-fl-modal-close-btn",
    tooltip: "Close (Esc)",
    onClick: () => close(),
  });

  head.append(titleGroup, closeBtn.root);

  // Modal Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "ds-fl-modal-toolbar";

  // Toolbar Row 1: Selection shortcuts, search filter, and sorting dropdown menu
  const toolRow1 = document.createElement("div");
  toolRow1.className = "ds-fl-tool-row";

  const toolLeft1 = document.createElement("div");
  toolLeft1.className = "ds-fl-tool-left";

  const selectAllBtn = Button({
    label: "Select all",
    compact: true,
    onClick: () => {
      for (const f of files) selectedSet.add(f.rel_path);
      renderGrid();
    },
  });

  const selectNoneBtn = Button({
    label: "None",
    compact: true,
    onClick: () => {
      selectedSet.clear();
      renderGrid();
    },
  });

  const firstGroup = document.createElement("div");
  firstGroup.className = "ds-fl-first-group";

  const firstLabel = document.createElement("span");
  firstLabel.className = "ds-fl-first-label";
  firstLabel.textContent = "First:";

  const firstNStepper = Stepper({
    min: 1,
    max: 9999,
    step: 1,
    value: firstNCount,
    compact: true,
    onChange: (val) => {
      firstNCount = Math.max(1, parseInt(val) || 1);
    },
  });
  firstNStepper.root.style.width = "90px";
  firstNStepper.root.style.flex = "0 0 90px";
  firstNStepper.root.style.height = "24px";

  const selectFirstBtn = Button({
    label: "Select",
    compact: true,
    onClick: () => {
      selectedSet.clear();
      const count = Math.min(firstNCount, files.length);
      for (let i = 0; i < count; i++) {
        selectedSet.add(files[i].rel_path);
      }
      renderGrid();
    },
  });

  firstGroup.append(firstLabel, firstNStepper.root, selectFirstBtn.root);
  toolLeft1.append(selectAllBtn.root, selectNoneBtn.root, firstGroup);

  const toolRight1 = document.createElement("div");
  toolRight1.className = "ds-fl-tool-right";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "ds-ui-input ds-fl-search-input";
  searchInput.placeholder = "Filter images...";
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim();
    renderGrid();
  });

  // Sort dropdown menu using unified Dropdown primitive
  const sortDropdown = Dropdown({
    label: "Sort:",
    options: [
      { id: "name", label: "Name" },
      { id: "date", label: "Date Modified" },
      { id: "size", label: "File Size" },
      { id: "type", label: "Type (ext)" },
    ],
    value: currentSort,
    compact: true,
    width: 130,
    onChange: (val) => {
      currentSort = val;
      fetchFiles();
    },
  });
  sortDropdown.root.style.width = "130px";
  sortDropdown.root.style.flex = "0 0 130px";
  sortDropdown.root.style.height = "26px";

  const sortDirBtn = Button({
    label: currentDir === "asc" ? "▲ Asc" : "▼ Desc",
    compact: true,
    className: "ds-fl-sort-dir-btn",
    onClick: () => {
      currentDir = currentDir === "asc" ? "desc" : "asc";
      sortDirBtn.setLabel(currentDir === "asc" ? "▲ Asc" : "▼ Desc");
      fetchFiles();
    },
  });
  sortDirBtn.root.style.width = "76px";
  sortDirBtn.root.style.flex = "0 0 76px";
  sortDirBtn.root.style.height = "26px";

  searchInput.style.width = "150px";
  searchInput.style.flex = "0 0 150px";
  searchInput.style.height = "26px";

  toolRight1.append(searchInput, sortDropdown.root, sortDirBtn.root);
  toolRow1.append(toolLeft1, toolRight1);

  // Toolbar Row 2: Native DS Switch Toggles and Selected Counter Badge
  const toolRow2 = document.createElement("div");
  toolRow2.className = "ds-fl-tool-row";

  const toolLeft2 = document.createElement("div");
  toolLeft2.className = "ds-fl-tool-left";

  const subfoldersToggle = Toggle({
    label: "Include subfolders",
    checked: isRecursive,
    reverse: true,
    className: "ds-fl-toolbar-toggle",
    onChange: (checked) => {
      isRecursive = checked;
      fetchFiles();
    },
  });

  const keepFoldersToggle = Toggle({
    label: "Keep folder structure in name",
    checked: isKeepFolders,
    reverse: true,
    className: "ds-fl-toolbar-toggle",
    onChange: (checked) => {
      isKeepFolders = checked;
      renderGrid();
    },
  });

  toolLeft2.append(subfoldersToggle.root, keepFoldersToggle.root);

  const toolRight2 = document.createElement("div");
  toolRight2.className = "ds-fl-tool-right";

  const countBadge = document.createElement("span");
  countBadge.className = "ds-fl-badge";
  countBadge.textContent = "Selected: 0 / 0";
  toolRight2.appendChild(countBadge);

  toolRow2.append(toolLeft2, toolRight2);
  toolbar.append(toolRow1, toolRow2);

  // Modal Grid Body
  const gridWrap = document.createElement("div");
  gridWrap.className = "ds-fl-grid-wrap";

  const grid = document.createElement("div");
  grid.className = "ds-fl-grid";
  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ds-color-muted-text,#8d95a1);">Loading folder files...</div>`;
  gridWrap.appendChild(grid);

  // Modal Footer
  const foot = document.createElement("div");
  foot.className = "ds-fl-modal-foot";

  const footInfo = document.createElement("div");
  footInfo.className = "ds-fl-modal-foot-info";

  const footActions = document.createElement("div");
  footActions.style.display = "flex";
  footActions.style.gap = "8px";

  const cancelBtn = Button({
    label: "Cancel",
    onClick: () => close(),
  });

  const doneBtn = Button({
    label: "Done",
    variant: "primary",
    onClick: () => {
      const orderedSelected = files.map((f) => f.rel_path).filter((r) => selectedSet.has(r));
      onApply?.({
        selectedFiles: orderedSelected,
        includeSubfolders: isRecursive,
        keepFolderStructure: isKeepFolders,
        sortBy: currentSort,
        sortDir: currentDir,
        totalFiles: files.length,
      });
      close();
    },
  });
  doneBtn.root.style.minWidth = "90px";

  footActions.append(cancelBtn.root, doneBtn.root);
  foot.append(footInfo, footActions);

  modal.append(head, toolbar, gridWrap, foot);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const folderLabel = modal.querySelector("[data-folder-label]");
  folderLabel.textContent = currentPath || "(No folder selected)";

  const close = () => {
    unsubTheme?.();
    sortDropdown.destroy?.();
    firstNStepper.destroy?.();
    subfoldersToggle.destroy?.();
    keepFoldersToggle.destroy?.();
    selectAllBtn.destroy?.();
    selectNoneBtn.destroy?.();
    selectFirstBtn.destroy?.();
    sortDirBtn.destroy?.();
    cancelBtn.destroy?.();
    doneBtn.destroy?.();
    closeBtn.destroy?.();
    window.removeEventListener("keydown", handleKey);
    backdrop.remove();
  };

  const handleKey = (e) => {
    if (e.key === "Escape") close();
  };
  window.addEventListener("keydown", handleKey);

  backdrop.addEventListener("pointerdown", (e) => {
    if (e.target === backdrop) close();
  });

  // Dynamic Theme Synchronization
  const applyTheme = () => {
    try {
      if (window.DSGlobalTheme) {
        window.DSGlobalTheme.applyToElement(modal);
        window.DSGlobalTheme.applyToElement(gridWrap);
      }
    } catch (_) {}
  };
  applyTheme();
  const unsubTheme = window.DSGlobalTheme?.subscribe?.(() => applyTheme());

  // Lazy-load thumbnails via IntersectionObserver
  let observer = new IntersectionObserver(
    (entries) => {
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
    },
    { root: gridWrap, rootMargin: "150px" }
  );

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
      ? files.filter(
          (f) =>
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.rel_path.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : files;

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--ds-color-muted-text,#8d95a1);">No images found in this folder matching your criteria.</div>`;
      updateCounts();
      return;
    }

    const frag = document.createDocumentFragment();

    for (const file of filtered) {
      const isSelected = selectedSet.has(file.rel_path);
      const itemCard = document.createElement("div");
      itemCard.className = `ds-fl-grid-card ${isSelected ? "selected" : ""}`;
      itemCard.dataset.rel = file.rel_path;
      itemCard.title = `${file.rel_path}\nSize: ${(file.size / 1024).toFixed(1)} KB`;

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "ds-fl-card-thumb-wrap";

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

      itemCard.append(thumbWrap, nameEl);

      itemCard.onclick = (e) => {
        e.stopPropagation();
        if (selectedSet.has(file.rel_path)) {
          selectedSet.delete(file.rel_path);
          itemCard.classList.remove("selected");
          check.textContent = "";
        } else {
          selectedSet.add(file.rel_path);
          itemCard.classList.add("selected");
          check.textContent = "✓";
        }
        updateCounts();
      };

      observer.observe(img);
      frag.appendChild(itemCard);
    }

    grid.appendChild(frag);
    updateCounts();
  };

  const fetchFiles = async () => {
    if (!currentPath) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--ds-color-danger,#f87171);">Please enter or browse a folder path first on the node.</div>`;
      return;
    }

    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ds-color-muted-text,#8d95a1);">Scanning directory: ${currentPath}...</div>`;

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
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--ds-color-danger,#f87171);">Folder scan error: ${err.error || "Cannot access folder. Check path."}</div>`;
        return;
      }

      const data = await res.json();
      files = data.files || [];

      if (initialSelected.length === 0 && files.length > 0 && selectedSet.size === 0) {
        selectedSet = new Set(files.map((f) => f.rel_path));
      }

      renderGrid();
    } catch (e) {
      console.error("[DS Gallery Modal] fetch error:", e);
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:50px;color:var(--ds-color-danger,#f87171);">Network error contacting scanner: ${e.message}</div>`;
    }
  };

  fetchFiles();
}
