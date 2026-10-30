// Deathshot Arsenal — DS Label Canvas Entity & Modal Editor
//
// Lightweight, slotless canvas annotation entity with rich typography,
// Google & local font auto-fetching, live preview and full persistence.
// The editor is built from the shared DS UI components.

import { app } from "/scripts/app.js";
import { attachNodeShortcuts } from "../UIElements/shortcuts.js";
import { Modal, Card, Field, Button, Dropdown, Slider, Toggle, ColorPicker, TextEditor } from "../UIElements/index.js";

const EXTENSION_NAME = "DeathshotArsenal.DSLabel";
const CSS = "/extensions/DeathshotArsenal/Label/ds_label.css";
const NODE_TYPE = "DS_Label";

const DEFAULT_LABEL_PROPS = {
  text: "Label Deathshot",
  fontFamily: "Inter",
  fontSize: 32,
  bold: false,
  italic: false,
  underline: false,
  textAlign: "center",
  textColor: "#ffffff",
  backgroundColor: "#333333",
  isTransparent: false,
  padding: 12,
  borderRadius: 16,
  opacity: 1.0,
  lineHeight: 1.2,
};

// Popular Google Fonts Catalog + Standard System Fonts
const CURATED_FONTS = [
  // Clean Sans-Serif
  { name: "Inter", category: "Google Font" },
  { name: "Roboto", category: "Google Font" },
  { name: "Poppins", category: "Google Font" },
  { name: "Montserrat", category: "Google Font" },
  { name: "Open Sans", category: "Google Font" },
  { name: "Lato", category: "Google Font" },
  { name: "Raleway", category: "Google Font" },
  { name: "Ubuntu", category: "Google Font" },
  { name: "Outfit", category: "Google Font" },
  { name: "Nunito", category: "Google Font" },
  { name: "Rubik", category: "Google Font" },
  // Display & Futuristic
  { name: "Bebas Neue", category: "Google Font" },
  { name: "Oswald", category: "Google Font" },
  { name: "Space Grotesk", category: "Google Font" },
  { name: "Syne", category: "Google Font" },
  { name: "Archivo", category: "Google Font" },
  { name: "Orbitron", category: "Google Font" },
  { name: "Rajdhani", category: "Google Font" },
  { name: "Righteous", category: "Google Font" },
  { name: "Cinzel", category: "Google Font" },
  // Monospace
  { name: "Fira Code", category: "Google Font" },
  { name: "JetBrains Mono", category: "Google Font" },
  { name: "Source Code Pro", category: "Google Font" },
  // Serif
  { name: "Playfair Display", category: "Google Font" },
  { name: "Merriweather", category: "Google Font" },
  // System / Local
  { name: "Arial", category: "System" },
  { name: "Helvetica", category: "System" },
  { name: "Segoe UI", category: "System" },
  { name: "SF Pro Display", category: "System" },
  { name: "Consolas", category: "System" },
  { name: "Courier New", category: "System" },
  { name: "Georgia", category: "System" },
  { name: "Impact", category: "System" },
  { name: "Times New Roman", category: "System" },
  { name: "Trebuchet MS", category: "System" },
  { name: "Verdana", category: "System" },
];

if (!document.querySelector(`link[href="${CSS}"]`)) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS;
  document.head.appendChild(link);
}

const loadedGoogleFonts = new Set(["Inter", "Arial", "sans-serif"]);

