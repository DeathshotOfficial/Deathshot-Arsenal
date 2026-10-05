import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import {
    Card,
    Button,
    DSIcon,
    normalizeDSWidgetHost,
    protectDSResizeCorners,
} from "../UIElements/index.js";

const CSS_PATH = "/extensions/DeathshotArsenal/Image%20Compare/ds_image_compare.css?v=6";
const existingLink = document.querySelector(`link[href*="ds_image_compare.css"]`);
if (existingLink) {
    existingLink.href = CSS_PATH;
} else {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_PATH;
    document.head.appendChild(link);
}

const sessionImageCache = new Map();
const sessionNodeCache = new Map();
const failedImageCache = new Set();
const inFlightPromises = new Map();
const activeNodes = new Set();

function loadImage(imgInfo) {
    if (!imgInfo?.filename) return Promise.resolve(null);
    const filename = imgInfo.filename;

    if (sessionImageCache.has(filename)) {
        const cached = sessionImageCache.get(filename);
        if (cached && !cached._dsFilename) cached._dsFilename = filename;
        return Promise.resolve(cached);
    }
    if (failedImageCache.has(filename)) {
        return Promise.resolve(null);
    }
    if (inFlightPromises.has(filename)) {
        return inFlightPromises.get(filename);
    }

    const loadPromise = new Promise((resolve) => {
        const img = new Image();
        const viewUrl = api.apiURL
            ? api.apiURL(`/view?filename=${encodeURIComponent(filename)}&type=${imgInfo.type || "temp"}&subfolder=${encodeURIComponent(imgInfo.subfolder || "")}`)
            : `/view?filename=${encodeURIComponent(filename)}&type=${imgInfo.type || "temp"}&subfolder=${encodeURIComponent(imgInfo.subfolder || "")}`;

        img.onload = () => {
            img._dsFilename = filename;
            inFlightPromises.delete(filename);
            sessionImageCache.set(filename, img);
            resolve(img);
        };
        img.onerror = () => {
            inFlightPromises.delete(filename);
            failedImageCache.add(filename);
            resolve(null);
        };
        img.src = viewUrl;
    });

    inFlightPromises.set(filename, loadPromise);
    return loadPromise;
}

function loadCompareImages(node, d1, d2) {
    const filenameA = d1?.filename || null;
    const filenameB = d2?.filename || null;

    const hasA = !filenameA ? !node.imgA : (node.imgA?._dsFilename === filenameA);
    const hasB = !filenameB ? !node.imgB : (node.imgB?._dsFilename === filenameB);
    if (hasA && hasB) {
        node._dsRender?.();
        node.setDirtyCanvas?.(true, true);
        return Promise.resolve();
    }

    let immediateUpdate = false;
    if (filenameA && sessionImageCache.has(filenameA)) {
        const cachedA = sessionImageCache.get(filenameA);
        if (cachedA && !cachedA._dsFilename) cachedA._dsFilename = filenameA;
        node.imgA = cachedA;
        immediateUpdate = true;
    }
    if (filenameB && sessionImageCache.has(filenameB)) {
        const cachedB = sessionImageCache.get(filenameB);
        if (cachedB && !cachedB._dsFilename) cachedB._dsFilename = filenameB;
        node.imgB = cachedB;
        immediateUpdate = true;
    }
    if (immediateUpdate) {
        node._dsRender?.();
        node.setDirtyCanvas?.(true, true);
    }

    const nowHasA = !filenameA ? !node.imgA : (node.imgA?._dsFilename === filenameA);
    const nowHasB = !filenameB ? !node.imgB : (node.imgB?._dsFilename === filenameB);
    if (nowHasA && nowHasB) {
        return Promise.resolve();
    }

    return Promise.all([loadImage(d1), loadImage(d2)]).then(([i1, i2]) => {
        node.imgA = filenameA ? (i1 || null) : null;
        node.imgB = filenameB ? (i2 || null) : null;

        if (!node.imgA && !node.imgB && (filenameA || filenameB)) {
            if (node.properties) {
                delete node.properties.ds_cmp_a;
                delete node.properties.ds_cmp_b;
                delete node.properties.ds_dims_a;
                delete node.properties.ds_dims_b;
            }
            node.dimsA = null;
            node.dimsB = null;
        }

        node._dsRender?.();
        node.setDirtyCanvas?.(true, true);
    });
}

function handleExecution(node, output) {
    if (output?.images) delete output.images;
    node.imgs = null;

    const data = output?.compare_images;
    if (!data) return;

    const [d1, d2] = data;
    const dimsA = output.dims?.a || null;
    const dimsB = output.dims?.b || null;

    node.dimsA = dimsA;
    node.dimsB = dimsB;

    node.properties = node.properties || {};
    node.properties.ds_cmp_a = d1;
    node.properties.ds_cmp_b = d2;
    node.properties.ds_dims_a = dimsA;
    node.properties.ds_dims_b = dimsB;

    if (d1?.filename) failedImageCache.delete(d1.filename);
    if (d2?.filename) failedImageCache.delete(d2.filename);

    sessionNodeCache.set(String(node.id), { d1, d2, dimsA, dimsB });
    loadCompareImages(node, d1, d2);
}

