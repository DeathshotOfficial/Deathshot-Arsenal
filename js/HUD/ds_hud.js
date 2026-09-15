// DeathshotArsenal/js/ds_hud.js

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

// --- THEME DEFINITIONS ---
const HUD_THEMES = {
    "Custom": null, // Uses user widgets
    
    // Updated Cyberpunk: Yellow/Cyan/Red (2077 Style)
    "Cyberpunk":   ["#fcee0a", "#00f0ff", "#ff003c", "#fcee0a", "#00f0ff", "#ff003c", "#fcee0a"],
    
    // Monochromatic / Specific Vibes
    "Sci-Fi Blue": ["#00ffff", "#00bfff", "#1e90ff", "#4169e1", "#87cefa", "#4682b4", "#5f9ea0"],
    "Red Alert":   ["#ff0000", "#ff3333", "#cc0000", "#ff6666", "#990000", "#ffcccc", "#800000"],
    "Matrix":      ["#00ff41", "#008f11", "#003b00", "#00ff41", "#008f11", "#003b00", "#00ff41"],
    "Rainbow":     ["#ff0000", "#ffa500", "#ffff00", "#008000", "#0000ff", "#4b0082", "#ee82ee"],
    "Dracula":     ["#bd93f9", "#ff79c6", "#50fa7b", "#f1fa8c", "#ff5555", "#8be9fd", "#6272a4"],
    "Gold":        ["#ffd700", "#ffb90f", "#daa520", "#b8860b", "#f0e68c", "#eee8aa", "#bdb76b"]
};

// --- CSS STYLES ---
const hudStyles = `
    #ds-hud-overlay {
        position: fixed;
        z-index: 9999;
        pointer-events: none;
        display: none;
        font-family: var(--ds-font, Inter, system-ui, sans-serif);
        
        padding: 10px 15px;
        gap: 15px; 
        
        display: flex;
        align-items: center;
        justify-content: center;
        
        border-radius: 50px;
        border: 1px solid rgba(255,255,255,0.15);
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        transition: all 0.3s ease;
    }

    #ds-hud-overlay.vertical { 
        flex-direction: column; 
        border-radius: 25px;
        padding: 15px 10px;
    }
    #ds-hud-overlay.horizontal { 
        flex-direction: row; 
    }

    #ds-hud-overlay.top-right { top: 20px; right: 20px; }
    #ds-hud-overlay.top-left { top: 20px; left: 20px; }
    #ds-hud-overlay.bottom-right { bottom: 20px; right: 20px; }
    #ds-hud-overlay.bottom-left { bottom: 20px; left: 20px; }

    .ds-gauge-unit {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .ds-gauge-svg {
        width: 100%;
        height: 100%;
        overflow: visible;
    }

    .ds-track-bg {
        fill: none;
        stroke: rgba(255,255,255,0.1);
        stroke-linecap: round;
    }

    .ds-progress-bar {
        fill: none;
        stroke-linecap: round;
        transition: stroke-dashoffset 1.0s cubic-bezier(0.2, 0.8, 0.2, 1);
        filter: drop-shadow(0 0 3px currentColor);
    }

    .ds-value-display {
        position: absolute;
        font-weight: 800;
        /* Enforce White Text */
        color: #ffffff !important;
        text-shadow: 0 0 4px rgba(0,0,0,1);
        z-index: 2;
        text-align: center;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%); 
        pointer-events: none;
    }

    .ds-label-display {
        position: absolute;
        right: 0;
        top: 50%;
        /* Increased translation to push label further away from center number */
        transform: translateY(-50%) translateX(40%);
        font-weight: 800;
        letter-spacing: 0.05em;
        text-align: center;
        z-index: 3;
        /* Enforce White Text */
        color: #ffffff !important;
        text-shadow: 0 0 4px rgba(0,0,0,1);
        pointer-events: none;
    }
`;

