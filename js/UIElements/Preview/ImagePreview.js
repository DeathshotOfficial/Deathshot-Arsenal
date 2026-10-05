/**
 * DeathshotArsenal UI — ImagePreview Component
 * Contained frame with soft-cornered clipping, loading state, and metadata badge.
 */

export function ImagePreview(options = {}) {
  const root = document.createElement("div");
  root.className = "ds-ui-preview-container";
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));

  const box = document.createElement("div");
  box.className = "ds-ui-image-preview-box";
  if (options.height) box.style.height = typeof options.height === "number" ? `${options.height}px` : options.height;

  const img = document.createElement("img");
  img.style.display = "none";
  if (options.fit) img.style.objectFit = options.fit;
  box.appendChild(img);

  const placeholder = document.createElement("span");
  placeholder.textContent = options.placeholder || "No Image Loaded";
  placeholder.style.color = "var(--ds-color-muted-text, #9ca3af)";
  placeholder.style.fontSize = "10px";
  placeholder.style.fontWeight = "600";
  box.appendChild(placeholder);

  root.appendChild(box);

  let footer = null;
  let titleEl = null;
  let badgeEl = null;

  if (options.title || options.badge) {
    footer = document.createElement("div");
    footer.className = "ds-ui-preview-footer";

    titleEl = document.createElement("span");
    titleEl.textContent = options.title || "";
    footer.appendChild(titleEl);

    badgeEl = document.createElement("span");
    badgeEl.className = "ds-ui-preview-badge";
    badgeEl.textContent = options.badge || "—";
    footer.appendChild(badgeEl);

    root.appendChild(footer);
  }

  if (options.src) {
    img.src = options.src;
    img.style.display = "block";
    placeholder.style.display = "none";
  }

  const api = {
    root,
    box,
    img,
    setImage(url, dimensions = "") {
      if (url) {
        img.src = url;
        img.style.display = "block";
        placeholder.style.display = "none";
      } else {
        img.style.display = "none";
        placeholder.style.display = "block";
      }
      if (badgeEl && dimensions) badgeEl.textContent = dimensions;
    },
    setTitle(text) {
      if (titleEl) titleEl.textContent = text;
    },
    clear() {
      img.src = "";
      img.style.display = "none";
      placeholder.style.display = "block";
      if (badgeEl) badgeEl.textContent = "—";
    },
    destroy() {
      root.remove();
    },
  };

  return api;
}