function resolveTheme(node) {
    let isLight = false;

    try {
        if (document.documentElement.classList.contains("light") || document.body.classList.contains("light")) {
            isLight = true;
        } else {
            const bg = window.getComputedStyle(document.body).backgroundColor || "";
            const m = bg.match(/\d+/g);
            if (m && m.length >= 3) {
                const lum = 0.299 * Number(m[0]) + 0.587 * Number(m[1]) + 0.114 * Number(m[2]);
                if (lum > 140) isLight = true;
            }
        }
    } catch (_) {}

    const getVar = (name, fallback) => {
        try {
            const cs = window.getComputedStyle(document.documentElement);
            const v = cs.getPropertyValue(name).trim();
            if (v) return v;
        } catch {}
        try {
            const bs = window.getComputedStyle(document.body);
            const v = bs.getPropertyValue(name).trim();
            if (v) return v;
        } catch {}
        try {
            const global = window.DSGlobalTheme;
            const v = global?.getVar?.(name, "");
            if (v) return String(v).trim();
        } catch {}
        return fallback;
    };

    const accent = node?.properties?.ds_cp_accent ||
        getVar("--ds-color-accent", getVar("--ds-accent", "#67e8f9"));
    const cardBg = getVar("--ds-color-card", getVar("--ds-panel", isLight ? "#ffffff" : "#12151c"));
    const cardBorder = getVar("--ds-color-card-border", getVar("--ds-border", isLight ? "rgba(0, 0, 0, 0.15)" : "#242a36"));
    const surface = getVar("--ds-color-base", getVar("--ds-bg", isLight ? "#f8fafc" : "#0b0d12"));
    const panel = getVar("--ds-color-panel-2", getVar("--ds-panel-2", isLight ? "rgba(0, 0, 0, 0.08)" : "#161a23"));
    const border = getVar("--ds-color-border", getVar("--ds-border", isLight ? "rgba(0, 0, 0, 0.15)" : "#242a36"));
    const text = getVar("--ds-color-text", getVar("--ds-text", isLight ? "#0f172a" : "#e5e7eb"));
    const textMuted = getVar("--ds-color-muted-text", getVar("--ds-text-muted", isLight ? "rgba(15, 23, 42, 0.55)" : "#9ca3af"));
    const match = getVar("--ds-color-success", isLight ? "#16a34a" : "#34d399");

    return {
        isLight,
        cardBg,
        cardBorder,
        surface,
        panel,
        border,
        text,
        textMuted,
        accent,
        match,
        sliderLine: accent,
        handleBorder: accent,
        handlePuckBg: isLight ? "#ffffff" : (panel || "#161a23"),
    };
}

function getAspectFitBox(img, w, h) {
    const imgW = img.naturalWidth || img.width || w;
    const imgH = img.naturalHeight || img.height || h;
    if (!imgW || !imgH) return { x: 0, y: 0, w, h };

    const imgAspect = imgW / imgH;
    const canvasAspect = w / h;
    let drawW, drawH, offX = 0, offY = 0;

    if (imgAspect > canvasAspect) {
        drawW = w;
        drawH = w / imgAspect;
        offY = (h - drawH) / 2;
    } else {
        drawH = h;
        drawW = h * imgAspect;
        offX = (w - drawW) / 2;
    }

    return { x: offX, y: offY, w: drawW, h: drawH };
}

function drawImageInBox(ctx, img, box) {
    if (!img) return;
    ctx.drawImage(img, box.x, box.y, box.w, box.h);
}

function drawBadge(ctx, x, y, text, dotColor, badgeW = 32, badgeH = 18) {
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, badgeW, badgeH, 4);
    else ctx.rect(x, y, badgeW, badgeH);
    ctx.fillStyle = "rgba(15, 18, 26, 0.88)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 9px Inter, sans-serif";

    if (text.startsWith("● ")) {
        ctx.fillStyle = dotColor;
        ctx.fillText("●", x + 8, y + badgeH / 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text.slice(2), x + badgeW / 2 + 4, y + badgeH / 2);
    } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x + badgeW / 2, y + badgeH / 2);
    }
    ctx.restore();
}

/**
 * Top-lane Resolution HUD rendered directly on node canvas foreground.
 * Kept outside of the Card to preserve clean separation of concerns.
 */
