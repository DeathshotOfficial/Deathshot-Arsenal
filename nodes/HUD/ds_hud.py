# DeathshotArsenal/ds_hud.py

class DS_FuturisticHUD:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # --- General Settings ---
                "active": ("BOOLEAN", {"default": True}),
                "overlay_mode": ("BOOLEAN", {"default": True, "label": "Overlay (Always on Top)"}),
                "theme": (["Custom", "Cyberpunk", "Sci-Fi Blue", "Red Alert", "Matrix", "Rainbow", "Dracula", "Gold"], {"default": "Custom"}),
                "layout": (["Horizontal", "Vertical"], {"default": "Horizontal"}),
                "corner": (["Top-Right", "Top-Left", "Bottom-Right", "Bottom-Left"], {"default": "Bottom-Right"}),
                "background_color": ("STRING", {"default": "#0b0b10", "multiline": False}),
                "background_opacity": ("FLOAT", {"default": 0.8, "min": 0.0, "max": 1.0, "step": 0.05}),
                
                # --- Gauge Geometry ---
                "scale": ("FLOAT", {"default": 1.0, "min": 0.5, "max": 2.0, "step": 0.1}),
                "circle_thickness": ("INT", {"default": 10, "min": 2, "max": 20}),
                
                # --- Stats Toggles & Colors (Used when Theme is 'Custom') ---
                "show_cpu": ("BOOLEAN", {"default": True}),
                "cpu_color": ("STRING", {"default": "#00f0ff"}),
                
                "show_gpu": ("BOOLEAN", {"default": True}),
                "gpu_color": ("STRING", {"default": "#d600ff"}),
                
                "show_ram": ("BOOLEAN", {"default": True}),
                "ram_color": ("STRING", {"default": "#00ff66"}),
                
                "show_vram": ("BOOLEAN", {"default": True}),
                "vram_color": ("STRING", {"default": "#ffae00"}),
                
                "show_temp": ("BOOLEAN", {"default": True}),
                "temp_color": ("STRING", {"default": "#ff1a1a"}),
                
                "show_disk": ("BOOLEAN", {"default": True}),
                "disk_color": ("STRING", {"default": "#0077ff"}),
                
                "show_net": ("BOOLEAN", {"default": True}),
                "net_color": ("STRING", {"default": "#ff00ff"}),
                "max_net_mbps": ("INT", {"default": 100, "min": 10, "max": 10000}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "do_nothing"
    CATEGORY = "☠️ Deathshot Arsenal/🎨 UI"
    
    def do_nothing(self, **kwargs):
        return ()