// Dynamically load Google Font on demand without reloading page
function loadWebFont(fontFamily) {
  if (!fontFamily || loadedGoogleFonts.has(fontFamily)) return;
  const isGoogle = CURATED_FONTS.some((f) => f.name === fontFamily && f.category === "Google Font");
  if (!isGoogle) return;

  try {
    const linkId = `ds-font-${fontFamily.replace(/\s+/g, "-").toLowerCase()}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
      document.head.appendChild(link);
      loadedGoogleFonts.add(fontFamily);
    }
    if (document.fonts && document.fonts.load) {
      document.fonts.load(`16px "${fontFamily}"`).catch(() => {});
    }
  } catch (err) {
    console.warn("[DSLabel] Could not load web font:", fontFamily, err);
  }
}

function dirty(graph) {
  try { graph?.setDirtyCanvas?.(true, true); } catch (_) {}
  try { app?.canvas?.setDirty?.(true, true); } catch (_) {}
}

// -----------------------------------------------------------------------------
// DS_Label LiteGraph Node Definition
// -----------------------------------------------------------------------------
function registerDSLabelNodeType() {
  const LiteGraph = globalThis.LiteGraph;
  if (!LiteGraph || !LiteGraph.LGraphNode) return null;

  class DSLabelNode extends LiteGraph.LGraphNode {
    static title_mode = 1;
    static color = "transparent";
    static bgcolor = "transparent";
    static boxcolor = "transparent";
    static isVirtualNode = true;
    static comfyClass = NODE_TYPE;

    constructor() {
      super();
      this.isVirtualNode = true;
      this.comfyClass = NODE_TYPE;
      this.type = NODE_TYPE;
      this.title = "";
      this.title_mode = 1;
      this._dsNodeBaseOptOut = true;
      this.color = "transparent";
      this.bgcolor = "transparent";
      this.boxcolor = "transparent";
      this.size = [280, 80];
      this.inputs = [];
      this.outputs = [];
      this.resizable = true;
      this.flags = { allow_interaction: true, no_title: true };
      this.properties = { ...DEFAULT_LABEL_PROPS };
    }

    get title_mode() { return 1; }
    set title_mode(_) {}

    get renderingColor() { return "transparent"; }
    get renderingBgColor() { return "transparent"; }

    onDrawTitleBar() { return true; }
    drawTitleBarBackground() { return true; }
    onDrawTitleText() { return true; }
    drawTitleText() { return true; }

    snapToGrid(snap) {
      if (!snap || !this.pos) return false;
      this.pos[0] = snap * Math.round(this.pos[0] / snap);
      this.pos[1] = snap * Math.round(this.pos[1] / snap);
      return true;
    }

    onDblClick(event, pos, canvas) {
      openDSLabelModal(this);
      return true;
    }

    getExtraMenuOptions(canvas, options) {
      if (!Array.isArray(options)) return;
      options.unshift(
        {
          content: "Edit DS Label...",
          callback: () => openDSLabelModal(this),
        },
        {
          content: "Copy Label Text",
          callback: () => {
            const txt = this.properties?.text || "";
            if (navigator?.clipboard?.writeText) {
              navigator.clipboard.writeText(txt);
            }
          },
        },
        null
      );
    }

    onDrawBackground(ctx, canvas) {
      if (this.flags?.collapsed) return;

      const [w, h] = this.size;
      const props = this.properties || {};
      const radius = Math.min(Number(props.borderRadius ?? 16), w / 2, h / 2);
      const opacity = Math.max(0, Math.min(1, Number(props.opacity ?? 1)));

      // Draw background card
      if (!props.isTransparent) {
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(0, 0, w, h, radius);
        } else {
          ctx.rect(0, 0, w, h);
        }
        ctx.fillStyle = props.backgroundColor || "#333333";
        ctx.globalAlpha = opacity;
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        ctx.fill();
        ctx.restore();
      }

      // Selection border indicator
      if (this.is_selected) {
        ctx.save();
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(0, 0, w, h, radius);
        } else {
          ctx.rect(0, 0, w, h);
        }
        const accent = window.DSGlobalTheme?.getVar?.("--ds-accent", "#67e8f9") || "#67e8f9";
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();

        // Resize handle indicator at bottom-right corner
        ctx.beginPath();
        ctx.arc(w - 6, h - 6, 4, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.restore();
      }
    }

    onDrawForeground(ctx, canvas) {
      if (this.flags?.collapsed) return;

      const [w, h] = this.size;
      const props = this.properties || {};
      const pad = Math.max(0, Number(props.padding ?? 12));
      const fs = Math.max(8, Number(props.fontSize ?? 32));
      const bold = props.bold ? "bold " : "";
      const italic = props.italic ? "italic " : "";
      const font = props.fontFamily || "Inter";
      const opacity = Math.max(0, Math.min(1, Number(props.opacity ?? 1)));
      const lineHeight = Math.max(0.8, Number(props.lineHeight ?? 1.2));
      const align = props.textAlign || "center";

      const text = String(props.text ?? "");
      if (!text) return;

      const lines = text.split("\n");
      const lineSpacing = fs * lineHeight;

      ctx.save();
      ctx.font = `${italic}${bold}${fs}px "${font}", system-ui, sans-serif`;
      ctx.fillStyle = props.textColor || "#ffffff";
      ctx.globalAlpha = opacity;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";

      let curY = h / 2 - ((lines.length - 1) * lineSpacing) / 2;

      let targetX = w / 2;
      if (align === "left") targetX = pad;
      else if (align === "right") targetX = w - pad;

      for (const line of lines) {
        ctx.fillText(line, targetX, curY);

        if (props.underline && line.length > 0) {
          const metrics = ctx.measureText(line);
          let startX = targetX;
          if (align === "center") startX = targetX - metrics.width / 2;
          else if (align === "right") startX = targetX - metrics.width;

          ctx.lineWidth = Math.max(1, fs / 16);
          ctx.strokeStyle = props.textColor || "#ffffff";
          ctx.beginPath();
          const underY = curY + fs * 0.45;
          ctx.moveTo(startX, underY);
          ctx.lineTo(startX + metrics.width, underY);
          ctx.stroke();
        }

        curY += lineSpacing;
      }

      ctx.restore();
    }

    serialize() {
      const data = super.serialize ? super.serialize() : LiteGraph.LGraphNode.prototype.serialize.call(this);
      data.properties = { ...this.properties };
      return data;
    }

    configure(data) {
      if (super.configure) {
        super.configure(data);
      } else {
        LiteGraph.LGraphNode.prototype.configure.call(this, data);
      }
      this.isVirtualNode = true;
      this.comfyClass = NODE_TYPE;
      this.type = NODE_TYPE;
      this.title = "";
      this.title_mode = 1;
      this._dsNodeBaseOptOut = true;
      this.color = "transparent";
      this.bgcolor = "transparent";
      this.boxcolor = "transparent";
      if (data.properties) {
        this.properties = { ...DEFAULT_LABEL_PROPS, ...data.properties };
        if (this.properties.fontFamily) loadWebFont(this.properties.fontFamily);
      }
    }
  }

  DSLabelNode.title = "DS Label";
  DSLabelNode.desc = "Aesthetic slotless canvas annotation entity";
  DSLabelNode.type = NODE_TYPE;
  DSLabelNode.comfyClass = NODE_TYPE;
  DSLabelNode.isVirtualNode = true;
  DSLabelNode.prototype.comfyClass = NODE_TYPE;
  DSLabelNode.prototype.isVirtualNode = true;
  DSLabelNode.title_mode = 1;
  DSLabelNode.color = "transparent";
  DSLabelNode.bgcolor = "transparent";
  DSLabelNode.boxcolor = "transparent";

  LiteGraph.registerNodeType(NODE_TYPE, DSLabelNode);
  return DSLabelNode;
}

// -----------------------------------------------------------------------------
// DS Label Editor Modal
// -----------------------------------------------------------------------------
const ALIGNMENTS = [
  { id: "left", icon: "align-left", tooltip: "Align Left" },
  { id: "center", icon: "align-center", tooltip: "Align Center" },
  { id: "right", icon: "align-right", tooltip: "Align Right" },
];

const fontOption = (name) => ({ id: name, label: name, style: { fontFamily: `"${name}", system-ui, sans-serif` } });

function buttonGroup(...buttons) {
  const group = document.createElement("div");
  group.className = "ds-ui-btn-group";
  group.append(...buttons.map((b) => b.root));
  return group;
}

let activeModal = null;

function openDSLabelModal(node) {
  activeModal?.close();
  const draft = { ...DEFAULT_LABEL_PROPS, ...(node.properties || {}) };

  const save = () => {
    app.canvas?.emitBeforeChange?.();
    node.properties = { ...draft };
    if (draft.fontFamily) loadWebFont(draft.fontFamily);
    app.canvas?.emitAfterChange?.();
    dirty(node.graph || app?.graph);
    modal.close();
  };

  const modal = Modal({
    title: "DS Label Configuration",
    subtitle: "Canvas Banner & Typography Studio",
    icon: "type",
    width: 520,
    onClose: () => { activeModal = null; },
    onKeyDown: (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
    },
  });

  // Content & live preview
  const stage = document.createElement("div");
  stage.className = "ds-label-stage";
  const preview = document.createElement("div");
  preview.className = "ds-label-preview";
  const badge = document.createElement("div");
  badge.className = "ds-label-stage-badge";
  stage.append(preview, badge);

  const updatePreview = () => {
    preview.textContent = draft.text || "Label Preview";
    Object.assign(preview.style, {
      fontFamily: `"${draft.fontFamily}", system-ui, sans-serif`,
      fontSize: `${draft.fontSize}px`,
      fontWeight: draft.bold ? "bold" : "normal",
      fontStyle: draft.italic ? "italic" : "normal",
      textDecoration: draft.underline ? "underline" : "none",
      textAlign: draft.textAlign,
      color: draft.textColor,
      backgroundColor: draft.isTransparent ? "transparent" : draft.backgroundColor,
      padding: `${draft.padding}px`,
      borderRadius: `${draft.borderRadius}px`,
      opacity: draft.opacity,
      lineHeight: draft.lineHeight,
    });
    badge.textContent = `${draft.fontFamily} • ${draft.fontSize}px • ${Math.round(draft.opacity * 100)}%`;
  };

  const text = TextEditor({
    value: draft.text,
    rows: 2,
    placeholder: "Enter label text... (supports multi-line text)",
    onChange: (v) => { draft.text = v; updatePreview(); },
  });

  // Typography
  const font = Dropdown({
    label: "Font",
    value: draft.fontFamily,
    searchable: true,
    options: CURATED_FONTS.map((f) => fontOption(f.name)),
    onChange: (v) => { draft.fontFamily = v; loadWebFont(v); updatePreview(); },
  });
  if (typeof window.queryLocalFonts === "function") {
    window.queryLocalFonts().then((fonts) => {
      const names = new Set(CURATED_FONTS.map((f) => f.name.toLowerCase()));
      const local = [...new Set(fonts.map((f) => f.family))].filter((n) => !names.has(n.toLowerCase()));
      if (local.length) font.setOptions([...CURATED_FONTS.map((f) => fontOption(f.name)), { separator: true }, ...local.map(fontOption)]);
    }).catch(() => {});
  }

  const styleToggle = (key, icon, tooltip) => Button({
    icon,
    tooltip,
    active: draft[key],
    onClick: (_, btn) => { draft[key] = !draft[key]; btn.setActive(draft[key]); updatePreview(); },
  });
  const bold = styleToggle("bold", "bold", "Bold");
  const italic = styleToggle("italic", "italic", "Italic");
  const underline = styleToggle("underline", "underline", "Underline");

  const alignBtns = ALIGNMENTS.map((a) => Button({
    icon: a.icon,
    tooltip: a.tooltip,
    onClick: () => { draft.textAlign = a.id; syncAlign(); updatePreview(); },
  }));
  const syncAlign = () => alignBtns.forEach((b, i) => b.setActive(ALIGNMENTS[i].id === draft.textAlign));
  syncAlign();

  const typoRow = document.createElement("div");
  typoRow.className = "ds-label-row";
  typoRow.append(font.root, buttonGroup(bold, italic, underline), buttonGroup(...alignBtns));

  const fontSize = Slider({
    label: "Font Size",
    min: 8, max: 256, step: 1,
    value: draft.fontSize,
    onChange: (v) => { draft.fontSize = v; updatePreview(); },
  });

  // Colors
  const bgColor = ColorPicker({
    title: "Background Color",
    value: draft.backgroundColor,
    onChange: (c) => { draft.backgroundColor = c; updatePreview(); },
  });
  const textColor = ColorPicker({
    title: "Text Color",
    value: draft.textColor,
    onChange: (c) => { draft.textColor = c; updatePreview(); },
  });
  const transparent = Toggle({
    label: "Transparent background",
    checked: draft.isTransparent,
    onChange: (v) => { draft.isTransparent = v; bgColor.setDisabled(v); updatePreview(); },
  });
  bgColor.setDisabled(draft.isTransparent);

  const colorGrid = document.createElement("div");
  colorGrid.className = "ds-label-grid";
  colorGrid.append(
    Field({ label: "Background", control: bgColor }).root,
    Field({ label: "Text", control: textColor }).root,
  );

  // Geometry
  const padding = Slider({ label: "Padding", min: 0, max: 100, step: 1, value: draft.padding, onChange: (v) => { draft.padding = v; updatePreview(); } });
  const radius = Slider({ label: "Radius", min: 0, max: 64, step: 1, value: draft.borderRadius, onChange: (v) => { draft.borderRadius = v; updatePreview(); } });
  const opacity = Slider({ label: "Opacity %", min: 0, max: 100, step: 1, value: Math.round(draft.opacity * 100), onChange: (v) => { draft.opacity = v / 100; updatePreview(); } });
  const lineHeight = Slider({ label: "Line Height", min: 0.8, max: 3, step: 0.05, value: draft.lineHeight, onChange: (v) => { draft.lineHeight = v; updatePreview(); } });

  const geometryGrid = document.createElement("div");
  geometryGrid.className = "ds-label-grid";
  geometryGrid.append(padding.root, radius.root, opacity.root, lineHeight.root);

  modal.body.append(
    Card({ title: "Label Content & Live Preview", icon: "edit", children: [text, stage] }).root,
    Card({ title: "Typography & Formatting", icon: "sliders", children: [typoRow, fontSize] }).root,
    Card({ title: "Color Studio", icon: "palette", children: [colorGrid, transparent] }).root,
    Card({ title: "Geometry, Spacing & Opacity", icon: "maximize-2", children: [geometryGrid] }).root,
  );

  // Footer
  const reset = Button({
    icon: "rotate-ccw",
    label: "Reset Defaults",
    onClick: () => {
      Object.assign(draft, DEFAULT_LABEL_PROPS);
      text.setValue(draft.text);
      font.setValue(draft.fontFamily);
      bold.setActive(draft.bold);
      italic.setActive(draft.italic);
      underline.setActive(draft.underline);
      syncAlign();
      fontSize.setValue(draft.fontSize);
      bgColor.setValue(draft.backgroundColor);
      textColor.setValue(draft.textColor);
      transparent.setValue(draft.isTransparent);
      bgColor.setDisabled(draft.isTransparent);
      padding.setValue(draft.padding);
      radius.setValue(draft.borderRadius);
      opacity.setValue(Math.round(draft.opacity * 100));
      lineHeight.setValue(draft.lineHeight);
      updatePreview();
    },
  });
  const spacer = document.createElement("span");
  spacer.style.flex = "1";
  const cancel = Button({ label: "Cancel", onClick: () => modal.close() });
  const saveBtn = Button({ icon: "check", label: "Save Label", variant: "primary", onClick: save });
  modal.footer.append(reset.root, spacer, cancel.root, saveBtn.root);

  updatePreview();
  activeModal = modal.open();
}

// -----------------------------------------------------------------------------
// Web Extension Registration
// -----------------------------------------------------------------------------
if (typeof globalThis.LiteGraph !== "undefined") {
  registerDSLabelNodeType();
}

app.registerExtension({
  name: EXTENSION_NAME,

  async init() {
    registerDSLabelNodeType();
  },

  async setup() {
    registerDSLabelNodeType();

    // Connect with DSGearMenu registry
    const registerGear = () => {
      if (window.DSGearMenu) {
        window.DSGearMenu.register(NODE_TYPE, {
          tooltip: "DS Label Configuration",
          onClick: (node) => {
            openDSLabelModal(node);
          },
        });
        return true;
      }
      return false;
    };
    if (!registerGear()) {
      setTimeout(registerGear, 500);
    }

    const markExisting = () => {
      const graph = app.graph;
      if (!graph || !graph._nodes) return;
      for (const node of graph._nodes) {
        if (node.type === NODE_TYPE || node.constructor?.name === "DSLabelNode") {
          node.isVirtualNode = true;
          node.comfyClass = NODE_TYPE;
        }
      }
    };
    markExisting();
    setTimeout(markExisting, 100);
    setTimeout(markExisting, 1000);

    console.log("[DS Label] Entity & Editor Modal registered");
  },

  nodeCreated(node) {
    attachNodeShortcuts(node);
    if (node.type === NODE_TYPE || node.constructor?.name === "DSLabelNode") {
      node.isVirtualNode = true;
      node.comfyClass = NODE_TYPE;
    }
  },

  async afterConfigureGraph() {
    const graph = app.graph;
    if (!graph || !graph._nodes) return;
    for (const node of graph._nodes) {
      if (node.type === NODE_TYPE || node.constructor?.name === "DSLabelNode") {
        node.isVirtualNode = true;
        node.comfyClass = NODE_TYPE;
      }
    }
  },

  getCanvasMenuItems(canvas) {
    return [
      {
        content: "Add DS Label",
        callback: (item, opt, mouseEvent) => {
          const LiteGraph = globalThis.LiteGraph;
          const graph = canvas?.graph || app?.graph;
          let node = LiteGraph?.createNode?.(NODE_TYPE);
          if (!node) {
            const Ctor = registerDSLabelNodeType();
            if (Ctor) node = new Ctor();
          }
          if (node && graph) {
            let pos = [200, 200];
            if (mouseEvent && canvas?.convertEventToCanvasOffset) {
              pos = canvas.convertEventToCanvasOffset(mouseEvent);
            } else if (canvas?.last_mouse_position) {
              pos = [...canvas.last_mouse_position];
            } else if (canvas?.graph_mouse) {
              pos = [...canvas.graph_mouse];
            } else {
              const offset = canvas?.offset || [0, 0];
              const scale = canvas?.ds?.scale || canvas?.scale || 1;
              const x = (-offset[0] + window.innerWidth / 2) / scale;
              const y = (-offset[1] + window.innerHeight / 2) / scale;
              pos = [Math.round(x - 140), Math.round(y - 40)];
            }
            node.pos = pos;
            graph.add(node);
            canvas?.selectNode?.(node, false);
            dirty(graph);
          }
        },
      },
    ];
  },
});

export { openDSLabelModal };