function drawResolutionHUD(node, ctx) {
    if (node.flags?.collapsed) return;
    const w = Number(node.size?.[0]) || 512;
    const theme = resolveTheme(node);
    const hudY = 8;
    const hudH = 34;

    let maxLabelW = 50;
    ctx.font = "bold 12px Inter, system-ui, sans-serif";
    for (const input of node.inputs || []) {
        const labelText = input.label || input.name || "";
        const lw = ctx.measureText(labelText).width;
        if (lw > maxLabelW) maxLabelW = lw;
    }

    const slotTextStartX = 18;
    const slotMargin = 22;
    const leftX = Math.max(92, Math.round(slotTextStartX + maxLabelW + slotMargin));
    const rightMargin = 8;
    const hudW = Math.max(120, w - leftX - rightMargin);

    const imgA = node._swapped ? node.imgB : node.imgA;
    const imgB = node._swapped ? node.imgA : node.imgB;
    const labelA = node._swapped ? "IMAGE B" : "IMAGE A";
    const labelB = node._swapped ? "IMAGE A" : "IMAGE B";

    const wA = (node._swapped ? node.dimsB?.[0] : node.dimsA?.[0]) || imgA?.naturalWidth || imgA?.width || 0;
    const hA = (node._swapped ? node.dimsB?.[1] : node.dimsA?.[1]) || imgA?.naturalHeight || imgA?.height || 0;
    const wB = (node._swapped ? node.dimsA?.[0] : node.dimsB?.[0]) || imgB?.naturalWidth || imgB?.width || 0;
    const hB = (node._swapped ? node.dimsA?.[1] : node.dimsB?.[1]) || imgB?.naturalHeight || imgB?.height || 0;

    const hasA = wA > 0 && hA > 0;
    const hasB = wB > 0 && hB > 0;

    const pxA = hasA ? wA * hA : 0;
    const pxB = hasB ? wB * hB : 0;
    const mpA = hasA ? (pxA / 1000000).toFixed(2) : "--";
    const mpB = hasB ? (pxB / 1000000).toFixed(2) : "--";

    let cmpText = "VS";
    let aIsHigher = false;
    let bIsHigher = false;

    if (hasA && hasB) {
        if (pxA === pxB) {
            cmpText = wA === wB && hA === hB ? "1:1 MATCH" : "SAME MP";
        } else if (pxA > pxB) {
            aIsHigher = true;
            const diffPct = Math.round(((pxA - pxB) / pxB) * 100);
            cmpText = `◀ +${diffPct}%`;
        } else {
            bIsHigher = true;
            const diffPct = Math.round(((pxB - pxA) / pxA) * 100);
            cmpText = `+${diffPct}% ▶`;
        }
    } else if (!hasA && !hasB) {
        cmpText = "NO INPUT";
    }

    ctx.save();

    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(leftX, hudY, hudW, hudH, 6);
    } else {
        ctx.rect(leftX, hudY, hudW, hudH);
    }
    ctx.fillStyle = theme.panel;
    ctx.fill();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();

    const colW = (hudW - 60) / 2;
    const colAX = leftX + 8 + colW / 2;
    const midX = leftX + hudW / 2;
    const colBX = leftX + hudW - 8 - colW / 2;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const numFont = colW < 75 ? "bold 9.5px Inter, monospace, sans-serif" : "bold 10px Inter, monospace, sans-serif";

    // Left Column Info
    ctx.font = "bold 8.5px Inter, system-ui, sans-serif";
    ctx.fillStyle = aIsHigher ? theme.accent : (hasA ? theme.text : theme.textMuted);
    ctx.fillText(aIsHigher ? `${labelA} ▲` : labelA, colAX, hudY + 8);

    ctx.font = numFont;
    ctx.fillStyle = hasA ? theme.text : theme.textMuted;
    const resA = hasA ? `${wA}×${hA}` : "----×----";
    ctx.fillText(resA, colAX, hudY + 18);

    ctx.font = "700 7.5px Inter, sans-serif";
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(hasA ? `${mpA} MP` : "--", colAX, hudY + 26);

    // Center Status Badge
    ctx.font = "bold 8.5px Inter, monospace, sans-serif";
    ctx.fillStyle = (hasA && hasB && pxA === pxB) ? theme.match : theme.accent;
    ctx.fillText(cmpText, midX, hudY + 17);

    // Right Column Info
    ctx.font = "bold 8.5px Inter, system-ui, sans-serif";
    ctx.fillStyle = bIsHigher ? theme.accent : (hasB ? theme.text : theme.textMuted);
    ctx.fillText(bIsHigher ? `${labelB} ▲` : labelB, colBX, hudY + 8);

    ctx.font = numFont;
    ctx.fillStyle = hasB ? theme.text : theme.textMuted;
    const resB = hasB ? `${wB}×${hB}` : "----×----";
    ctx.fillText(resB, colBX, hudY + 18);

    ctx.font = "700 7.5px Inter, sans-serif";
    ctx.fillStyle = theme.textMuted;
    ctx.fillText(hasB ? `${mpB} MP` : "--", colBX, hudY + 26);

    ctx.restore();
}

/**
 * Native canvas fallback rendering for the Card and image comparison.
 * Executed on native canvas so that when ComfyUI renders canvas frames,
 * the card and comparison preview remain visible.
 */
