// DeathshotArsenal/js/ds_system_monitor.js
// DS System Monitor — real-time workflow & hardware dashboard

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

const CSS_HREF = "/extensions/DeathshotArsenal/System Monitor/ds_system_monitor.css";
if (!document.querySelector(`link[href="${CSS_HREF}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_HREF;
    document.head.appendChild(link);
}

const GRAPH_HISTORY = 80;
const DEFAULT_SETTINGS = { updateInterval: 300, graphInterval: 500, dashW: 900, dashH: 540 };
const LAYOUT_STORAGE_KEY = "DS_SystemMonitor_Layout";

let _layoutSaveTimer = null;



function readLocalLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data?.dashW && data?.dashH) return data;
    } catch (_) {}
    return null;
}

function writeLocalLayout(data) {
    try {
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
}

function scheduleServerLayoutSave(data) {
    clearTimeout(_layoutSaveTimer);
    _layoutSaveTimer = setTimeout(async () => {
        try {
            await fetch("/ds/sysmonitor/layout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
        } catch (_) {}
    }, 450);
}

async function fetchServerLayout() {
    try {
        const res = await fetch("/ds/sysmonitor/layout");
        if (!res.ok) return null;
        const data = await res.json();
        if (data?.dashW && data?.dashH) {
            writeLocalLayout(data);
            return data;
        }
    } catch (_) {}
    return null;
}

const OPERATION_HINTS = [
    { match: /loader|load/i, label: "Loading Model" },
    { match: /clip|encode|prompt/i, label: "Encoding Prompt" },
    { match: /ksampler|sampler|sample/i, label: "Sampling" },
    { match: /vae.*decode|decode.*latent/i, label: "Decoding Latents" },
    { match: /save|write/i, label: "Saving Image" },
    { match: /frame|video/i, label: "Generating Frames" },
    { match: /encode.*video|video.*encode/i, label: "Encoding Video" },
];

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function formatDuration(ms, showMs = true) {
    if (ms < 0) ms = 0;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor(ms % 1000);
    const base = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return showMs ? `${base}.${String(millis).padStart(3, "0")}` : base;
}

function formatEta(ms) {
    if (ms < 0 || !Number.isFinite(ms)) return "--:--";
    const totalSec = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatGb(n, fallback = "—") {
    if (n == null || !Number.isFinite(n)) return fallback;
    return `${n.toFixed(1)} GB`;
}

function inferOperation(nodeTitle, classType) {
    const text = `${nodeTitle || ""} ${classType || ""}`;
    for (const h of OPERATION_HINTS) {
        if (h.match.test(text)) return h.label;
    }
    if (classType) return classType.replace(/([A-Z])/g, " $1").trim();
    return "Processing";
}

function barClass(pct) {
    if (pct >= 90) return "crit";
    if (pct >= 75) return "warn";
    return "";
}

function hexToRgba(hex, alpha) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
    if (!m) return `rgba(103, 232, 249, ${alpha})`;
    return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

class SparklineGraph {
    constructor(canvas, color) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d", { alpha: true });
        this.color = color;
        this.data = [];
        this.display = [];
        this._dpr = 1;
    }

    push(value) {
        const v = Math.max(0, Math.min(100, value ?? 0));
        this.data.push(v);
        if (this.data.length > GRAPH_HISTORY) this.data.shift();
        if (this.display.length === 0) this.display.push(v);
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this._dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.max(1, Math.floor(rect.width * this._dpr));
        this.canvas.height = Math.max(1, Math.floor(rect.height * this._dpr));
    }

    draw(accent) {
        this.resize();
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (this.data.length < 2) return;

        const target = this.data[this.data.length - 1];
        const last = this.display[this.display.length - 1] ?? target;
        this.display.push(lerp(last, target, 0.35));
        if (this.display.length > GRAPH_HISTORY) this.display.shift();

        const pts = this.display;
        const step = w / (GRAPH_HISTORY - 1);
        const color = accent || this.color;

        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let i = 0; i < pts.length; i++) {
            const x = w - (pts.length - 1 - i) * step;
            const y = h - (pts[i] / 100) * (h - 4) - 2;
            if (i === 0) ctx.lineTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, hexToRgba(color, 0.35));
        grad.addColorStop(1, hexToRgba(color, 0.02));
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const x = w - (pts.length - 1 - i) * step;
            const y = h - (pts[i] / 100) * (h - 4) - 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = hexToRgba(color, 0.9);
        ctx.lineWidth = 1.5 * this._dpr;
        ctx.stroke();
    }
}

app.registerExtension({
    name: "DeathshotArsenal.SystemMonitor",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DS_SystemMonitor") return;

        const origOnNodeCreated = nodeType.prototype.onNodeCreated;
        const origOnResize = nodeType.prototype.onResize;
        const origOnConfigure = nodeType.prototype.onConfigure;

        nodeType.prototype.onResize = function (size) {
            if (typeof this._dsSysDashResize === "function") {
                this._dsSysDashResize(size);
            }
            if (origOnResize) origOnResize.apply(this, arguments);
        };

        nodeType.prototype.onConfigure = function () {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            setTimeout(() => {
                if (this._dsSysDashFetchLayout) this._dsSysDashFetchLayout();
                else if (this._dsSysDashRestore) this._dsSysDashRestore();
            }, 80);
        };

        nodeType.prototype.onNodeCreated = function () {
            if (origOnNodeCreated) origOnNodeCreated.apply(this, arguments);

            const self = this;
            const DEFAULT_SIZE = [900, 540];

            const clampW = (w) => {
                const val = Number(w) || DEFAULT_SETTINGS.dashW;
                return Math.max(640, Math.min(1800, Math.round(val)));
            };
            const clampH = (h) => {
                const val = Number(h) || DEFAULT_SETTINGS.dashH;
                return Math.max(340, Math.min(1400, Math.round(val)));
            };
            const earlyLayout = readLocalLayout();
            if (earlyLayout?.dashW && earlyLayout?.dashH) {
                this.size = [clampW(earlyLayout.dashW), clampH(earlyLayout.dashH)];
            } else if (!this.size || this.size[0] < 100 || this.size[1] < 100) {
                this.size = [DEFAULT_SIZE[0], DEFAULT_SIZE[1]];
            }
            this.size[0] = clampW(this.size[0]);
            this.size[1] = clampH(this.size[1]);
            if (!this.properties) this.properties = {};
            this.resizable = true;
            this.serialize_widgets = true;
            this.inputs = [];
            this.outputs = [];

            // Keep the native ComfyUI title bar so the node base matches other DS nodes.
            const TITLE_H = 30;

            this.state = {
                settings: { ...DEFAULT_SETTINGS },
                workflowState: "idle",
                promptId: null,
                nodes: new Map(),
                nodeOrder: [],
                activeNodeId: null,
                totalNodes: 0,
                completedNodes: 0,
                timerRunning: false,
                startTime: 0,
                elapsedMs: 0,
                prevDurationMs: null,
                lastCompletedMs: null,
                durationHistory: [],
                generation: { available: false, value: 0, max: 0, nodeId: null },
                operation: "Idle",
                hardware: {},
                display: { cpu: 0, gpu: 0, ram: 0, vram: 0 },
                targets: { cpu: 0, gpu: 0, ram: 0, vram: 0 },
                nodeDurations: [],
                longestNode: { name: "—", ms: 0 },
            };

            let settingsWidget = this.widgets?.find((w) => w.name === "settings");
            if (!settingsWidget) {
                settingsWidget = { name: "settings", type: "text", value: JSON.stringify(DEFAULT_SETTINGS), hidden: true };
                if (!this.widgets) this.widgets = [];
                this.widgets.push(settingsWidget);
            }
            settingsWidget.computeSize = () => [0, 0];

            const root = document.createElement("div");
            root.className = "ds-sysdash-root";
            root.dataset.dsThemed = "true";

            root.innerHTML = `
                <div class="ds-sysdash-toolbar">
                    <div class="ds-sysdash-status-dot idle" data-el="statusDot"></div>
                    <div class="ds-sysdash-state-label" data-el="stateLabel">Idle</div>
                    <div class="ds-sysdash-toolbar-spacer"></div>
                    <button class="ds-sysdash-gear" data-el="gearBtn" title="Settings">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                    </button>
                </div>
                <div class="ds-sysdash-settings" data-el="settingsPanel">
                    <div class="ds-sysdash-setting-row">
                        <label>Update interval</label>
                        <input type="range" data-el="intervalSlider" min="200" max="500" step="50" value="300">
                        <span data-el="intervalLabel">300ms</span>
                    </div>
                </div>
                <div class="ds-sysdash-body">
                    <div class="ds-sysdash-panel">
                        <div class="ds-sysdash-panel-title">Workflow Progress</div>
                        <div class="ds-sysdash-progress-row">
                            <div class="ds-sysdash-ring-wrap">
                                <svg class="ds-sysdash-ring-svg" viewBox="0 0 100 100">
                                    <circle class="ds-sysdash-ring-bg" cx="50" cy="50" r="42"/>
                                    <circle class="ds-sysdash-ring-fill" data-el="ringFill" cx="50" cy="50" r="42"
                                        stroke-dasharray="263.89" stroke-dashoffset="263.89"/>
                                </svg>
                                <div class="ds-sysdash-ring-text">
                                    <div class="ds-sysdash-ring-pct" data-el="ringPct">0%</div>
                                    <div class="ds-sysdash-ring-sub">complete</div>
                                </div>
                            </div>
                            <div class="ds-sysdash-progress-info">
                                <div class="ds-sysdash-info-line"><span>Active node</span><span class="val" data-el="activeNode">—</span></div>
                                <div class="ds-sysdash-info-line"><span>Completed</span><span class="val" data-el="completedCount">0 / 0</span></div>
                                <div class="ds-sysdash-info-line"><span>Remaining</span><span class="val" data-el="remainingCount">0</span></div>
                                <div class="ds-sysdash-info-line"><span>Operation</span><span class="val" data-el="operation">Idle</span></div>
                            </div>
                            <div class="ds-sysdash-timer-block">
                                <div class="ds-sysdash-timer" data-el="timer">00:00:00.000</div>
                                <div class="ds-sysdash-timer-sub">
                                    <div>Previous: <span data-el="prevDuration">—</span></div>
                                    <div>Avg: <span data-el="avgDuration">—</span> · Fast: <span data-el="fastDuration">—</span> · Slow: <span data-el="slowDuration">—</span></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="ds-sysdash-panel">
                        <div class="ds-sysdash-panel-title">Per-Node Progress</div>
                        <div class="ds-sysdash-node-list" data-el="nodeList">
                            <div class="ds-sysdash-empty">No workflow running</div>
                        </div>
                    </div>

                    <div class="ds-sysdash-panel">
                        <div class="ds-sysdash-panel-title">Hardware Monitor</div>
                        <div class="ds-sysdash-hw-grid">
                            <div class="ds-sysdash-hw-card">
                                <div class="ds-sysdash-hw-label">CPU</div>
                                <div class="ds-sysdash-hw-value" data-el="cpuVal">0%</div>
                                <div class="ds-sysdash-hw-detail" data-el="cpuDetail">—</div>
                                <div class="ds-sysdash-hw-bar"><div class="ds-sysdash-hw-bar-fill" data-el="cpuBar" style="width:0%"></div></div>
                            </div>
                            <div class="ds-sysdash-hw-card">
                                <div class="ds-sysdash-hw-label">GPU</div>
                                <div class="ds-sysdash-hw-value" data-el="gpuVal">—</div>
                                <div class="ds-sysdash-hw-detail" data-el="gpuDetail">—</div>
                                <div class="ds-sysdash-hw-bar"><div class="ds-sysdash-hw-bar-fill" data-el="gpuBar" style="width:0%"></div></div>
                            </div>
                            <div class="ds-sysdash-hw-card">
                                <div class="ds-sysdash-hw-label">RAM</div>
                                <div class="ds-sysdash-hw-value" data-el="ramVal">0%</div>
                                <div class="ds-sysdash-hw-detail" data-el="ramDetail">—</div>
                                <div class="ds-sysdash-hw-bar"><div class="ds-sysdash-hw-bar-fill" data-el="ramBar" style="width:0%"></div></div>
                            </div>
                            <div class="ds-sysdash-hw-card">
                                <div class="ds-sysdash-hw-label">VRAM</div>
                                <div class="ds-sysdash-hw-value" data-el="vramVal">—</div>
                                <div class="ds-sysdash-hw-detail" data-el="vramDetail">—</div>
                                <div class="ds-sysdash-hw-bar"><div class="ds-sysdash-hw-bar-fill" data-el="vramBar" style="width:0%"></div></div>
                            </div>
                        </div>
                    </div>

                    <div class="ds-sysdash-panel">
                        <div class="ds-sysdash-panel-title">Performance Graphs</div>
                        <div class="ds-sysdash-graph-grid">
                            <div class="ds-sysdash-graph-card"><div class="ds-sysdash-graph-label">CPU</div><canvas class="ds-sysdash-graph-canvas" data-graph="cpu"></canvas></div>
                            <div class="ds-sysdash-graph-card"><div class="ds-sysdash-graph-label">GPU</div><canvas class="ds-sysdash-graph-canvas" data-graph="gpu"></canvas></div>
                            <div class="ds-sysdash-graph-card"><div class="ds-sysdash-graph-label">RAM</div><canvas class="ds-sysdash-graph-canvas" data-graph="ram"></canvas></div>
                            <div class="ds-sysdash-graph-card"><div class="ds-sysdash-graph-label">VRAM</div><canvas class="ds-sysdash-graph-canvas" data-graph="vram"></canvas></div>
                        </div>
                    </div>

                    <div class="ds-sysdash-meta-grid">
                        <div class="ds-sysdash-panel" style="margin:0">
                            <div class="ds-sysdash-panel-title">Generation Progress</div>
                            <div class="ds-sysdash-meta-value" data-el="genProgress">Unavailable</div>
                            <div class="ds-sysdash-hw-bar" style="margin-top:8px"><div class="ds-sysdash-hw-bar-fill" data-el="genBar" style="width:0%"></div></div>
                        </div>
                        <div class="ds-sysdash-panel" style="margin:0" data-el="etaPanel">
                            <div class="ds-sysdash-panel-title">Estimated Remaining Time</div>
                            <div class="ds-sysdash-eta" data-el="eta">—</div>
                        </div>
                    </div>

                    <div class="ds-sysdash-panel">
                        <div class="ds-sysdash-panel-title">Performance Statistics</div>
                        <div class="ds-sysdash-stats-grid">
                            <div class="ds-sysdash-stat"><div class="ds-sysdash-stat-val" data-el="statSpeed">—</div><div class="ds-sysdash-stat-lbl">Nodes/min</div></div>
                            <div class="ds-sysdash-stat"><div class="ds-sysdash-stat-val" data-el="statAvgNode">—</div><div class="ds-sysdash-stat-lbl">Avg node</div></div>
                            <div class="ds-sysdash-stat"><div class="ds-sysdash-stat-val" data-el="statLongest">—</div><div class="ds-sysdash-stat-lbl">Longest node</div></div>
                        </div>
                    </div>
                </div>
                <div class="ds-sysdash-resize"><div class="ds-sysdash-resize-grip"></div></div>
            `;

            const els = {};
            root.querySelectorAll("[data-el]").forEach((el) => { els[el.dataset.el] = el; });

            const graphs = {
                cpu: new SparklineGraph(root.querySelector('[data-graph="cpu"]')),
                gpu: new SparklineGraph(root.querySelector('[data-graph="gpu"]')),
                ram: new SparklineGraph(root.querySelector('[data-graph="ram"]')),
                vram: new SparklineGraph(root.querySelector('[data-graph="vram"]')),
            };

            const RING_CIRC = 2 * Math.PI * 42;

            const saveSettings = () => {
                settingsWidget.value = JSON.stringify(self.state.settings);
            };

            const loadSettings = () => {
                try {
                    const saved = JSON.parse(settingsWidget.value || "{}");
                    self.state.settings = { ...DEFAULT_SETTINGS, ...saved };
                } catch (_) {
                    self.state.settings = { ...DEFAULT_SETTINGS };
                }
                els.intervalSlider.value = self.state.settings.updateInterval;
                els.intervalLabel.textContent = `${self.state.settings.updateInterval}ms`;
            };

            const applyLayoutSettings = (layout) => {
                if (!layout) return;
                if (layout.dashW) self.state.settings.dashW = clampW(layout.dashW);
                if (layout.dashH) self.state.settings.dashH = clampH(layout.dashH);
                if (layout.updateInterval != null) {
                    self.state.settings.updateInterval = Number(layout.updateInterval) || DEFAULT_SETTINGS.updateInterval;
                    els.intervalSlider.value = self.state.settings.updateInterval;
                    els.intervalLabel.textContent = `${self.state.settings.updateInterval}ms`;
                }
                if (layout.graphInterval != null) {
                    self.state.settings.graphInterval = Number(layout.graphInterval) || DEFAULT_SETTINGS.graphInterval;
                }
            };

            const persistLayout = () => {
                self.state.settings.dashW = dashW;
                self.state.settings.dashH = dashH;
                self.properties.ds_dash_w = dashW;
                self.properties.ds_dash_h = dashH;
                saveSettings();

                const payload = {
                    dashW,
                    dashH,
                    updateInterval: self.state.settings.updateInterval,
                    graphInterval: self.state.settings.graphInterval,
                };
                writeLocalLayout(payload);
                scheduleServerLayoutSave(payload);

            };

            const readPersistedLayout = () => {
                loadSettings();
                const global = readLocalLayout();
                const w = global?.dashW
                    ?? self.properties?.ds_dash_w
                    ?? self.state.settings.dashW
                    ?? DEFAULT_SETTINGS.dashW;
                const h = global?.dashH
                    ?? self.properties?.ds_dash_h
                    ?? self.state.settings.dashH
                    ?? DEFAULT_SETTINGS.dashH;
                if (global) applyLayoutSettings(global);
                return { w: clampW(w), h: clampH(h) };
            };

            loadSettings();
            const bootLayout = readLocalLayout();
            if (bootLayout) applyLayoutSettings(bootLayout);

            if (window.DSGlobalTheme) {
                window.DSGlobalTheme.bindNode(root, self);
                window.DSGlobalTheme.applyNodeBase?.(self);
                window.DSGlobalTheme.subscribe(() => {
                    const theme = window.DSGlobalTheme.getTheme(window.DSGlobalTheme.getConfig().theme);
                    if (theme?.glass) root.classList.add("glass");
                    else root.classList.remove("glass");
                });
                const theme = window.DSGlobalTheme.getTheme(window.DSGlobalTheme.getConfig().theme);
                if (theme?.glass) root.classList.add("glass");
            }

            els.gearBtn.onclick = (e) => {
                e.stopPropagation();
                els.settingsPanel.classList.toggle("open");
            };

            els.intervalSlider.oninput = (e) => {
                self.state.settings.updateInterval = Number(e.target.value);
                els.intervalLabel.textContent = `${self.state.settings.updateInterval}ms`;
                saveSettings();
                persistLayout();
            };

            const setWorkflowState = (state) => {
                self.state.workflowState = state;
                els.stateLabel.textContent = state.charAt(0).toUpperCase() + state.slice(1);
                els.statusDot.className = `ds-sysdash-status-dot ${state}`;
            };

            const getNodeTitle = (id) => {
                const node = app.graph?.getNodeById(Number(id));
                return node ? (node.title || node.comfyClass || node.type || `Node ${id}`) : `Node ${id}`;
            };

            const resetWorkflow = () => {
                self.state.nodes.clear();
                self.state.nodeOrder = [];
                self.state.activeNodeId = null;
                self.state.totalNodes = 0;
                self.state.completedNodes = 0;
                self.state.generation = { available: false, value: 0, max: 0, nodeId: null };
                self.state.nodeDurations = [];
                self.state.longestNode = { name: "—", ms: 0 };
                self.state.operation = "Idle";
            };

            const countExecutableNodes = () => {
                if (!app.graph?._nodes) return 0;
                return app.graph._nodes.filter((n) => {
                    const ct = n.comfyClass || n.type;
                    return ct && !["DS_SystemMonitor", "DS_ThemeManager", "DS_FuturisticHUD"].includes(ct);
                }).length;
            };

            const recalcCompleted = () => {
                let count = 0;
                for (const n of self.state.nodes.values()) {
                    if (n.status === "done" || n.status === "cached") count++;
                }
                self.state.completedNodes = count;
            };

            const ensureNode = (id, status = "pending") => {
                const sid = String(id);
                if (!self.state.nodes.has(sid)) {
                    const nodeObj = app.graph?.getNodeById(Number(id));
                    self.state.nodes.set(sid, {
                        title: getNodeTitle(id),
                        classType: nodeObj?.comfyClass || nodeObj?.type || "",
                        status,
                        progress: 0,
                        startTime: status === "running" ? performance.now() : null,
                        elapsedMs: 0,
                    });
                    self.state.nodeOrder.push(sid);
                }
                return self.state.nodes.get(sid);
            };

            const renderNodeList = () => {
                const list = els.nodeList;
                const entries = self.state.nodeOrder
                    .map((id) => ({ id, ...self.state.nodes.get(id) }))
                    .filter(Boolean);

                if (entries.length === 0) {
                    list.innerHTML = `<div class="ds-sysdash-empty">${self.state.workflowState === "idle" ? "No workflow running" : "Waiting for nodes…"}</div>`;
                    return;
                }

                const active = self.state.activeNodeId;
                const show = entries.filter((e) => e.status === "running" || e.status === "pending" || e.id === active).slice(0, 30);
                const recentDone = entries.filter((e) => e.status === "done" || e.status === "cached").slice(-5);
                const visible = [...show, ...recentDone.filter((d) => !show.find((s) => s.id === d.id))];

                list.innerHTML = visible.map((n) => {
                    const cls = ["ds-sysdash-node-item", n.status === "running" ? "active" : "", (n.status === "done" || n.status === "cached") ? "done" : ""].filter(Boolean).join(" ");
                    const time = n.elapsedMs > 0 ? `${(n.elapsedMs / 1000).toFixed(1)}s` : "—";
                    const bar = n.progress > 0 ? `<div class="ds-sysdash-node-bar"><div class="ds-sysdash-node-bar-fill" style="width:${n.progress}%"></div></div>` : "";
                    return `<div class="${cls}">
                        <div class="ds-sysdash-node-name">${n.title}</div>
                        <div class="ds-sysdash-node-status">${n.status}</div>
                        <div class="ds-sysdash-node-time">${time}</div>
                        ${bar}
                    </div>`;
                }).join("");
            };

            const updateProgressRing = (pct) => {
                const clamped = Math.max(0, Math.min(100, pct));
                const offset = RING_CIRC - (clamped / 100) * RING_CIRC;
                els.ringFill.style.strokeDashoffset = String(offset);
                els.ringPct.textContent = `${Math.round(clamped)}%`;
            };

            const computeEta = () => {
                const remaining = Math.max(0, self.state.totalNodes - self.state.completedNodes);
                if (remaining <= 0 || self.state.nodeDurations.length < 2) return null;
                const avg = self.state.nodeDurations.reduce((a, b) => a + b, 0) / self.state.nodeDurations.length;
                if (avg < 100) return null;
                return remaining * avg;
            };

            const updateStats = () => {
                const elapsed = self.state.timerRunning ? performance.now() - self.state.startTime : self.state.elapsedMs;
                const completed = self.state.completedNodes;
                const mins = elapsed / 60000;
                els.statSpeed.textContent = mins > 0.05 ? (completed / mins).toFixed(1) : "—";

                if (self.state.nodeDurations.length > 0) {
                    const avg = self.state.nodeDurations.reduce((a, b) => a + b, 0) / self.state.nodeDurations.length;
                    els.statAvgNode.textContent = `${(avg / 1000).toFixed(1)}s`;
                } else {
                    els.statAvgNode.textContent = "—";
                }

                els.statLongest.textContent = self.state.longestNode.ms > 0
                    ? `${(self.state.longestNode.ms / 1000).toFixed(1)}s`
                    : "—";
            };

            const updateGenerationUI = () => {
                const g = self.state.generation;
                if (!g.available || g.max <= 0) {
                    els.genProgress.textContent = "Unavailable";
                    els.genProgress.classList.add("unavailable");
                    els.genBar.style.width = "0%";
                    return;
                }
                els.genProgress.classList.remove("unavailable");
                const pct = Math.round((g.value / g.max) * 100);
                els.genProgress.textContent = `Step ${g.value} / ${g.max} (${pct}%)`;
                els.genBar.style.width = `${pct}%`;
            };

            const updateEtaUI = () => {
                const eta = computeEta();
                if (eta == null || self.state.workflowState !== "executing") {
                    els.etaPanel.style.display = "none";
                    return;
                }
                els.etaPanel.style.display = "";
                els.eta.textContent = formatEta(eta);
            };

            const updateHardwareUI = () => {
                const hw = self.state.hardware;
                const d = self.state.display;

                els.cpuVal.textContent = `${Math.round(d.cpu)}%`;
                els.cpuBar.style.width = `${d.cpu}%`;
                els.cpuBar.className = `ds-sysdash-hw-bar-fill ${barClass(d.cpu)}`;
                const cpuParts = [];
                if (hw.cpu_freq) cpuParts.push(`${hw.cpu_freq} MHz`);
                if (hw.cpu_temp != null) cpuParts.push(`${hw.cpu_temp}°C`);
                els.cpuDetail.textContent = cpuParts.length ? cpuParts.join(" • ") : "—";

                const hasGpu = hw.gpu_available || (hw.vram_total_gb > 0);
                if (hw.gpu != null) {
                    els.gpuVal.textContent = `${Math.round(d.gpu)}%`;
                    els.gpuBar.style.width = `${d.gpu}%`;
                    els.gpuBar.className = `ds-sysdash-hw-bar-fill ${barClass(d.gpu)}`;
                    const gpuParts = [];
                    if (hw.gpu_vendor) gpuParts.push(hw.gpu_vendor.toUpperCase());
                    if (hw.gpu_clock) gpuParts.push(`${hw.gpu_clock} MHz`);
                    if (hw.gpu_temp != null) gpuParts.push(`${hw.gpu_temp}°C`);
                    if (hw.gpu_power) gpuParts.push(`${hw.gpu_power} W`);
                    els.gpuDetail.textContent = gpuParts.length ? gpuParts.join(" • ") : "Active";
                } else if (hasGpu) {
                    els.gpuVal.textContent = "—";
                    els.gpuBar.style.width = "0%";
                    els.gpuBar.className = "ds-sysdash-hw-bar-fill";
                    els.gpuDetail.textContent = "Util unavailable";
                } else {
                    els.gpuVal.textContent = "N/A";
                    els.gpuBar.style.width = "0%";
                    els.gpuDetail.textContent = "Unavailable";
                }

                els.ramVal.textContent = `${Math.round(d.ram)}%`;
                els.ramBar.style.width = `${d.ram}%`;
                els.ramBar.className = `ds-sysdash-hw-bar-fill ${barClass(d.ram)}`;
                if (hw.ram_used_gb != null) {
                    els.ramDetail.textContent = `${formatGb(hw.ram_used_gb)} / ${formatGb(hw.ram_total_gb)}`;
                } else {
                    els.ramDetail.textContent = "—";
                }

                if (hw.vram_total_gb > 0) {
                    els.vramVal.textContent = `${Math.round(d.vram)}%`;
                    els.vramBar.style.width = `${d.vram}%`;
                    els.vramBar.className = `ds-sysdash-hw-bar-fill ${barClass(d.vram)}`;
                    els.vramDetail.textContent = `${formatGb(hw.vram_used_gb)} / ${formatGb(hw.vram_total_gb)}`;
                } else {
                    els.vramVal.textContent = "N/A";
                    els.vramBar.style.width = "0%";
                    els.vramDetail.textContent = "Unavailable";
                }
            };

            const updateWorkflowUI = () => {
                const total = self.state.totalNodes || 0;
                const done = self.state.completedNodes;
                let pct = total > 0 ? (done / total) * 100 : 0;
                if (self.state.workflowState === "finished") pct = 100;

                const displayDone = self.state.workflowState === "finished" ? total : done;
                const displayPct = self.state.workflowState === "finished" ? 100 : pct;
                updateProgressRing(displayPct);
                els.completedCount.textContent = `${displayDone} / ${total}`;
                els.remainingCount.textContent = String(self.state.workflowState === "finished" ? 0 : Math.max(0, total - done));

                if (self.state.activeNodeId) {
                    const n = self.state.nodes.get(String(self.state.activeNodeId));
                    els.activeNode.textContent = n?.title || getNodeTitle(self.state.activeNodeId);
                } else {
                    els.activeNode.textContent = "—";
                }

                els.operation.textContent = self.state.operation;

                if (self.state.timerRunning) {
                    els.timer.textContent = formatDuration(performance.now() - self.state.startTime);
                } else if (self.state.elapsedMs > 0) {
                    els.timer.textContent = formatDuration(self.state.elapsedMs);
                }

                els.prevDuration.textContent = self.state.prevDurationMs != null
                    ? formatDuration(self.state.prevDurationMs, false)
                    : "—";

                if (self.state.durationHistory.length > 0) {
                    const hist = self.state.durationHistory;
                    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
                    const fast = Math.min(...hist);
                    const slow = Math.max(...hist);
                    els.avgDuration.textContent = formatDuration(avg, false);
                    els.fastDuration.textContent = formatDuration(fast, false);
                    els.slowDuration.textContent = formatDuration(slow, false);
                } else {
                    els.avgDuration.textContent = "—";
                    els.fastDuration.textContent = "—";
                    els.slowDuration.textContent = "—";
                }

                renderNodeList();
                updateGenerationUI();
                updateEtaUI();
                updateStats();
            };

            const applyHardwareStats = (detail) => {
                if (!detail) return;
                self.state.hardware = detail;
                self.state.targets.cpu = detail.cpu ?? 0;
                self.state.targets.ram = detail.ram ?? 0;
                if (detail.gpu != null) self.state.targets.gpu = detail.gpu;
                self.state.targets.vram = detail.vram ?? 0;
            };

            let lastGraphPush = 0;
            let animFrame = null;
            let lastMedUpdate = 0;

            const animate = (now) => {
                const st = self.state;
                const t = 0.18;

                st.display.cpu = lerp(st.display.cpu, st.targets.cpu, t);
                st.display.ram = lerp(st.display.ram, st.targets.ram, t);
                st.display.gpu = lerp(st.display.gpu, st.targets.gpu ?? 0, t);
                st.display.vram = lerp(st.display.vram, st.targets.vram, t);

                if (st.timerRunning) updateWorkflowUI();

                if (now - lastMedUpdate >= st.settings.updateInterval) {
                    lastMedUpdate = now;
                    updateHardwareUI();
                }

                if (now - lastGraphPush >= st.settings.graphInterval) {
                    lastGraphPush = now;
                    graphs.cpu.push(st.display.cpu);
                    graphs.gpu.push(st.display.gpu);
                    graphs.ram.push(st.display.ram);
                    graphs.vram.push(st.display.vram);
                }

                const accent = window.DSGlobalTheme?.getVar("--ds-accent", "#67e8f9") || "#67e8f9";
                Object.values(graphs).forEach((g) => g.draw(accent));

                animFrame = requestAnimationFrame(animate);
            };

            const startTimer = () => {
                self.state.timerRunning = true;
                self.state.startTime = performance.now();
                self.state.elapsedMs = 0;
            };

            const stopTimer = () => {
                if (!self.state.timerRunning) return;
                self.state.elapsedMs = performance.now() - self.state.startTime;
                self.state.timerRunning = false;
                self.state.lastCompletedMs = self.state.elapsedMs;
                self.state.durationHistory.push(self.state.elapsedMs);
                if (self.state.durationHistory.length > 20) self.state.durationHistory.shift();
            };

            const finishWorkflow = (state) => {
                if (self.state.workflowState === "finished" || self.state.workflowState === "error") return;
                stopTimer();
                for (const n of self.state.nodes.values()) {
                    if (n.status === "running" || n.status === "pending") n.status = "done";
                }
                const tracked = self.state.nodes.size;
                self.state.totalNodes = Math.max(self.state.totalNodes, tracked, self.state.completedNodes);
                self.state.completedNodes = self.state.totalNodes;
                setWorkflowState(state);
                self.state.activeNodeId = null;
                self.state.operation = state === "error" ? "Error" : "Complete";
                self.state.generation.available = false;
                updateWorkflowUI();
            };

            api.addEventListener("execution_start", () => {
                if (self.state.lastCompletedMs != null) {
                    self.state.prevDurationMs = self.state.lastCompletedMs;
                }
                resetWorkflow();
                setWorkflowState("preparing");
                self.state.totalNodes = countExecutableNodes();
                startTimer();
                updateWorkflowUI();
            });

            api.addEventListener("executing", ({ detail }) => {
                if (detail == null) {
                    finishWorkflow("finished");
                    return;
                }
                const nodeId = String(detail);
                setWorkflowState("executing");

                for (const [id, n] of self.state.nodes) {
                    if (n.status === "running" && id !== nodeId) {
                        n.status = "done";
                        n.elapsedMs = n.startTime ? performance.now() - n.startTime : n.elapsedMs;
                    }
                }

                const entry = ensureNode(nodeId, "running");
                entry.status = "running";
                entry.startTime = performance.now();
                self.state.activeNodeId = nodeId;
                self.state.operation = inferOperation(entry.title, entry.classType);
                recalcCompleted();
                updateWorkflowUI();
            });

            api.addEventListener("execution_cached", ({ detail }) => {
                const { nodes } = detail || {};
                if (!nodes?.length) return;
                nodes.forEach((id) => {
                    const entry = ensureNode(id, "cached");
                    entry.status = "cached";
                    entry.elapsedMs = 0;
                });
                recalcCompleted();
                updateWorkflowUI();
            });

            api.addEventListener("ds.execution_monitor.executed", ({ detail }) => {
                if (!detail) return;
                const nodeId = String(detail.node);
                const entry = ensureNode(nodeId, "done");
                entry.status = "done";
                entry.elapsedMs = detail.execution_time ?? entry.elapsedMs;
                if (detail.execution_time) {
                    self.state.nodeDurations.push(detail.execution_time);
                    if (detail.execution_time > self.state.longestNode.ms) {
                        self.state.longestNode = { name: entry.title, ms: detail.execution_time };
                    }
                }
                recalcCompleted();
                updateWorkflowUI();
            });

            api.addEventListener("progress", ({ detail }) => {
                if (!detail || detail.max <= 0) return;
                self.state.generation = {
                    available: true,
                    value: detail.value ?? 0,
                    max: detail.max,
                    nodeId: detail.node,
                };
                if (detail.node) {
                    const entry = ensureNode(detail.node, "running");
                    entry.progress = Math.round((detail.value / detail.max) * 100);
                }
                updateGenerationUI();
            });

            api.addEventListener("execution_success", () => finishWorkflow("finished"));
            api.addEventListener("execution_error", () => finishWorkflow("error"));

            api.addEventListener("ds_system_stats", ({ detail }) => {
                applyHardwareStats(detail);
            });

            const widget = this.addDOMWidget("sys_monitor_ui", "SysMon", root, { serialize: false, hideOnZoom: false });

            const initialLayout = readPersistedLayout();
            let dashW = initialLayout.w;
            let dashH = initialLayout.h;

            const bindWidgetChain = () => {
                try {
                    let el = root.parentElement;
                    let depth = 0;
                    while (el && depth < 6) {
                        el.style.padding = "0";
                        el.style.margin = "0";
                        el.style.overflow = "hidden";
                        el.style.boxSizing = "border-box";
                        el.style.width = "100%";
                        el.style.maxWidth = "100%";
                        el.style.left = "0";
                        el.style.pointerEvents = "auto";
                        el = el.parentElement;
                        depth++;
                    }
                } catch (_) {}
            };

            const syncComputeSize = () => {
                widget.computeSize = function () {
                    return [dashW, Math.max(280, dashH - TITLE_H)];
                };
            };

            const applyDashSize = () => {
                bindWidgetChain();
                root.style.width = "100%";
                root.style.height = "100%";
                if (widget.element) {
                    widget.element.style.width = "100%";
                    widget.element.style.height = "100%";
                    widget.element.style.overflow = "hidden";
                    widget.element.style.padding = "0";
                    widget.element.style.margin = "0";
                    widget.element.style.boxSizing = "border-box";
                    widget.element.style.display = "block";
                    widget.element.style.position = "relative";
                    widget.element.style.pointerEvents = "auto";
                }
            };

            const parseResizeArgs = (size, arg1) => {
                if (Array.isArray(size)) return { w: size[0], h: size[1] };
                if (typeof size === "number" && typeof arg1 === "number") return { w: size, h: arg1 };
                return { w: dashW, h: dashH };
            };

            const setNodeSizeSafe = (w, h) => {
                dashW = clampW(w);
                dashH = clampH(h);
                syncComputeSize();
                applyDashSize();
                const curW = self.size ? self.size[0] : 0;
                const curH = self.size ? self.size[1] : 0;
                if (Math.abs(curW - dashW) < 3 && Math.abs(curH - dashH) < 3) return;
                self._dsSysDashApplying = true;
                try {
                    self.setSize([dashW, dashH]);
                } finally {
                    self._dsSysDashApplying = false;
                }
                self.setDirtyCanvas(true, true);
            };

            const restoreLayout = () => {
                if (self._dsSysDashApplying) return;
                const layout = readPersistedLayout();
                setNodeSizeSafe(layout.w, layout.h);
            };

            const applyServerLayout = async () => {
                const remote = await fetchServerLayout();
                if (!remote || self._dsSysDashApplying) return;
                applyLayoutSettings(remote);
                setNodeSizeSafe(remote.dashW, remote.dashH);
                persistLayout();
            };

            this._dsSysDashRestore = restoreLayout;
            this._dsSysDashFetchLayout = applyServerLayout;

            this._dsSysDashResize = (size, arg1) => {
                if (self._dsSysDashApplying) return;
                const { w, h } = parseResizeArgs(size, arg1);
                dashW = clampW(w);
                dashH = clampH(h);
                // Mutate the incoming size arg so LiteGraph / default handler uses our clamped value
                if (Array.isArray(size)) {
                    size[0] = dashW;
                    size[1] = dashH;
                }
                syncComputeSize();
                applyDashSize();
                if (self.size) {
                    self.size[0] = dashW;
                    self.size[1] = dashH;
                }
                persistLayout();
                self.setDirtyCanvas(true, true);
            };

            restoreLayout();
            applyServerLayout();
            setTimeout(() => { if (!self._dsSysDashApplying) restoreLayout(); }, 120);

            const resizeHandle = root.querySelector(".ds-sysdash-resize");
            resizeHandle.onmousedown = (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                const startY = e.clientY;
                const startH = dashH;
                const zoom = app.canvas.ds.scale;
                const move = (ev) => {
                    const newH = clampH(startH + (ev.clientY - startY) / zoom);
                    setNodeSizeSafe(clampW(self.size[0] || dashW), newH);
                    self.setDirtyCanvas(true, true);
                };
                const up = () => {
                    persistLayout();
                    window.removeEventListener("mousemove", move);
                    window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
            };

            this.onRemoved = function () {
                if (animFrame) cancelAnimationFrame(animFrame);
            };

            setWorkflowState("idle");
            updateWorkflowUI();
            updateHardwareUI();
            animFrame = requestAnimationFrame(animate);
        };
    },
});