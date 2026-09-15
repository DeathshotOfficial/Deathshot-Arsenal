// js/ds_pipe.js
import { app } from "/scripts/app.js";

// --- Smart Naming Map ---
const SHORT_NAME_MAP = {
    "model": "Model",
    "vae": "VAE",
    "clip": "CLIP",
    "conditioning": "Cond",
    "positive": "+ve",
    "negative": "-ve",
    "latent_image": "Latent",
    "samples": "Latent",
    "image": "Image",
    "images": "Image",
    "mask": "Mask",
    "control_net": "ControlNet",
    "upscale_model": "Upscaler",
    "seed": "Seed",
    "steps": "Steps",
    "cfg": "CFG",
    "denoise": "Denoise",
    "bbox": "BBox",
    "seg": "Seg",
    "keyframe": "Keyframe"
};

// Helper to get short name
function getShortName(fullName, type) {
    const lower = fullName.toLowerCase();
    // Specific checks for +/- from known nodes
    if (lower === "positive") return "+ve";
    if (lower === "negative") return "-ve";
    
    if (SHORT_NAME_MAP[lower]) return SHORT_NAME_MAP[lower];
    
    // Fallback: If type is known, use type
    const lowerType = (type || "").toLowerCase();
    if (SHORT_NAME_MAP[lowerType]) return SHORT_NAME_MAP[lowerType];
    
    // Fallback: Truncate
    return fullName.length > 10 ? fullName.substring(0, 10) : fullName;
}

app.registerExtension({
    name: "Deathshot.Pipe",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // ---------------------------------------------------------------------
        // PIPE IN NODE
        // ---------------------------------------------------------------------
        if (nodeData.name === "DS_PipeIn") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                this.properties = this.properties || {};
                
                // Ensure initial slot
                if (!this.inputs || this.inputs.length === 0) {
                    this.addInput("input_1", "*");
                }

                // --- AUTO SPAWN PIPE OUT ---
                if (!app.configuringGraph) {
                    setTimeout(() => {
                        if (this.outputs[0] && this.outputs[0].links && this.outputs[0].links.length > 0) return;
                        const outNode = LiteGraph.createNode("DS_PipeOut");
                        if (outNode) {
                            outNode.pos = [this.pos[0] + this.size[0] + 80, this.pos[1]];
                            app.graph.add(outNode);
                            this.connect(0, outNode, 0);
                        }
                    }, 50);
                }
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info, slot_def) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                if (type !== 1) return; // Only inputs

                const inputs = this.inputs;
                if (!inputs) return;

                // 1. AUTO-ADD SLOT
                const lastIndex = inputs.length - 1;
                if (inputs[lastIndex].link !== null) {
                    const nextIndex = inputs.length + 1;
                    // Temp name, will be renamed if connected
                    this.addInput(`input_${nextIndex}`, "*");
                }

                // 2. RENAME / RECOLOR CURRENT SLOT
                const input = inputs[index];
                const slotIndex = index + 1; // 1-based index

                if (connected && link_info) {
                    const originNode = app.graph.getNodeById(link_info.origin_id);
                    if (originNode) {
                        const originSlot = originNode.outputs[link_info.origin_slot];
                        if (originSlot) {
                            // Adopt Type (Color)
                            input.type = originSlot.type;
                            
                            // Naming: "1. +ve [KSampler]"
                            const shortType = getShortName(originSlot.name, originSlot.type);
                            const nodeName = originNode.title || originNode.type;
                            const finalLabel = `${slotIndex}. ${shortType} [${nodeName}]`;
                            
                            input.name = finalLabel;
                            input.label = finalLabel;
                        }
                    }
                } else {
                    // Reset on disconnect
                    input.type = "*";
                    input.name = `input_${slotIndex}`;
                    input.label = `input_${slotIndex}`;
                }
                
                // 3. REFRESH ALL NAMES (To ensure numbering is correct if slots shifted)
                // We iterate all inputs to ensure 1, 2, 3 sequence is perfect
                for (let i = 0; i < this.inputs.length; i++) {
                    const inp = this.inputs[i];
                    // If it matches our pattern "X. Name [Node]", update X
                    // or if it matches "input_X", update X
                    
                    // Simple regex to check if it has our custom formatting
                    // We only update the index prefix "1. ", "2. "
                    const currentName = inp.name;
                    const newPrefix = `${i + 1}.`;
                    
                    if (currentName.includes("[")) {
                         // It's a custom name like "5. +ve [Node]"
                         // Replace the start number
                         inp.name = currentName.replace(/^\d+\./, newPrefix);
                         inp.label = inp.name;
                    } else if (currentName.startsWith("input_")) {
                        // It's a default name
                        inp.name = `input_${i + 1}`;
                        inp.label = `input_${i + 1}`;
                    }
                }

                this.setSize(this.computeSize());
            };
            
            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                if (onDrawForeground) onDrawForeground.apply(this, arguments);
                if (this.properties["ds_bg_color"]) this.bgcolor = this.properties["ds_bg_color"];
                if (this.properties["ds_title_color"]) this.boxcolor = this.properties["ds_title_color"];
            };
        }

        // ---------------------------------------------------------------------
        // PIPE OUT NODE
        // ---------------------------------------------------------------------
        if (nodeData.name === "DS_PipeOut") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                this.properties = this.properties || {};
                
                if (!this.inputs || this.inputs.length === 0) {
                    this.addInput("pipe", "DS_PIPE");
                }
            };

            nodeType.prototype.getUpstreamPipe = function() {
                if (!this.inputs || !this.inputs[0] || this.inputs[0].link === null) return null;
                const linkId = this.inputs[0].link;
                const link = app.graph.links[linkId];
                if (!link) return null;
                const originNode = app.graph.getNodeById(link.origin_id);
                if (originNode && originNode.type === "DS_PipeIn") {
                    return originNode;
                }
                return null;
            };

            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                if (onDrawForeground) onDrawForeground.apply(this, arguments);
                
                // Sync Logic
                const sourceNode = this.getUpstreamPipe();
                if (sourceNode) {
                    // Only consider connected inputs on the source
                    const sourceInputs = sourceNode.inputs.filter(inp => inp.link !== null);
                    const targetCount = sourceInputs.length;
                    const currentOutputCount = this.outputs ? this.outputs.length : 0;
                    
                    let changed = false;

                    // 1. Resize
                    if (currentOutputCount !== targetCount) {
                        if (currentOutputCount < targetCount) {
                            for (let i = currentOutputCount; i < targetCount; i++) {
                                this.addOutput(`output_${i+1}`, "*"); 
                            }
                        } else {
                            for (let i = currentOutputCount - 1; i >= targetCount; i--) {
                                this.removeOutput(i);
                            }
                        }
                        changed = true;
                    }
                    
                    // 2. Sync Properties
                    for (let i = 0; i < targetCount; i++) {
                        const src = sourceInputs[i];
                        const dst = this.outputs[i];
                        
                        // Exact copy of the name created in PipeIn
                        if (dst.name !== src.name) {
                            dst.name = src.name;
                            dst.label = src.name;
                            changed = true;
                        }
                        
                        if (dst.type !== src.type) {
                            dst.type = src.type;
                            changed = true;
                        }
                    }
                    
                    if (changed) {
                         this.setSize(this.computeSize());
                         app.graph.setDirtyCanvas(true, true);
                    }
                }

                if (this.properties["ds_bg_color"]) this.bgcolor = this.properties["ds_bg_color"];
                if (this.properties["ds_title_color"]) this.boxcolor = this.properties["ds_title_color"];
            };
        }
    }
});