function drawCanvasPreview(ctx, node) {
    const w = Number(node.size?.[0]) || 512;
    const h = Number(node.size?.[1]) || 512;
    const theme = resolveTheme(node);

    const cardMargin = 5;
    const cardX = cardMargin;
    const cardY = 42 + cardMargin;
    const cardW = w - cardMargin * 2;
    const cardH = h - cardY - cardMargin;
    if (cardW <= 0 || cardH <= 0) return;

    ctx.save();

    // 1. Draw Card Surface
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 8);
    else ctx.rect(cardX, cardY, cardW, cardH);
    ctx.fillStyle = theme.cardBg;
    ctx.fill();
    ctx.strokeStyle = theme.cardBorder;
    ctx.lineWidth = 1;
    ctx.stroke();

    // 2. Card Header title
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    ctx.fillStyle = theme.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("IMAGE COMPARE", cardX + 10, cardY + 14);

    // 3. Preview Container Frame matching .ds-ui-compare-viewport
    const previewPad = 10;
    const previewX = cardX + previewPad;
    const previewY = cardY + 46;
    const previewW = cardW - previewPad * 2;
    const previewH = cardH - 46 - previewPad;

    if (previewW <= 0 || previewH <= 0) {
        ctx.restore();
        return;
    }

    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(previewX, previewY, previewW, previewH, 8);
    else ctx.rect(previewX, previewY, previewW, previewH);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.strokeStyle = theme.cardBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.clip();

    const imgA = node._swapped ? node.imgB : node.imgA;
    const imgB = node._swapped ? node.imgA : node.imgB;
    const labelA = node._swapped ? "B" : "A";
    const labelB = node._swapped ? "A" : "B";

    if (!imgA && !imgB) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 12px Inter, system-ui, sans-serif";
        ctx.fillStyle = theme.text;
        ctx.fillText("CONNECT IMAGE A & B", previewX + previewW / 2, previewY + previewH / 2 - 8);

        ctx.font = "10px Inter, system-ui, sans-serif";
        ctx.fillStyle = theme.textMuted;
        ctx.fillText("Run the workflow to compare images.", previewX + previewW / 2, previewY + previewH / 2 + 10);
        ctx.restore();
        ctx.restore();
        return;
    }

    if (imgA && !imgB) {
        const box = getAspectFitBox(imgA, previewW, previewH);
        ctx.drawImage(imgA, previewX + box.x, previewY + box.y, box.w, box.h);
        drawBadge(ctx, previewX + 8, previewY + 8, `● ${labelA}`, theme.accent);
        ctx.restore();
        ctx.restore();
        return;
    }

    if (!imgA && imgB) {
        const box = getAspectFitBox(imgB, previewW, previewH);
        ctx.drawImage(imgB, previewX + box.x, previewY + box.y, box.w, box.h);
        drawBadge(ctx, previewX + previewW - 40, previewY + 8, `● ${labelB}`, theme.accent);
        ctx.restore();
        ctx.restore();
        return;
    }

    const baseImg = imgA || imgB;
    const box = getAspectFitBox(baseImg, previewW, previewH);

    if (node.mode === "a") {
        ctx.drawImage(imgA, previewX + box.x, previewY + box.y, box.w, box.h);
        drawBadge(ctx, previewX + 8, previewY + 8, `● ${labelA}`, theme.accent);
    } else if (node.mode === "b") {
        ctx.drawImage(imgB, previewX + box.x, previewY + box.y, box.w, box.h);
        drawBadge(ctx, previewX + previewW - 40, previewY + 8, `● ${labelB}`, theme.accent);
    } else if (node.mode === "diff") {
        ctx.drawImage(imgA, previewX + box.x, previewY + box.y, box.w, box.h);
        ctx.globalCompositeOperation = "difference";
        ctx.drawImage(imgB, previewX + box.x, previewY + box.y, box.w, box.h);
        ctx.globalCompositeOperation = "source-over";
        drawBadge(ctx, previewX + 8, previewY + 8, `● DIFF`, theme.accent, 46);
    } else {
        // Split mode
        const sliderX = Math.round(previewW * node.ratio);

        ctx.save();
        ctx.beginPath();
        ctx.rect(previewX, previewY, sliderX, previewH);
        ctx.clip();
        ctx.drawImage(imgA, previewX + box.x, previewY + box.y, box.w, box.h);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(previewX + sliderX, previewY, previewW - sliderX, previewH);
        ctx.clip();
        ctx.drawImage(imgB, previewX + box.x, previewY + box.y, box.w, box.h);
        ctx.restore();

        const divX = previewX + sliderX;
        ctx.beginPath();
        ctx.moveTo(divX, previewY);
        ctx.lineTo(divX, previewY + previewH);
        ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(divX, previewY);
        ctx.lineTo(divX, previewY + previewH);
        ctx.strokeStyle = theme.sliderLine;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const puckY = previewY + previewH / 2;
        ctx.beginPath();
        ctx.arc(divX, puckY, 11, 0, Math.PI * 2);
        ctx.fillStyle = theme.handlePuckBg;
        ctx.fill();
        ctx.strokeStyle = theme.handleBorder;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        // Left chevron
        ctx.beginPath();
        ctx.moveTo(divX - 2, puckY - 3.5);
        ctx.lineTo(divX - 5.5, puckY);
        ctx.lineTo(divX - 2, puckY + 3.5);
        ctx.stroke();
        // Right chevron
        ctx.beginPath();
        ctx.moveTo(divX + 2, puckY - 3.5);
        ctx.lineTo(divX + 5.5, puckY);
        ctx.lineTo(divX + 2, puckY + 3.5);
        ctx.stroke();

        const alphaA = Math.max(0, Math.min(1, (sliderX - 12) / 36));
        const alphaB = Math.max(0, Math.min(1, (previewW - sliderX - 12) / 36));

        if (alphaA > 0.02) {
            ctx.save();
            ctx.globalAlpha = alphaA;
            drawBadge(ctx, previewX + 8, previewY + 8, `● ${labelA}`, theme.accent);
            ctx.restore();
        }

        if (alphaB > 0.02) {
            ctx.save();
            ctx.globalAlpha = alphaB;
            drawBadge(ctx, previewX + previewW - 40, previewY + 8, `● ${labelB}`, theme.accent);
            ctx.restore();
        }
    }

    ctx.restore();
    ctx.restore();
}

