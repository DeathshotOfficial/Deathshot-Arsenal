import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const CSS_PATH = "/extensions/DeathshotArsenal/Image%20Compare/ds_image_compare.css";
if (!document.querySelector(`link[href*="ds_image_compare.css"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_PATH;
    document.head.appendChild(link);
}

const sessionImageCache = new Map();
const sessionNodeCache = new Map();

function loadImage(imgInfo) {
    if (!imgInfo?.filename) return Promise.resolve(null);
    if (sessionImageCache.has(imgInfo.filename)) {
        return Promise.resolve(sessionImageCache.get(imgInfo.filename));
    }
    const img = new Image();
    const viewUrl = api.apiURL
        ? api.apiURL(`/view?filename=${encodeURIComponent(imgInfo.filename)}&type=${imgInfo.type || "temp"}&subfolder=${encodeURIComponent(imgInfo.subfolder || "")}&t=${Date.now()}`)
        : `/view?filename=${encodeURIComponent(imgInfo.filename)}&type=${imgInfo.type || "temp"}&subfolder=${encodeURIComponent(imgInfo.subfolder || "")}&t=${Date.now()}`;
    img.src = viewUrl;
    return new Promise((resolve) => {
        img.onload = () => {
            sessionImageCache.set(imgInfo.filename, img);
            resolve(img);
        };
        img.onerror = () => resolve(null);
    });
}

function loadCompareImages(node, d1, d2) {
    let immediateUpdate = false;
    if (d1?.filename && sessionImageCache.has(d1.filename)) {
        node.imgA = sessionImageCache.get(d1.filename);
        immediateUpdate = true;
    }
    if (d2?.filename && sessionImageCache.has(d2.filename)) {
        node.imgB = sessionImageCache.get(d2.filename);
        immediateUpdate = true;
    }
    if (immediateUpdate) {
        node.setDirtyCanvas?.(true, true);
    }

    return Promise.all([loadImage(d1), loadImage(d2)]).then(([i1, i2]) => {
        if (i1) node.imgA = i1;
        if (i2) node.imgB = i2;
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

    const global = window.DSGlobalTheme;
    const getVar = (name, fallback) => {
        try {
            const v = global?.getVar?.(name, "");
            if (v) return String(v).trim();
        } catch {}
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
        return fallback;
    };

    const primaryText = isLight ? "#0f172a" : "#f8fafc";
    const mutedText = isLight ? "rgba(15, 23, 42, 0.55)" : "rgba(248, 250, 252, 0.55)";

    // Read accent with priority:
    // 1. Node override (ds_cp_accent)
    // 2. DSGlobalTheme.getVar("--ds-accent")
    // 3. CSS variable --ds-accent
    let themeAccent = node?.properties?.ds_cp_accent || getVar("--ds-accent", "#67e8f9");
    if (!themeAccent || themeAccent === "null" || themeAccent === "undefined") {
        themeAccent = "#67e8f9";
    }

    const themePanel = getVar("--ds-panel-2", getVar("--ds-panel", isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(18, 22, 30, 0.75)"));
    const themeBorder = getVar("--ds-border", isLight ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.14)");
    const themeText = getVar("--ds-text", primaryText);
    const themeMuted = getVar("--ds-text-muted", mutedText);

    return {
        isLight,
        panel: themePanel,
        border: themeBorder,
        text: themeText,
        textMuted: themeMuted,
        accent: themeAccent,
        highlight: themeAccent,
        match: isLight ? "#16a34a" : "#4ade80",
        sliderLine: themeAccent,
        handleBorder: themeAccent,
        handlePuckBg: isLight ? "#ffffff" : "rgba(18, 22, 30, 0.94)",
    };
}

function getLayoutMetrics(node) {
    const marginY = 8;
    const hudH = 34;
    const hudY = marginY;
    const contentStartY = hudY + hudH + marginY;

    return { marginY, hudY, hudH, contentStartY };
}

app.registerExtension({
    name: "Deathshot.ImageCompare",
    setup() {
        api.addEventListener("executed", (e) => {
            const data = e.detail;
            const output = data?.output;
            if (!output?.compare_images) return;
            let node = app.graph?.getNodeById?.(data.node);
            if (!node) node = (app.graph?._nodes || []).find((n) => String(n.id) === String(data.node));
            if (!node || node.type !== "DS_ImageCompare") return;
            handleExecution(node, output);
        });
    },
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "DS_ImageCompare") return;

        function drawImageAspectFit(ctx, img, x, y, w, h) {
            const imgW = img.naturalWidth || img.width;
            const imgH = img.naturalHeight || img.height;
            if (!imgW || !imgH) return { x, y, w, h };

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

            const finalX = x + offX;
            const finalY = y + offY;
            ctx.drawImage(img, finalX, finalY, drawW, drawH);
            return { x: finalX, y: finalY, w: drawW, h: drawH };
        }

        function drawResolutionHUD(node, ctx) {
            if (node.flags?.collapsed) return;
            const w = Number(node.size?.[0]) || 512;
            const theme = resolveTheme(node);
            const { hudY, hudH } = getLayoutMetrics(node);

            // Left clearance for input sockets & link labels ("image_a", "image_b") with generous breathing margin
            let maxLabelW = 50;
            ctx.font = "bold 12px Inter, system-ui, sans-serif";
            for (const input of node.inputs || []) {
                const labelText = input.label || input.name || "";
                const lw = ctx.measureText(labelText).width;
                if (lw > maxLabelW) maxLabelW = lw;
            }

            const slotTextStartX = 18; // Slot label start X after connection dot
            const slotMargin = 22;     // Clean spacing between slot label and HUD plate
            const leftX = Math.max(92, Math.round(slotTextStartX + maxLabelW + slotMargin));
            const rightMargin = 8;
            const hudW = Math.max(120, w - leftX - rightMargin);

            const imgA = node.imgA;
            const imgB = node.imgB;
            const wA = node.dimsA?.[0] || imgA?.naturalWidth || imgA?.width || 0;
            const hA = node.dimsA?.[1] || imgA?.naturalHeight || imgA?.height || 0;
            const wB = node.dimsB?.[0] || imgB?.naturalWidth || imgB?.width || 0;
            const hB = node.dimsB?.[1] || imgB?.naturalHeight || imgB?.height || 0;

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

            // Background Plate
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

            // Image A Info
            ctx.font = "bold 8.5px Inter, system-ui, sans-serif";
            ctx.fillStyle = aIsHigher ? theme.accent : (hasA ? theme.text : theme.textMuted);
            ctx.fillText(aIsHigher ? "IMAGE A ▲" : "IMAGE A", colAX, hudY + 8);

            ctx.font = numFont;
            ctx.fillStyle = hasA ? theme.text : theme.textMuted;
            const resA = hasA ? `${wA}×${hA}` : "----×----";
            ctx.fillText(resA, colAX, hudY + 18);

            ctx.font = "700 7.5px Inter, sans-serif";
            ctx.fillStyle = theme.textMuted;
            ctx.fillText(hasA ? `${mpA} MP` : "--", colAX, hudY + 26);

            // Center Status Badge
            ctx.font = "bold 8.5px Inter, monospace, sans-serif";
            if (hasA && hasB) {
                ctx.fillStyle = pxA === pxB ? theme.match : theme.accent;
            } else {
                ctx.fillStyle = theme.accent;
            }
            ctx.fillText(cmpText, midX, hudY + 17);

            // Image B Info
            ctx.font = "bold 8.5px Inter, system-ui, sans-serif";
            ctx.fillStyle = bIsHigher ? theme.accent : (hasB ? theme.text : theme.textMuted);
            ctx.fillText(bIsHigher ? "IMAGE B ▲" : "IMAGE B", colBX, hudY + 8);

            ctx.font = numFont;
            ctx.fillStyle = hasB ? theme.text : theme.textMuted;
            const resB = hasB ? `${wB}×${hB}` : "----×----";
            ctx.fillText(resB, colBX, hudY + 18);

            ctx.font = "700 7.5px Inter, sans-serif";
            ctx.fillStyle = theme.textMuted;
            ctx.fillText(hasB ? `${mpB} MP` : "--", colBX, hudY + 26);

            ctx.restore();
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            this.resizable = true;
            this.setSize([512, 512]);

            this.ratio = 0.5;
            this.dragging = false;
            this.sliderHovered = false;

            this.imgA = null;
            this.imgB = null;
            this.dimsA = null;
            this.dimsB = null;
            this.imgs = null;

            // Apply Deathshot Global Theme to node base (frame & title bar)
            try {
                window.DSGlobalTheme?.applyNodeBase?.(this);
            } catch (_) {}

            // Subscribe to live theme changes so accent updates immediately
            if (!this._dsThemeSubscribed && window.DSGlobalTheme?.subscribe) {
                this._dsThemeSubscribed = true;
                window.DSGlobalTheme.subscribe(() => {
                    try {
                        window.DSGlobalTheme?.applyNodeBase?.(this);
                    } catch (_) {}
                    this.setDirtyCanvas?.(true, true);
                });
            }

            this.widgets_start_y = getLayoutMetrics(this).contentStartY;

            // Snap back to 50% on release
            this.snapToCenter = () => {
                const startRatio = this.ratio;
                const targetRatio = 0.5;
                if (Math.abs(startRatio - targetRatio) < 0.001) {
                    this.ratio = 0.5;
                    this.setDirtyCanvas(true, false);
                    return;
                }
                const startTime = performance.now();
                const duration = 120;
                const animate = (now) => {
                    if (this.dragging) return;
                    const elapsed = now - startTime;
                    const progress = Math.min(1, elapsed / duration);
                    const ease = 1 - Math.pow(1 - progress, 3);
                    this.ratio = startRatio + (targetRatio - startRatio) * ease;
                    this.setDirtyCanvas(true, false);
                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        this.ratio = 0.5;
                        this.setDirtyCanvas(true, false);
                    }
                };
                requestAnimationFrame(animate);
            };

            const widget = {
                name: "ds_compare_canvas",
                type: "custom",
                draw: (ctx, node, width, y) => {
                    const { contentStartY } = getLayoutMetrics(node);
                    node.widgets_start_y = contentStartY;

                    // Extend flush to node boundary (zero bottom gap/padding)
                    const availableH = node.size[1] - contentStartY;
                    if (availableH <= 0) return;

                    const theme = resolveTheme(node);
                    node.drawRect = { x: 0, y: contentStartY, w: width, h: availableH };

                    ctx.save();

                    // Mask matching the node's native bottom corner radius
                    const radius = Math.max(4, Number(node.round_radius) || 8);
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(0, contentStartY, width, availableH, [0, 0, radius, radius]);
                    } else {
                        ctx.rect(0, contentStartY, width, availableH);
                    }
                    ctx.clip();

                    // Empty state placeholder
                    if (!node.imgA && !node.imgB) {
                        if (node.properties?.ds_cmp_a || node.properties?.ds_cmp_b) {
                            loadCompareImages(node, node.properties.ds_cmp_a, node.properties.ds_cmp_b);
                        }
                        const pad = 8;
                        const emptyH = availableH - pad;
                        if (emptyH > 20) {
                            ctx.strokeStyle = theme.border;
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            if (ctx.roundRect) {
                                ctx.roundRect(pad, contentStartY, width - pad * 2, emptyH, 6);
                            } else {
                                ctx.rect(pad, contentStartY, width - pad * 2, emptyH);
                            }
                            ctx.stroke();

                            ctx.textAlign = "center";
                            ctx.textBaseline = "middle";
                            ctx.font = "bold 12px Inter, system-ui, sans-serif";
                            ctx.fillStyle = theme.textMuted;
                            ctx.fillText("Connect image_a & image_b", width / 2, contentStartY + emptyH / 2 - 8);

                            ctx.font = "9px Inter, system-ui, sans-serif";
                            ctx.fillStyle = theme.textMuted;
                            ctx.fillText("Run workflow to compare", width / 2, contentStartY + emptyH / 2 + 10);
                        }
                        ctx.restore();
                        return;
                    }

                    const sliderX = Math.round(width * node.ratio);

                    // 1. Single Image Fallbacks
                    if (node.imgA && !node.imgB) {
                        drawImageAspectFit(ctx, node.imgA, 0, contentStartY, width, availableH);
                    } else if (!node.imgA && node.imgB) {
                        drawImageAspectFit(ctx, node.imgB, 0, contentStartY, width, availableH);
                    } else if (node.imgA && node.imgB) {
                        // 2. Image A (Left Side, Clipped)
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(0, contentStartY, sliderX, availableH);
                        ctx.clip();
                        drawImageAspectFit(ctx, node.imgA, 0, contentStartY, width, availableH);
                        ctx.restore();

                        // 3. Image B (Right Side, Clipped)
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(sliderX, contentStartY, width - sliderX, availableH);
                        ctx.clip();
                        drawImageAspectFit(ctx, node.imgB, 0, contentStartY, width, availableH);
                        ctx.restore();

                        // 4. Refined Divider Line
                        ctx.beginPath();
                        ctx.moveTo(sliderX, contentStartY);
                        ctx.lineTo(sliderX, contentStartY + availableH);
                        ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
                        ctx.lineWidth = 2.5;
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.moveTo(sliderX, contentStartY);
                        ctx.lineTo(sliderX, contentStartY + availableH);
                        ctx.strokeStyle = theme.sliderLine;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();

                        // 5. Minimalist 22px Circular Puck
                        const puckRadius = node.dragging ? 12 : (node.sliderHovered ? 11.5 : 11);
                        const puckY = contentStartY + availableH / 2;

                        ctx.save();
                        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
                        ctx.shadowBlur = 6;
                        ctx.beginPath();
                        ctx.arc(sliderX, puckY, puckRadius, 0, Math.PI * 2);
                        ctx.fillStyle = theme.handlePuckBg;
                        ctx.fill();
                        ctx.restore();

                        ctx.beginPath();
                        ctx.arc(sliderX, puckY, puckRadius, 0, Math.PI * 2);
                        ctx.strokeStyle = theme.handleBorder;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();

                        // Chevrons (‹ ›) in theme accent
                        ctx.fillStyle = theme.accent;
                        ctx.font = "bold 9.5px Inter, system-ui, sans-serif";
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillText("‹ ›", sliderX, puckY);

                        // 6. Floating Tooltip While Dragging
                        if (node.dragging) {
                            const tipPct = `${Math.round(node.ratio * 100)}%`;
                            const tipW = 34;
                            const tipH = 16;
                            const tipY = Math.max(contentStartY + 8, puckY - puckRadius - tipH - 5);

                            ctx.beginPath();
                            if (ctx.roundRect) {
                                ctx.roundRect(sliderX - tipW / 2, tipY, tipW, tipH, 4);
                            } else {
                                ctx.rect(sliderX - tipW / 2, tipY, tipW, tipH);
                            }
                            ctx.fillStyle = "rgba(10, 14, 22, 0.92)";
                            ctx.fill();
                            ctx.strokeStyle = theme.accent;
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            ctx.font = "bold 8.5px Inter, monospace, sans-serif";
                            ctx.fillStyle = "#ffffff";
                            ctx.fillText(tipPct, sliderX, tipY + tipH / 2);
                        }
                    }

                    // 7. Universal High-Contrast Corner Badges [● A] & [● B]
                    const alphaA = Math.max(0, Math.min(1, (sliderX - 12) / 36));
                    const alphaB = Math.max(0, Math.min(1, (width - sliderX - 12) / 36));

                    const badgeH = 18;
                    const badgeY = contentStartY + 8;

                    // Badge A (Top Left)
                    if (alphaA > 0.02) {
                        ctx.save();
                        ctx.globalAlpha = alphaA;
                        ctx.beginPath();
                        if (ctx.roundRect) {
                            ctx.roundRect(8, badgeY, 32, badgeH, 4);
                        } else {
                            ctx.rect(8, badgeY, 32, badgeH);
                        }
                        ctx.fillStyle = "rgba(15, 18, 26, 0.88)";
                        ctx.fill();
                        ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.font = "bold 9px Inter, sans-serif";
                        ctx.fillStyle = theme.accent;
                        ctx.fillText("●", 16, badgeY + badgeH / 2);
                        ctx.fillStyle = "#ffffff";
                        ctx.fillText(" A", 26, badgeY + badgeH / 2);
                        ctx.restore();
                    }

                    // Badge B (Top Right)
                    if (alphaB > 0.02) {
                        ctx.save();
                        ctx.globalAlpha = alphaB;
                        ctx.beginPath();
                        if (ctx.roundRect) {
                            ctx.roundRect(width - 40, badgeY, 32, badgeH, 4);
                        } else {
                            ctx.rect(width - 40, badgeY, 32, badgeH);
                        }
                        ctx.fillStyle = "rgba(15, 18, 26, 0.88)";
                        ctx.fill();
                        ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.font = "bold 9px Inter, sans-serif";
                        ctx.fillStyle = theme.accent;
                        ctx.fillText("●", width - 32, badgeY + badgeH / 2);
                        ctx.fillStyle = "#ffffff";
                        ctx.fillText(" B", width - 22, badgeY + badgeH / 2);
                        ctx.restore();
                    }

                    ctx.restore();
                }
            };

            this.addCustomWidget(widget);
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            onDrawForeground?.apply(this, arguments);
            try {
                drawResolutionHUD(this, ctx);
            } catch (e) {
                console.error("[DS ImageCompare] Draw HUD error:", e);
            }
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function(output) {
            onExecuted?.apply(this, arguments);
            handleExecution(this, output);
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function() {
            onConnectionsChange?.apply(this, arguments);
            for (const input of this.inputs || []) {
                input.label = input.name;
            }
            this.setDirtyCanvas(true, true);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            onConfigure?.apply(this, arguments);
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
                setTimeout(() => {
                    if (!this.imgA && !this.imgB && (d1 || d2)) {
                        loadCompareImages(this, d1, d2);
                    }
                }, 60);
            }

            this.setDirtyCanvas(true, true);
        };

        nodeType.prototype.onMouseDown = function(e, pos) {
            if (this.drawRect) {
                const r = this.drawRect;
                const width = this.size[0];
                const height = this.size[1];

                if (pos[0] > width - 20 && pos[1] > height - 20) {
                    return false;
                }

                if (pos[0] >= r.x && pos[0] <= r.x + r.w &&
                    pos[1] >= r.y && pos[1] <= r.y + r.h) {

                    this.dragging = true;
                    this.ratio = Math.max(0, Math.min(1, (pos[0] - r.x) / r.w));
                    this.setDirtyCanvas(true, false);

                    // Continuous capture: keeps tracking even off-node or at 0%/100%
                    const onGlobalMove = (evt) => {
                        if (!this.dragging) return;
                        const canvas = app.canvas;
                        if (!canvas) return;

                        let clientX = evt.clientX;
                        if (clientX === undefined && evt.touches?.[0]) clientX = evt.touches[0].clientX;
                        if (clientX === undefined) return;

                        const canvasRect = canvas.canvas.getBoundingClientRect();
                        const scale = canvas.ds?.scale || 1;
                        const offset = canvas.ds?.offset || [0, 0];

                        const graphX = (clientX - canvasRect.left) / scale - offset[0];
                        const localX = graphX - this.pos[0];

                        this.ratio = Math.max(0, Math.min(1, localX / this.size[0]));
                        this.setDirtyCanvas(true, false);
                    };

                    const onGlobalUp = () => {
                        window.removeEventListener("pointermove", onGlobalMove);
                        window.removeEventListener("pointerup", onGlobalUp);
                        window.removeEventListener("mousemove", onGlobalMove);
                        window.removeEventListener("mouseup", onGlobalUp);

                        this.dragging = false;
                        this.sliderHovered = false;

                        // Snaps back to center on release
                        this.snapToCenter?.();
                    };

                    window.addEventListener("pointermove", onGlobalMove);
                    window.addEventListener("pointerup", onGlobalUp);
                    window.addEventListener("mousemove", onGlobalMove);
                    window.addEventListener("mouseup", onGlobalUp);

                    return true;
                }
            }
        };

        nodeType.prototype.onMouseMove = function(e, pos) {
            if (!this.drawRect) return;
            const r = this.drawRect;

            if (!this.dragging) {
                const sliderX = r.x + r.w * this.ratio;
                const isNearSlider = Math.abs(pos[0] - sliderX) < 14 && pos[1] >= r.y && pos[1] <= r.y + r.h;
                if (isNearSlider !== this.sliderHovered) {
                    this.sliderHovered = isNearSlider;
                    this.setDirtyCanvas(true, false);
                }
            }
        };

        nodeType.prototype.onMouseUp = function() {
            if (this.dragging) {
                this.dragging = false;
                this.snapToCenter?.();
            }
        };

        nodeType.prototype.onMouseLeave = function() {
            this.sliderHovered = false;
            this.setDirtyCanvas(true, false);
        };
    },
});