// --- MAIN EXTENSION ---
app.registerExtension({
    name: "Deathshot.FuturisticHUD",
    
    async setup() {
        const styleEl = document.createElement("style");
        styleEl.innerHTML = hudStyles;
        document.head.appendChild(styleEl);

        const overlay = document.createElement("div");
        overlay.id = "ds-hud-overlay";
        overlay.dataset.dsThemed = "true";
        document.body.appendChild(overlay);

        this.overlay = overlay;

        const syncHudTheme = () => {
            if (window.DSGlobalTheme?.isReady?.()) {
                window.DSGlobalTheme.applyToElement(overlay);
            }
        };
        window.addEventListener("ds-theme-changed", syncHudTheme);
        setTimeout(syncHudTheme, 100);
        this.gauges = {};
        this.lastStructureKey = "";
        this.maxNet = 100; 

        api.addEventListener("ds_system_stats", (event) => {
            this.updateHUD(event.detail);
        });

        setInterval(() => this.checkSettings(), 500);
    },

    checkSettings() {
        const graph = app.graph;
        if (!graph) return;

        const node = graph._nodes.find(n => n.type === "DS_FuturisticHUD");

        if (!node) {
            this.overlay.style.display = "none";
            return;
        }

        const getVal = (name) => {
            const w = node.widgets.find(x => x.name === name);
            return w ? w.value : null;
        };

        const themeName = getVal("theme");
        const isCustom = !themeName || themeName === "Custom";
        const palette = isCustom ? [] : HUD_THEMES[themeName];

        const resolveColor = (idx, widgetName) => {
            if (isCustom) return getVal(widgetName);
            return palette[idx % palette.length];
        };

        const config = {
            active: getVal("active"),
            layout: getVal("layout"),
            corner: getVal("corner"),
            font: (window.DSGlobalTheme?.getConfig?.()?.font) || "Inter",
            bg_color: getVal("background_color"),
            bg_opacity: getVal("background_opacity"),
            scale: getVal("scale"),
            thickness: getVal("circle_thickness"),
            // Stats
            cpu: { show: getVal("show_cpu"), color: resolveColor(0, "cpu_color") },
            gpu: { show: getVal("show_gpu"), color: resolveColor(1, "gpu_color") },
            ram: { show: getVal("show_ram"), color: resolveColor(2, "ram_color") },
            vram: { show: getVal("show_vram"), color: resolveColor(3, "vram_color") },
            temp: { show: getVal("show_temp"), color: resolveColor(4, "temp_color") },
            disk: { show: getVal("show_disk"), color: resolveColor(5, "disk_color") },
            net: { show: getVal("show_net"), color: resolveColor(6, "net_color"), max: getVal("max_net_mbps") },
        };

        if (!config.active) {
            this.overlay.style.display = "none";
            return;
        }

        this.maxNet = config.net.max || 100;
        this.renderStructure(config);
    },

    renderStructure(config) {
        this.overlay.style.display = "flex";
        this.overlay.style.fontFamily = `"${config.font}", sans-serif`;
        this.overlay.style.backgroundColor = this.hexToRgba(config.bg_color, config.bg_opacity);

        this.overlay.className = ""; 
        this.overlay.classList.add((config.corner || "Bottom-Right").toLowerCase().replace("-", "-")); 
        this.overlay.classList.add((config.layout || "Horizontal").toLowerCase());

        const currentKeys = Object.keys(config).filter(k => 
            (k === 'cpu' || k === 'gpu' || k === 'ram' || k === 'vram' || k === 'temp' || k === 'disk' || k === 'net') && config[k].show
        );
        
        const structureKey = JSON.stringify({ 
            shown: currentKeys, 
            scale: config.scale, 
            thick: config.thickness, 
            layout: config.layout,
            colors: [
                config.cpu.color, config.gpu.color, config.ram.color, config.vram.color, config.temp.color,
                config.disk.color, config.net.color
            ]
        });

        if (this.lastStructureKey === structureKey) return; 
        this.lastStructureKey = structureKey;

        this.overlay.innerHTML = ""; 
        this.gauges = {};
        
        const stats = ["cpu", "gpu", "ram", "vram", "temp", "disk", "net"];
        const labels = { cpu: "CPU", gpu: "GPU", ram: "RAM", vram: "VRAM", temp: "TMP", disk: "DSK", net: "NET" };

        const baseSize = 80 * config.scale;

        stats.forEach(key => {
            if (!config[key].show) return;

            const color = config[key].color;
            const el = this.createGauge(key, labels[key], color, baseSize, config.thickness);
            this.overlay.appendChild(el);
            this.gauges[key] = el;
        });
    },

    createGauge(id, label, color, size, thickness) {
        const div = document.createElement("div");
        div.className = "ds-gauge-unit";
        div.style.width = `${size}px`;
        div.style.height = `${size}px`;
        div.style.color = color;

        const radius = 40; 
        const center = 50;
        const gapOffset = 30;
        const startAngle = gapOffset;
        const endAngle = 360 - gapOffset;
        
        const trackPath = this.describeArc(center, center, radius, startAngle, endAngle);
        
        // --- TEXT SCALING UPDATE ---
        // Lowered minimums to allow better fit at scale 0.5
        const fontSize = Math.max(11, size * 0.25); 
        const labelSize = Math.max(8, size * 0.15);

        div.innerHTML = `
            <svg class="ds-gauge-svg" viewBox="0 0 100 100">
                <path class="ds-track-bg" d="${trackPath}" stroke-width="${thickness}"></path>
                <path class="ds-progress-bar" id="ds-bar-${id}" d="${trackPath}" 
                      stroke="${color}" stroke-width="${thickness}"
                      stroke-dasharray="0 1000"></path>
            </svg>
            <div class="ds-value-display" id="ds-val-${id}" style="font-size:${fontSize}px">0</div>
            <div class="ds-label-display" style="font-size:${labelSize}px">${label}</div>
        `;
        
        setTimeout(() => {
            const bar = div.querySelector(`#ds-bar-${id}`);
            if (bar) {
                const len = bar.getTotalLength();
                bar.dataset.len = len;
                bar.style.strokeDasharray = len;
                bar.style.strokeDashoffset = len;
            }
        }, 10);

        return div;
    },

    updateHUD(data) {
        if (!data || this.overlay.style.display === "none") return;

        Object.keys(data).forEach(key => {
            if (!this.gauges[key]) return;

            let val = data[key];
            if (key === 'net') {
                const mbps = val;
                val = (mbps / this.maxNet) * 100;
            }

            const div = this.gauges[key];
            const bar = div.querySelector(`#ds-bar-${key}`);
            const text = div.querySelector(`#ds-val-${key}`);
            
            if (bar && bar.dataset.len) {
                const len = parseFloat(bar.dataset.len);
                const pct = Math.max(0, Math.min(100, val));
                const offset = len - (pct / 100 * len);
                bar.style.strokeDashoffset = offset;
            }
            
            if (text) {
                text.innerText = Math.round(val);
            }
        });
    },

    // --- Helpers ---
    polarToCartesian(centerX, centerY, radius, angleInDegrees) {
        var angleInRadians = (angleInDegrees) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    },

    describeArc(x, y, radius, startAngle, endAngle) {
        var start = this.polarToCartesian(x, y, radius, endAngle);
        var end = this.polarToCartesian(x, y, radius, startAngle);
        var largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return [
            "M", start.x, start.y, 
            "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
        ].join(" ");
    },

    hexToRgba(hex, alpha) {
        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function(m, r, g, b) {
            return r + r + g + g + b + b;
        });
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})` : hex;
    }
});