app.registerExtension({
    name: "Deathshot.ImageCompare",
    setup() {
        api.addEventListener("executed", (e) => {
            const data = e.detail;
            const output = data?.output;
            if (!output?.compare_images) return;

            const [d1, d2] = output.compare_images;
            const dimsA = output.dims?.a || null;
            const dimsB = output.dims?.b || null;

            sessionNodeCache.set(String(data.node), { d1, d2, dimsA, dimsB });

            if (d1?.filename) failedImageCache.delete(d1.filename);
            if (d2?.filename) failedImageCache.delete(d2.filename);

            loadImage(d1);
            loadImage(d2);

            let handled = false;
            let node = app.graph?.getNodeById?.(data.node);
            if (!node) node = (app.graph?._nodes || []).find((n) => String(n.id) === String(data.node));
            if (node && (node.type === "DS_ImageCompare" || node.comfyClass === "DS_ImageCompare")) {
                handleExecution(node, output);
                handled = true;
            }

            for (const n of activeNodes) {
                if (String(n.id) === String(data.node)) {
                    handleExecution(n, output);
                    handled = true;
                }
            }

            if (!handled) {
                const wm = app.workflowManager || app.extensionManager?.workflow;
                if (wm) {
                    const wfs = wm.workflows || wm.openWorkflows || [];
                    const list = Array.isArray(wfs) ? wfs : Object.values(wfs);
                    for (const wf of list) {
                        const g = wf.graph || wf._graph;
                        if (g) {
                            const n = g.getNodeById?.(data.node) || (g._nodes || []).find((x) => String(x.id) === String(data.node));
                            if (n && (n.type === "DS_ImageCompare" || n.comfyClass === "DS_ImageCompare")) {
                                handleExecution(n, output);
                            }
                        }
                    }
                }
            }
        });
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DS_ImageCompare") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            activeNodes.add(this);

            this.resizable = true;
            this.setSize([512, 512]);

            this.ratio = 0.5;
            this.mode = "split";
            this.autoSnap = true;
            this._swapped = false;
            this.dragging = false;
            this.sliderHovered = false;

            this.imgA = null;
            this.imgB = null;
            this.dimsA = null;
            this.dimsB = null;
            this.imgs = null;

            try {
                window.DSGlobalTheme?.applyNodeBase?.(this);
            } catch (_) {}

            if (!this._dsThemeSubscribed && window.DSGlobalTheme?.subscribe) {
                this._dsThemeSubscribed = true;
                window.DSGlobalTheme.subscribe(() => {
                    try {
                        window.DSGlobalTheme?.applyNodeBase?.(this);
                    } catch (_) {}
                    this._dsRender?.();
                    this.setDirtyCanvas?.(true, true);
                });
            }

            // Sets Card DOM widget baseline Y immediately below 42px sockets/HUD area
            Object.defineProperty(this, "widgets_start_y", {
                configurable: true,
                get() {
                    return 42;
                },
                set() {},
            });

            protectDSResizeCorners(this);

            const baseComputeSize = this.computeSize;
            this.computeSize = function (out) {
                const size = baseComputeSize ? baseComputeSize.call(this, out) : [512, 512];
                size[0] = Math.max(size[0], 380);
                size[1] = Math.max(size[1], 340);
                return size;
            };

            const card = Card({
                title: "IMAGE COMPARE",
                icon: "layers",
                actions: [
                    {
                        icon: "arrow-left-right",
                        tooltip: "Swap Image A ↔ B",
                        onClick: () => {
                            this._swapped = !this._swapped;
                            this._dsRender?.();
                            this.setDirtyCanvas?.(true, true);
                        },
                    },
                    {
                        icon: "snap",
                        tooltip: "Toggle Center Auto-Snap",
                        onClick: (e) => {
                            this.autoSnap = !this.autoSnap;
                            e.currentTarget.classList.toggle("is-active", this.autoSnap);
                            e.currentTarget.title = this.autoSnap
                                ? "Auto-Snap: ON (Snaps to 50% on release)"
                                : "Auto-Snap: OFF (Holds position)";
                        },
                    },
                    {
                        icon: "refresh-cw",
                        tooltip: "Reset to Center (50%)",
                        onClick: () => {
                            this.mode = "split";
                            syncToolbar();
                            this.ratio = 0.5;
                            this._dsRender?.();
                            this.setDirtyCanvas?.(true, false);
                        },
                    },
                ],
            });

            card.root.style.boxSizing = "border-box";
            card.root.style.width = "100%";
            card.root.style.height = "100%";
            card.root.style.display = "flex";
            card.root.style.flexDirection = "column";
            card.root.style.overflow = "hidden";

            card.body.style.display = "flex";
            card.body.style.flexDirection = "column";
            card.body.style.flex = "1 1 auto";
            card.body.style.minHeight = "0";
            card.body.style.overflow = "hidden";

            const snapBtn = card.head?.querySelector('button[title*="Auto-Snap"]');
            if (snapBtn && this.autoSnap) {
                snapBtn.classList.add("is-active");
            }

            // Toolbar with mode switches and split presets
            const toolbar = document.createElement("div");
            toolbar.className = "ds-ui-compare-toolbar";

            const modeGroup = document.createElement("div");
            modeGroup.className = "ds-ui-compare-group";

            const btnSplit = Button({
                label: "Split",
                icon: "sliders",
                size: "compact",
                active: true,
                onClick: () => {
                    this.mode = "split";
                    syncToolbar();
                    this._dsRender?.();
                    this.setDirtyCanvas?.(true, false);
                },
            });

            const btnDiff = Button({
                label: "Diff",
                icon: "sparkles",
                size: "compact",
                active: false,
                onClick: () => {
                    this.mode = "diff";
                    syncToolbar();
                    this._dsRender?.();
                    this.setDirtyCanvas?.(true, false);
                },
            });

            const btnA = Button({
                label: "A Only",
                size: "compact",
                active: false,
                onClick: () => {
                    this.mode = "a";
                    syncToolbar();
                    this._dsRender?.();
                    this.setDirtyCanvas?.(true, false);
                },
            });

            const btnB = Button({
                label: "B Only",
                size: "compact",
                active: false,
                onClick: () => {
                    this.mode = "b";
                    syncToolbar();
                    this._dsRender?.();
                    this.setDirtyCanvas?.(true, false);
                },
            });

            modeGroup.append(btnSplit.root, btnDiff.root, btnA.root, btnB.root);

            const presetGroup = document.createElement("div");
            presetGroup.className = "ds-ui-compare-group";

            const btnP0 = Button({
                label: "0%",
                size: "compact",
                onClick: () => {
                    this.mode = "split";
                    this.ratio = 0;
                    syncToolbar();
                    this._dsRender?.();
                    this.setDirtyCanvas?.(true, false);
                },
            });

            const btnP50 = Button({
                label: "50%",
                size: "compact",
                onClick: () => {
                    this.mode = "split";
                    this.ratio = 0.5;
                    syncToolbar();
                    this._dsRender?.();
                    this.setDirtyCanvas?.(true, false);
                },
            });

            const btnP100 = Button({
                label: "100%",
                size: "compact",
                onClick: () => {
                    this.mode = "split";
                    this.ratio = 1;
                    syncToolbar();
                    this._dsRender?.();
                    this.setDirtyCanvas?.(true, false);
                },
            });

            presetGroup.append(btnP0.root, btnP50.root, btnP100.root);
            toolbar.append(modeGroup, presetGroup);

            // Framed preview container matching DS Image Preview structure
            const viewport = document.createElement("div");
            viewport.className = "ds-ui-compare-viewport";

            const placeholder = document.createElement("div");
            placeholder.className = "ds-compare-placeholder";
            placeholder.innerHTML = `
                <strong>CONNECT IMAGE A & B</strong>
                <span>Run the workflow to compare images.</span>
            `;

            // Aspect-fit stage container holding comparison layers
            const stage = document.createElement("div");
            stage.className = "ds-compare-stage";
            stage.style.display = "none";

            // Screen container strictly clipping images
            const screen = document.createElement("div");
            screen.className = "ds-compare-screen";

            const imgElementB = document.createElement("img");
            imgElementB.className = "ds-compare-img ds-compare-img-b";
            imgElementB.draggable = false;
            imgElementB.alt = "Image B";

            const imgElementA = document.createElement("img");
            imgElementA.className = "ds-compare-img ds-compare-img-a";
            imgElementA.draggable = false;
            imgElementA.alt = "Image A";

            screen.append(imgElementB, imgElementA);

            // Split divider line, circular puck handle and drag tooltip
            const divider = document.createElement("div");
            divider.className = "ds-compare-divider";

            const line = document.createElement("div");
            line.className = "ds-compare-line";

            const puck = document.createElement("div");
            puck.className = "ds-compare-puck";
            puck.title = "Drag to compare (Double-click to reset 50%)";
            puck.innerHTML = `<svg class="ds-compare-puck-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 3 12 9 6"/><polyline points="15 6 21 12 15 18"/></svg>`;

            const tip = document.createElement("div");
            tip.className = "ds-compare-tip";
            tip.textContent = "50%";

            divider.append(line, puck, tip);

            // Corner indicator badges
            const badgeA = document.createElement("div");
            badgeA.className = "ds-compare-badge ds-compare-badge-a";
            badgeA.innerHTML = `<span class="ds-compare-badge-dot"></span><span class="ds-compare-badge-text">A</span>`;

            const badgeB = document.createElement("div");
            badgeB.className = "ds-compare-badge ds-compare-badge-b";
            badgeB.innerHTML = `<span class="ds-compare-badge-dot"></span><span class="ds-compare-badge-text">B</span>`;

            const badgeDiff = document.createElement("div");
            badgeDiff.className = "ds-compare-badge ds-compare-badge-diff";
            badgeDiff.style.display = "none";
            badgeDiff.innerHTML = `<span class="ds-compare-badge-dot"></span><span class="ds-compare-badge-text">DIFF</span>`;

            stage.append(screen, divider, badgeA, badgeB, badgeDiff);
            viewport.append(placeholder, stage);
            card.append(toolbar, viewport);

            const badgeAText = badgeA.querySelector(".ds-compare-badge-text");
            const badgeBText = badgeB.querySelector(".ds-compare-badge-text");

            const syncToolbar = () => {
                btnSplit.setActive(this.mode === "split");
                btnDiff.setActive(this.mode === "diff");
                btnA.setActive(this.mode === "a");
                btnB.setActive(this.mode === "b");
                viewport.style.cursor = this.mode === "split" ? "ew-resize" : "default";
            };

            const applyModeAndSplit = () => {
                const theme = resolveTheme(this);
                card.root.style.setProperty("--ds-compare-accent", theme.accent);
                card.root.style.setProperty("--ds-compare-panel", theme.handlePuckBg);

                const hasA = Boolean(this.imgA);
                const hasB = Boolean(this.imgB);

                if (!hasA && !hasB) {
                    placeholder.hidden = false;
                    stage.style.display = "none";
                    return;
                }

                placeholder.hidden = true;
                stage.style.display = "block";

                const imgA = this._swapped ? this.imgB : this.imgA;
                const imgB = this._swapped ? this.imgA : this.imgB;
                const labelA = this._swapped ? "B" : "A";
                const labelB = this._swapped ? "A" : "B";

                const nextSrcA = imgA?.src || "";
                if (nextSrcA && imgElementA.getAttribute("src") !== nextSrcA) {
                    imgElementA.src = nextSrcA;
                } else if (!nextSrcA && imgElementA.getAttribute("src")) {
                    imgElementA.removeAttribute("src");
                }

                const nextSrcB = imgB?.src || "";
                if (nextSrcB && imgElementB.getAttribute("src") !== nextSrcB) {
                    imgElementB.src = nextSrcB;
                } else if (!nextSrcB && imgElementB.getAttribute("src")) {
                    imgElementB.removeAttribute("src");
                }

                if (imgA && !imgB) {
                    imgElementA.style.display = "block";
                    imgElementA.style.clipPath = "none";
                    imgElementA.style.mixBlendMode = "normal";
                    imgElementB.style.display = "none";
                    divider.style.display = "none";
                    badgeA.style.display = "flex";
                    badgeA.style.opacity = "1";
                    if (badgeAText) badgeAText.textContent = labelA;
                    badgeB.style.display = "none";
                    badgeDiff.style.display = "none";
                    return;
                }

                if (!imgA && imgB) {
                    imgElementB.style.display = "block";
                    imgElementB.style.clipPath = "none";
                    imgElementB.style.mixBlendMode = "normal";
                    imgElementA.style.display = "none";
                    divider.style.display = "none";
                    badgeB.style.display = "flex";
                    badgeB.style.opacity = "1";
                    if (badgeBText) badgeBText.textContent = labelB;
                    badgeA.style.display = "none";
                    badgeDiff.style.display = "none";
                    return;
                }

                if (this.mode === "a") {
                    imgElementA.style.display = "block";
                    imgElementA.style.clipPath = "none";
                    imgElementA.style.mixBlendMode = "normal";
                    imgElementB.style.display = "none";
                    divider.style.display = "none";
                    badgeA.style.display = "flex";
                    badgeA.style.opacity = "1";
                    if (badgeAText) badgeAText.textContent = labelA;
                    badgeB.style.display = "none";
                    badgeDiff.style.display = "none";
                    return;
                }

                if (this.mode === "b") {
                    imgElementB.style.display = "block";
                    imgElementB.style.clipPath = "none";
                    imgElementB.style.mixBlendMode = "normal";
                    imgElementA.style.display = "none";
                    divider.style.display = "none";
                    badgeB.style.display = "flex";
                    badgeB.style.opacity = "1";
                    if (badgeBText) badgeBText.textContent = labelB;
                    badgeA.style.display = "none";
                    badgeDiff.style.display = "none";
                    return;
                }

                if (this.mode === "diff") {
                    imgElementA.style.display = "block";
                    imgElementA.style.clipPath = "none";
                    imgElementA.style.mixBlendMode = "normal";
                    imgElementA.style.zIndex = "1";

                    imgElementB.style.display = "block";
                    imgElementB.style.clipPath = "none";
                    imgElementB.style.mixBlendMode = "difference";
                    imgElementB.style.zIndex = "2";

                    divider.style.display = "none";
                    badgeA.style.display = "none";
                    badgeB.style.display = "none";
                    badgeDiff.style.display = "flex";
                    return;
                }

                // Split comparison mode
                imgElementA.style.display = "block";
                imgElementA.style.mixBlendMode = "normal";
                imgElementA.style.zIndex = "2";

                imgElementB.style.display = "block";
                imgElementB.style.clipPath = "none";
                imgElementB.style.mixBlendMode = "normal";
                imgElementB.style.zIndex = "1";

                const splitPct = (this.ratio * 100);
                const rightInset = Math.max(0, Math.min(100, 100 - splitPct)).toFixed(2);
                imgElementA.style.clipPath = `inset(0 ${rightInset}% 0 0)`;

                divider.style.display = "block";
                divider.style.left = `${splitPct.toFixed(2)}%`;
                tip.textContent = `${Math.round(splitPct)}%`;

                badgeDiff.style.display = "none";
                if (badgeAText) badgeAText.textContent = labelA;
                if (badgeBText) badgeBText.textContent = labelB;

                const stageW = stage.clientWidth || viewport.clientWidth || 400;
                const sliderPx = stageW * this.ratio;
                const alphaA = Math.max(0, Math.min(1, (sliderPx - 12) / 36));
                const alphaB = Math.max(0, Math.min(1, (stageW - sliderPx - 12) / 36));

                badgeA.style.display = alphaA <= 0.02 ? "none" : "flex";
                badgeA.style.opacity = String(alphaA);
                badgeB.style.display = alphaB <= 0.02 ? "none" : "flex";
                badgeB.style.opacity = String(alphaB);
            };

            const updateLayout = () => {
                const w = viewport.clientWidth;
                const h = viewport.clientHeight;
                if (w <= 0 || h <= 0) return;

                const baseImg = this._swapped ? (this.imgB || this.imgA) : (this.imgA || this.imgB);
                if (!baseImg) {
                    stage.style.display = "none";
                    placeholder.hidden = false;
                    return;
                }

                const baseDims = this._swapped ? (this.dimsB || this.dimsA) : (this.dimsA || this.dimsB);
                const imgW = baseDims?.[0] || baseImg.naturalWidth || baseImg.width || w;
                const imgH = baseDims?.[1] || baseImg.naturalHeight || baseImg.height || h;

                const box = getAspectFitBox({ naturalWidth: imgW, naturalHeight: imgH }, w, h);
                stage.style.left = `${Math.round(box.x)}px`;
                stage.style.top = `${Math.round(box.y)}px`;
                stage.style.width = `${Math.round(box.w)}px`;
                stage.style.height = `${Math.round(box.h)}px`;

                applyModeAndSplit();
            };

            imgElementA.onload = () => {
                updateLayout();
                this.setDirtyCanvas?.(true, true);
            };
            imgElementB.onload = () => {
                updateLayout();
                this.setDirtyCanvas?.(true, true);
            };

            this._dsRender = updateLayout;

            const snapToCenter = () => {
                if (!this.autoSnap || this.mode !== "split") return;
                const startRatio = this.ratio;
                const targetRatio = 0.5;
                if (Math.abs(startRatio - targetRatio) < 0.001) {
                    this.ratio = 0.5;
                    applyModeAndSplit();
                    this.setDirtyCanvas?.(true, false);
                    return;
                }
                const startTime = performance.now();
                const duration = 140;
                const animate = (now) => {
                    if (this.dragging) return;
                    const elapsed = now - startTime;
                    const progress = Math.min(1, elapsed / duration);
                    const ease = 1 - Math.pow(1 - progress, 3);
                    this.ratio = startRatio + (targetRatio - startRatio) * ease;
                    applyModeAndSplit();
                    this.setDirtyCanvas?.(true, false);
                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        this.ratio = 0.5;
                        applyModeAndSplit();
                        this.setDirtyCanvas?.(true, false);
                    }
                };
                requestAnimationFrame(animate);
            };

            const updateSplitFromPointer = (clientX) => {
                const stageRect = stage.getBoundingClientRect();
                if (stageRect.width > 0) {
                    const localX = clientX - stageRect.left;
                    this.ratio = Math.max(0, Math.min(1, localX / stageRect.width));
                    applyModeAndSplit();
                    this.setDirtyCanvas?.(true, false);
                }
            };

            viewport.addEventListener("pointerdown", (e) => {
                if (e.button !== 0) return;
                if (this.mode !== "split") return;

                this.dragging = true;
                divider.classList.add("is-dragging");
                viewport.setPointerCapture(e.pointerId);

                updateSplitFromPointer(e.clientX);
            });

            viewport.addEventListener("pointermove", (e) => {
                if (this.mode !== "split") return;

                if (this.dragging) {
                    updateSplitFromPointer(e.clientX);
                } else {
                    const stageRect = stage.getBoundingClientRect();
                    if (stageRect.width > 0) {
                        const localX = e.clientX - stageRect.left;
                        const sliderX = stageRect.width * this.ratio;
                        const isNear = Math.abs(localX - sliderX) < 14;
                        if (isNear !== this.sliderHovered) {
                            this.sliderHovered = isNear;
                            puck.classList.toggle("is-hovered", isNear);
                        }
                    }
                }
            });

            const onPointerEnd = (e) => {
                if (this.dragging) {
                    this.dragging = false;
                    divider.classList.remove("is-dragging");
                    try {
                        viewport.releasePointerCapture(e.pointerId);
                    } catch (_) {}
                    snapToCenter();
                    this.setDirtyCanvas?.(true, false);
                }
            };

            viewport.addEventListener("pointerup", onPointerEnd);
            viewport.addEventListener("pointercancel", onPointerEnd);

            viewport.addEventListener("pointerleave", () => {
                if (!this.dragging && this.sliderHovered) {
                    this.sliderHovered = false;
                    puck.classList.remove("is-hovered");
                }
            });

            viewport.addEventListener("dblclick", () => {
                this.mode = "split";
                syncToolbar();
                this.ratio = 0.5;
                applyModeAndSplit();
                this.setDirtyCanvas?.(true, false);
            });

            const ro = new ResizeObserver(() => {
                updateLayout();
            });
            ro.observe(viewport);
            this._dsResizeObserver = ro;

            const CARD_MARGIN = 5;
            const MIN_WIDGET_HEIGHT = 274;

            const domWidget = this.addDOMWidget("ds_compare_card", "custom", card.root, {
                serialize: false,
                hideOnZoom: false,
                margin: CARD_MARGIN,
                getMinHeight: () => MIN_WIDGET_HEIGHT,
                getMaxHeight: () => {
                    const widgetY = Number(domWidget?.y ?? this._getWidgetY?.() ?? 42);
                    const nodeHeight = Number(this.size?.[1] ?? 512);
                    return Math.max(MIN_WIDGET_HEIGHT, nodeHeight - widgetY);
                },
            });

            // Native canvas fallback so zoomed out view displays card and preview
            domWidget.draw = (ctx, node) => {
                drawCanvasPreview(ctx, node);
            };

            normalizeDSWidgetHost(card.root, this, { shell: false });
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function (ctx) {
            onDrawForeground?.apply(this, arguments);
            try {
                drawResolutionHUD(this, ctx);
            } catch (e) {
                console.error("[DS ImageCompare] Draw HUD error:", e);
            }
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (output) {
            onExecuted?.apply(this, arguments);
            handleExecution(this, output);
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            onConnectionsChange?.apply(this, arguments);
            for (const input of this.inputs || []) {
                input.label = input.name;
            }
            this.setDirtyCanvas(true, true);
        };

        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            activeNodes.delete(this);
            if (this._dsResizeObserver) {
                this._dsResizeObserver.disconnect();
                this._dsResizeObserver = null;
            }
            return onRemoved?.apply(this, arguments);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
            activeNodes.add(this);

            for (const input of this.inputs || []) {
                input.label = input.name;
            }
            try {
                window.DSGlobalTheme?.applyNodeBase?.(this);
            } catch (_) {}

            this.properties = this.properties || {};
            const saved = sessionNodeCache.get(String(this.id));
            const d1 = saved?.d1 || this.properties.ds_cmp_a;
            const d2 = saved?.d2 || this.properties.ds_cmp_b;
            const dimsA = saved?.dimsA || this.properties.ds_dims_a;
            const dimsB = saved?.dimsB || this.properties.ds_dims_b;

            if (d1 || d2) {
                this.dimsA = dimsA || null;
                this.dimsB = dimsB || null;
                loadCompareImages(this, d1, d2);
            }

            this._dsRender?.();
            this.setDirtyCanvas(true, true);
        };
    },
});