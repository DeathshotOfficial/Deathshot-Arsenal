# DeathshotArsenal/__init__.py
__version__ = "1.0"

import server
import torch
import sys
import os
import glob
import time
import threading
import mimetypes
import logging
import psutil
import shutil
import platform
import subprocess
import re
from aiohttp import web
from PIL import Image, ImageOps
import io
import folder_paths
import asyncio
import json
import importlib.util

# --- DS FRONTEND EXTENSIONS ---
DS_EXTENSIONS_DIR = os.path.join(os.path.dirname(__file__), "extensions")
DS_EXTENSIONS_URL = "/ds_extensions/DeathshotArsenal/{path:.*}"

try:
    routes = server.PromptServer.instance.routes

    @routes.post("/ds_debug_log")
    async def _ds_debug_log(request):
        """Mirror Control Panel browser diagnostics to the ComfyUI terminal."""
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        try:
            event = str(payload.get("event", "unknown"))[:160]
            message = str(payload.get("message", ""))[:4000]
            details = payload.get("details", {})
            if not isinstance(details, dict):
                details = {"value": str(details)[:2000]}
            try:
                detail_text = " " + json.dumps(details, ensure_ascii=False, default=str)[:4000] if details else ""
            except Exception:
                detail_text = " " + str(details)[:4000] if details else ""
            print(f"[DeathshotArsenal][ControlPanel][BROWSER] {event}: {message}{detail_text}", flush=True)
        except Exception as e:
            print(f"[DeathshotArsenal][ControlPanel][BROWSER] logger failed: {e}", flush=True)
        return web.json_response({"ok": True})

    @routes.get(DS_EXTENSIONS_URL)
    async def _ds_frontend_extension(request):
        rel = request.match_info.get("path", "")
        if not rel or "\x00" in rel:
            return web.Response(status=404)
        base = os.path.abspath(DS_EXTENSIONS_DIR)
        target = os.path.abspath(os.path.join(base, rel.replace("/", os.sep)))
        try:
            if os.path.commonpath((base, target)) != base:
                return web.Response(status=403)
        except ValueError:
            return web.Response(status=403)
        if not os.path.isfile(target) or not target.lower().endswith(".js"):
            return web.Response(status=404)
        return web.FileResponse(target)

except Exception as e:
    print(f"[DeathshotArsenal] Failed to register frontend extensions route: {e}")

# Try importing pynvml
try:
    import pynvml
    pynvml.nvmlInit()
    HAS_PYNVML = True
except Exception:
    HAS_PYNVML = False

_HERE = os.path.dirname(__file__)


def _load_node_pkg(tag, folder_name):
    node_dir = os.path.join(_HERE, "nodes", folder_name)
    init = os.path.join(node_dir, "__init__.py")
    spec = importlib.util.spec_from_file_location(
        f"DeathshotArsenal._pkg_{tag}",
        init,
        submodule_search_locations=[node_dir],
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


# DS Seed
try:
    _mod = _load_node_pkg("seed", "Seed")
    DS_Seed = _mod.DS_Seed
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Seed: {e}", flush=True)
    DS_Seed = None

# DS Label (frontend-only canvas annotation; backend noop for workflow validation)
try:
    _mod = _load_node_pkg("label", "Label")
    DS_Label = _mod.DS_Label
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Label: {e}", flush=True)
    DS_Label = None

# DS Reroute (pass-through routing node with editable label)
try:
    _mod = _load_node_pkg("reroute", "Reroute")
    DS_Reroute = _mod.DS_Reroute
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Reroute: {e}", flush=True)
    DS_Reroute = None

# DS Run Timer
try:
    _mod = _load_node_pkg("run_timer", "Run Timer")
    DS_RunTimer = _mod.DS_RunTimer
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_RunTimer: {e}", flush=True)
    DS_RunTimer = None

# DS Prompt Scanner
try:
    _mod = _load_node_pkg("prompt_scanner", "Prompt Scanner")
    DS_PromptScanner = _mod.DS_PromptScanner
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_PromptScanner: {e}", flush=True)
    DS_PromptScanner = None

# DS HUD
try:
    _mod = _load_node_pkg("hud", "HUD")
    DS_FuturisticHUD = _mod.DS_FuturisticHUD
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_FuturisticHUD: {e}", flush=True)
    DS_FuturisticHUD = None

# DS Image Save Advance
try:
    _mod = _load_node_pkg("image_save_advance", "Image Save Advance")
    DS_ImageSaveAdvance = _mod.DS_ImageSaveAdvance
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ImageSaveAdvance: {e}", flush=True)
    DS_ImageSaveAdvance = None

# DS NSFW (utility detector used by thumbnail API route)
try:
    _mod = _load_node_pkg("nsfw", "NSFW")
    nsfw_detector = _mod.detector
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load nsfw_detector: {e}", flush=True)
    nsfw_detector = None

# DS Pipe
try:
    _mod = _load_node_pkg("pipe", "Pipe")
    DS_PipeIn = _mod.DS_PipeIn
    DS_PipeOut = _mod.DS_PipeOut
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_PipeIn/PipeOut: {e}", flush=True)
    DS_PipeIn = None
    DS_PipeOut = None

# DS Image Checkpoint
try:
    _mod = _load_node_pkg("image_checkpoint", "Image Checkpoint")
    DS_ImageCheckpoint = _mod.DS_ImageCheckpoint
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ImageCheckpoint: {e}", flush=True)
    DS_ImageCheckpoint = None

# DS Image Preview
try:
    _mod = _load_node_pkg("image_preview", "Image Preview")
    DS_ImagePreview = _mod.DS_ImagePreview
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ImagePreview: {e}", flush=True)
    DS_ImagePreview = None

# DS Any Switch
try:
    _mod = _load_node_pkg("any_switch", "Any Switch")
    DS_AnySwitch = _mod.DS_AnySwitch
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_AnySwitch: {e}", flush=True)
    DS_AnySwitch = None

# DS Switch
try:
    _mod = _load_node_pkg("switch", "Switch")
    DS_Switch = _mod.DS_Switch
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Switch: {e}", flush=True)
    DS_Switch = None



# DS Hardware Monitor
try:
    _mod = _load_node_pkg("hardware_monitor", "Hardware Monitor")
    DS_HardwareMonitor = _mod.DS_HardwareMonitor
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_HardwareMonitor: {e}", flush=True)
    DS_HardwareMonitor = None

# DS Image Compare
try:
    _mod = _load_node_pkg("image_compare", "Image Compare")
    DS_ImageCompare = _mod.DS_ImageCompare
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ImageCompare: {e}", flush=True)
    DS_ImageCompare = None

# DS Load Image
try:
    _mod = _load_node_pkg("load_image", "Load Image")
    DS_LoadImage = _mod.DS_LoadImage
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_LoadImage: {e}", flush=True)
    DS_LoadImage = None

# DS Load Video
try:
    _mod = _load_node_pkg("load_video", "Load Video")
    DS_LoadVideo = _mod.DS_LoadVideo
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_LoadVideo: {e}", flush=True)
    DS_LoadVideo = None

# DS Outpaint
try:
    _mod = _load_node_pkg("outpaint", "Outpaint")
    DS_Outpaint = _mod.DS_Outpaint
    DS_OutpaintStitch = getattr(_mod, "DS_OutpaintStitch", None)
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Outpaint: {e}", flush=True)
    DS_Outpaint = None
    DS_OutpaintStitch = None

# DS Prompt
try:
    _mod = _load_node_pkg("prompt", "Prompt")
    DS_Prompt = _mod.DS_Prompt
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Prompt: {e}", flush=True)
    DS_Prompt = None

# DS Show Text
try:
    _mod = _load_node_pkg("show_text", "Show Text")
    DS_ShowText = _mod.DS_ShowText
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ShowText: {e}", flush=True)
    DS_ShowText = None

# DS Resolution
try:
    _mod = _load_node_pkg("resolution", "Resolution")
    DS_Resolution = _mod.DS_Resolution
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Resolution: {e}", flush=True)
    DS_Resolution = None

# DS Prompt Cards
try:
    _mod = _load_node_pkg("prompt_cards", "Prompt Cards")
    DS_PromptCards = _mod.DS_PromptCards
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_PromptCards: {e}", flush=True)
    DS_PromptCards = None

# DS Video Timing
try:
    _mod = _load_node_pkg("video_timing", "Video Timing")
    DS_VideoTiming = _mod.DS_VideoTiming
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_VideoTiming: {e}", flush=True)
    DS_VideoTiming = None

# DS Theme Manager
try:
    _mod = _load_node_pkg("theme_manager", "Theme Manager")
    DS_ThemeManager = _mod.DS_ThemeManager
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ThemeManager: {e}", flush=True)
    DS_ThemeManager = None

# DS Group Switch
try:
    _mod = _load_node_pkg("group_switch", "Group Switch")
    DS_GroupSwitch = _mod.DS_GroupSwitch
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_GroupSwitch: {e}", flush=True)
    DS_GroupSwitch = None

# DS LoRa Loader
try:
    _mod = _load_node_pkg("lora_loader", "LoRa Loader")
    DS_LoRaLoader = _mod.DS_LoRaLoader
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_LoRaLoader: {e}", flush=True)
    DS_LoRaLoader = None

# DS Control Panel
try:
    _mod = _load_node_pkg("control_panel", "Control Panel")
    DS_ControlPanel = _mod.DS_ControlPanel
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ControlPanel: {e}", flush=True)
    DS_ControlPanel = None

# DS System Monitor
try:
    _mod = _load_node_pkg("system_monitor", "System Monitor")
    DS_SystemMonitor = _mod.DS_SystemMonitor
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_SystemMonitor: {e}", flush=True)
    DS_SystemMonitor = None

# DS Image Loader
try:
    _mod = _load_node_pkg("image_loader", "Image Loader")
    DS_ImageLoader = _mod.DS_ImageLoader
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ImageLoader: {e}", flush=True)
    DS_ImageLoader = None

# DS Quick Save
try:
    _mod = _load_node_pkg("quick_save", "Quick Save")
    DS_QuickSave = _mod.DS_QuickSave
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_QuickSave: {e}", flush=True)
    DS_QuickSave = None

# DS Load Images From Folder
try:
    _mod = _load_node_pkg("load_images_folder", "Load Images From Folder")
    DS_LoadImagesFromFolder = _mod.DS_LoadImagesFromFolder
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_LoadImagesFromFolder: {e}", flush=True)
    DS_LoadImagesFromFolder = None

# DS Version Check
try:
    _mod = _load_node_pkg("version_check", "Version Check")
    DS_VersionCheck = _mod.DS_VersionCheck
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_VersionCheck: {e}", flush=True)
    DS_VersionCheck = None

# DS The Purger
try:
    _mod = _load_node_pkg("the_purger", "The Purger")
    DS_ThePurger = _mod.DS_ThePurger
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_ThePurger: {e}", flush=True)
    DS_ThePurger = None

# DS Video Save
try:
    _mod = _load_node_pkg("video_save", "Video Save")
    DS_VideoSave = _mod.DS_VideoSave
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_VideoSave: {e}", flush=True)
    DS_VideoSave = None

# DS Notes
try:
    _mod = _load_node_pkg("notes", "Notes")
    DS_Notes = _mod.DS_Notes
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Notes: {e}", flush=True)
    DS_Notes = None

# DS Gallery
try:
    _mod = _load_node_pkg("gallery", "Gallery")
    DS_Gallery = _mod.DS_Gallery
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Gallery: {e}", flush=True)
    DS_Gallery = None

# DS Interpolation
try:
    _mod = _load_node_pkg("interpolation", "Interpolation")
    DS_Interpolation = _mod.DS_Interpolation
    if hasattr(_mod, "register_interpolation_routes"):
        _mod.register_interpolation_routes()
except Exception as e:
    print(f"[DeathshotArsenal] Failed to load DS_Interpolation: {e}", flush=True)
    DS_Interpolation = None



# --- HELPERS ---

def get_cpu_model_name():
    try:
        system = platform.system()
        if system == "Windows":
            return subprocess.check_output(["wmic", "cpu", "get", "name"]).decode().strip().split("\n")[1]
        elif system == "Darwin":
            return subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"]).decode().strip()
        elif system == "Linux":
            with open("/proc/cpuinfo", "r") as f:
                for line in f:
                    if "model name" in line:
                        return line.split(":")[1].strip()
        return platform.processor()
    except Exception:
        return platform.processor() or "Unknown CPU"

def get_gpu_driver_version():
    if HAS_PYNVML:
        try:
            return pynvml.nvmlSystemGetDriverVersion().decode("utf-8")
        except:
            pass
    try:
        if platform.system() == "Windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            output = subprocess.check_output(
                ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"],
                startupinfo=startupinfo
            )
        else:
            output = subprocess.check_output(
                ["nvidia-smi", "--query-gpu=driver_version", "--format=csv,noheader"]
            )
        return output.decode("utf-8").strip()
    except:
        return "Unknown"

def _run_hidden_cmd(cmd, timeout=2.5):
    try:
        if platform.system() == "Windows":
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            output = subprocess.check_output(
                cmd, startupinfo=startupinfo, timeout=timeout, stderr=subprocess.DEVNULL
            )
        else:
            output = subprocess.check_output(cmd, timeout=timeout, stderr=subprocess.DEVNULL)
        return output.decode("utf-8", errors="ignore").strip()
    except Exception:
        return None

def _query_nvidia_smi(fields):
    out = _run_hidden_cmd(
        ["nvidia-smi", f"--query-gpu={fields}", "--format=csv,noheader,nounits"]
    )
    if not out:
        return None
    line = out.split("\n")[0].strip()
    if line in ("", "[N/A]", "N/A"):
        return None
    return line

def get_nvidia_gpu_stats():
    util_raw = _query_nvidia_smi("utilization.gpu")
    temp_raw = _query_nvidia_smi("temperature.gpu")
    clock_raw = _query_nvidia_smi("clocks.current.graphics")
    power_raw = _query_nvidia_smi("power.draw")
    stats = {}
    try:
        if util_raw is not None:
            stats["gpu"] = int(float(util_raw))
    except (ValueError, TypeError):
        pass
    try:
        if temp_raw is not None:
            stats["gpu_temp"] = int(float(temp_raw))
    except (ValueError, TypeError):
        pass
    try:
        if clock_raw is not None:
            stats["gpu_clock"] = int(float(clock_raw))
    except (ValueError, TypeError):
        pass
    try:
        if power_raw is not None:
            stats["gpu_power"] = round(float(power_raw), 1)
    except (ValueError, TypeError):
        pass
    return stats

def get_amd_gpu_stats():
    out = _run_hidden_cmd(["rocm-smi", "--showuse"])
    if not out:
        return {}
    stats = {}
    for line in out.splitlines():
        if "GPU use" in line or "GPU%" in line:
            parts = re.findall(r"(\d+(?:\.\d+)?)\s*%", line)
            if parts:
                try:
                    stats["gpu"] = int(float(parts[0]))
                except (ValueError, TypeError):
                    pass
                break
    temp_out = _run_hidden_cmd(["rocm-smi", "--showtemp"])
    if temp_out:
        for line in temp_out.splitlines():
            if "Temperature" in line or "Edge" in line:
                parts = re.findall(r"(\d+(?:\.\d+)?)", line)
                if parts:
                    try:
                        stats["gpu_temp"] = int(float(parts[-1]))
                    except (ValueError, TypeError):
                        pass
                    break
    return stats

def get_pynvml_gpu_stats():
    global HAS_PYNVML
    try:
        import pynvml
        if not HAS_PYNVML:
            pynvml.nvmlInit()
            HAS_PYNVML = True
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        stats = {"gpu": util.gpu}
        try:
            stats["gpu_temp"] = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
        except Exception:
            pass
        try:
            stats["gpu_clock"] = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
        except Exception:
            pass
        try:
            stats["gpu_power"] = round(pynvml.nvmlDeviceGetPowerUsage(handle) / 1000, 1)
        except Exception:
            pass
        return stats
    except Exception:
        return {}

# --- SYSTEM MONITOR THREAD ---
class SystemMonitor(threading.Thread):
    def __init__(self):
        super().__init__()
        self.daemon = True
        self.stop_event = threading.Event()
        self.last_net_io = psutil.net_io_counters()
        self.last_time = time.time()

    def run(self):
        while not self.stop_event.is_set():
            try:
                stats = self.get_stats()
                server.PromptServer.instance.send_sync("ds_system_stats", stats)
            except Exception:
                pass
            time.sleep(1.0)

    def get_stats(self):
        cpu_percent = psutil.cpu_percent()
        cpu_freq = None
        cpu_temp = None
        try:
            freq = psutil.cpu_freq()
            if freq and freq.current:
                cpu_freq = round(freq.current, 0)
        except Exception:
            pass
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                for entries in temps.values():
                    for entry in entries:
                        if entry.current is not None:
                            cpu_temp = round(entry.current, 1)
                            break
                    if cpu_temp is not None:
                        break
        except Exception:
            pass

        mem = psutil.virtual_memory()
        ram_percent = mem.percent
        ram_used_gb = mem.used / (1024 ** 3)
        ram_free_gb = mem.available / (1024 ** 3)
        ram_total_gb = mem.total / (1024 ** 3)

        gpu_util = None
        gpu_clock = None
        gpu_power = None
        vram_percent = 0
        vram_used_gb = 0
        vram_total_gb = 0
        vram_free_gb = 0
        gpu_temp = None
        gpu_vendor = None
        gpu_available = False

        if torch.cuda.is_available():
            gpu_available = True
            gpu_vendor = "nvidia"
            try:
                mem_used = torch.cuda.memory_allocated()
                mem_reserved = torch.cuda.memory_reserved()
                props = torch.cuda.get_device_properties(0)
                mem_total = props.total_memory

                vram_percent = (mem_used / mem_total) * 100 if mem_total else 0
                vram_used_gb = mem_used / (1024 ** 3)
                vram_total_gb = mem_total / (1024 ** 3)
                vram_free_gb = max(0, (mem_total - mem_reserved) / (1024 ** 3))
            except Exception:
                pass

        gpu_stats = get_pynvml_gpu_stats()
        if not gpu_stats:
            gpu_stats = get_nvidia_gpu_stats()
        if not gpu_stats:
            gpu_stats = get_amd_gpu_stats()
            if gpu_stats:
                gpu_available = True
                gpu_vendor = gpu_vendor or "amd"

        if gpu_stats:
            gpu_available = True
            gpu_util = gpu_stats.get("gpu")
            gpu_temp = gpu_stats.get("gpu_temp", gpu_temp)
            gpu_clock = gpu_stats.get("gpu_clock", gpu_clock)
            gpu_power = gpu_stats.get("gpu_power", gpu_power)

        if not gpu_available and _query_nvidia_smi("name"):
            gpu_available = True
            gpu_vendor = "nvidia"
            if gpu_util is None:
                smi = get_nvidia_gpu_stats()
                gpu_util = smi.get("gpu")
                gpu_temp = smi.get("gpu_temp", gpu_temp)
                gpu_clock = smi.get("gpu_clock", gpu_clock)
                gpu_power = smi.get("gpu_power", gpu_power)

        try:
            disk = psutil.disk_usage(folder_paths.base_path).percent
        except Exception:
            disk = 0

        current_net_io = psutil.net_io_counters()
        current_time = time.time()

        sent_delta = current_net_io.bytes_sent - self.last_net_io.bytes_sent
        recv_delta = current_net_io.bytes_recv - self.last_net_io.bytes_recv
        time_delta = current_time - self.last_time
        if time_delta <= 0:
            time_delta = 1.0

        mbps_sent = (sent_delta * 8) / (1024 * 1024) / time_delta
        mbps_recv = (recv_delta * 8) / (1024 * 1024) / time_delta
        total_mbps = mbps_sent + mbps_recv

        self.last_net_io = current_net_io
        self.last_time = current_time

        return {
            "cpu": cpu_percent,
            "cpu_freq": cpu_freq,
            "cpu_temp": cpu_temp,
            "ram": ram_percent,
            "ram_used_gb": round(ram_used_gb, 2),
            "ram_free_gb": round(ram_free_gb, 2),
            "ram_total_gb": round(ram_total_gb, 2),
            "gpu": gpu_util,
            "gpu_clock": gpu_clock,
            "gpu_power": gpu_power,
            "gpu_temp": gpu_temp,
            "gpu_available": gpu_available,
            "gpu_vendor": gpu_vendor,
            "vram": vram_percent,
            "vram_used_gb": round(vram_used_gb, 2),
            "vram_free_gb": round(vram_free_gb, 2),
            "vram_total_gb": round(vram_total_gb, 2),
            "temp": gpu_temp,
            "disk": disk,
            "net": total_mbps,
        }

monitor = SystemMonitor()
monitor.start()

# --- API ROUTES ---
@server.PromptServer.instance.routes.post("/ds/browse")
async def browse_folder(request):
    try:
        if os.environ.get("HEADLESS", "false").lower() == "true":
            return web.json_response({"error": "Headless mode detected"})
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes("-topmost", 1)
        path = filedialog.askdirectory()
        root.destroy()
        return web.json_response({"path": path})
    except Exception as e:
        return web.json_response({"error": "Tkinter unavailable", "details": str(e)})

@server.PromptServer.instance.routes.get("/ds/full_system_info")
async def get_full_system_info(request):
    try:
        os_info = {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "arch": platform.machine()
        }
        cpu_name = get_cpu_model_name()
        cpu_info = {
            "model": cpu_name,
            "physical_cores": psutil.cpu_count(logical=False),
            "logical_cores": psutil.cpu_count(logical=True),
        }
        mem = psutil.virtual_memory()
        ram_info = {"total_gb": round(mem.total / (1024**3), 2)}
        
        gpu_info = {"name": "No GPU", "vram_total_gb": 0, "driver": "N/A", "available": False}
        if torch.cuda.is_available():
            try:
                props = torch.cuda.get_device_properties(0)
                gpu_info["name"] = torch.cuda.get_device_name(0)
                gpu_info["vram_total_gb"] = round(props.total_memory / (1024**3), 2)
                gpu_info["driver"] = get_gpu_driver_version()
                gpu_info["available"] = True
            except:
                pass
        
        disks = []
        partitions = psutil.disk_partitions(all=False)
        for p in partitions:
            if "snap" in p.mountpoint or "loop" in p.device:
                continue
            try:
                usage = psutil.disk_usage(p.mountpoint)
                disks.append({
                    "device": p.device,
                    "mountpoint": p.mountpoint,
                    "fstype": p.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent
                })
            except Exception:
                continue
        
        return web.json_response({
            "os": os_info,
            "cpu": cpu_info,
            "ram": ram_info,
            "gpu": gpu_info,
            "disks": disks
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/ds/files")
async def list_files(request):
    path = request.query.get("path", "")
    sort_by = request.query.get("sort", "newest")
    search = request.query.get("search", "").lower()
    if not path or not os.path.exists(path):
        return web.json_response({"error": "Invalid path"}, status=404)
    allowed_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
    files_data = []
    try:
        with os.scandir(path) as entries:
            for entry in entries:
                if not entry.is_file(): continue
                if entry.name.startswith("."): continue
                ext = os.path.splitext(entry.name)[1].lower()
                if ext not in allowed_exts: continue
                if search and search not in entry.name.lower(): continue
                stats = entry.stat()
                files_data.append({
                    "name": entry.name,
                    "path": entry.path,
                    "mtime": stats.st_mtime,
                    "size": stats.st_size
                })
    except Exception:
        return web.json_response({"files": []})
    if sort_by == "newest": files_data.sort(key=lambda x: x["mtime"], reverse=True)
    elif sort_by == "oldest": files_data.sort(key=lambda x: x["mtime"])
    elif sort_by == "name_asc": files_data.sort(key=lambda x: x["name"].lower())
    elif sort_by == "name_desc": files_data.sort(key=lambda x: x["name"].lower(), reverse=True)
    return web.json_response({"files": files_data})

@server.PromptServer.instance.routes.get("/ds/thumbnail")
async def get_thumbnail(request):
    path = request.query.get("path", "")
    nsfw_check = request.query.get("nsfw", "false") == "true"
    threshold = float(request.query.get("thresh", "0.6"))
    strength = int(request.query.get("strength", "15"))
    if not os.path.exists(path): return web.Response(status=404)
    try:
        is_unsafe = False
        if nsfw_check and nsfw_detector is not None:
            loop = asyncio.get_event_loop()
            is_unsafe = await loop.run_in_executor(None, nsfw_detector.is_nsfw, path, threshold)
        img = Image.open(path)
        ImageOps.exif_transpose(img, in_place=True)
        img.thumbnail((256, 256), Image.Resampling.LANCZOS)
        if is_unsafe and nsfw_detector is not None: img = nsfw_detector.blur_image(img, strength)
        buf = io.BytesIO()
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img.save(buf, format="WEBP", quality=80)
        else:
            img = img.convert("RGB")
            img.save(buf, format="JPEG", quality=70)
        buf.seek(0)
        return web.Response(body=buf.read(), content_type="image/webp")
    except Exception:
        return web.Response(status=500)

@server.PromptServer.instance.routes.get("/ds/image")
async def get_full_image(request):
    path = request.query.get("path", "")
    if not os.path.exists(path): return web.Response(status=404)
    return web.FileResponse(path)

@server.PromptServer.instance.routes.post("/ds/delete")
async def delete_files(request):
    try:
        data = await request.json()
        files = data.get("files", [])
        deleted = []
        errors = []
        for file_path in files:
            if os.path.exists(file_path) and os.path.isfile(file_path):
                try:
                    os.remove(file_path)
                    deleted.append(file_path)
                except Exception as e:
                    errors.append(str(e))
        return web.json_response({"deleted": len(deleted), "errors": errors})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/ds/loras")
async def get_loras(request):
    try:
        loras = folder_paths.get_filename_list("loras")
        return web.json_response(loras)
    except Exception:
        return web.json_response([], status=500)

@server.PromptServer.instance.routes.post("/ds/disk_info")
async def get_disk_info(request):
    try:
        data = await request.json()
        path = data.get("path", folder_paths.base_path)
        if path.startswith('"') and path.endswith('"'): path = path[1:-1]
        if not os.path.isabs(path): path = os.path.abspath(os.path.join(folder_paths.base_path, path))
        check_path = path
        while not os.path.exists(check_path):
            parent = os.path.dirname(check_path)
            if parent == check_path: break
            check_path = parent
        if not os.path.exists(check_path): check_path = folder_paths.base_path
        total, used, free = shutil.disk_usage(check_path)
        return web.json_response({
            "total_gb": total / (1024 ** 3),
            "free_gb": free / (1024 ** 3),
            "used_gb": used / (1024 ** 3),
            "path": check_path
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

# DS Video Save routes are registered by nodes/Video Save/ds_video_save.py
try:
    _video_save_pkg = sys.modules.get("DeathshotArsenal._pkg_video_save")
    if _video_save_pkg and hasattr(_video_save_pkg, "register_video_save_routes"):
        _video_save_pkg.register_video_save_routes()
except Exception as e:
    print(f"[DeathshotArsenal] Note on video save routes: {e}", flush=True)

# DS Load Video routes are registered by nodes/Load Video/ds_load_video.py
try:
    _load_video_pkg = sys.modules.get("DeathshotArsenal._pkg_load_video")
    if _load_video_pkg and hasattr(_load_video_pkg, "register_load_video_routes"):
        _load_video_pkg.register_load_video_routes()
except Exception as e:
    print(f"[DeathshotArsenal] Note on load video routes: {e}", flush=True)

# --- MAPPINGS ---
NODE_CLASS_MAPPINGS = {
    **({"DS_Label": DS_Label} if DS_Label is not None else {}),
    **({"DS_RunTimer": DS_RunTimer} if DS_RunTimer is not None else {}),
    **({"DS_PromptScanner": DS_PromptScanner} if DS_PromptScanner is not None else {}),
    **({"DS_FuturisticHUD": DS_FuturisticHUD} if DS_FuturisticHUD is not None else {}),
    **({"DS_ImageSaveAdvance": DS_ImageSaveAdvance} if DS_ImageSaveAdvance is not None else {}),
    **({"DS_PipeIn": DS_PipeIn} if DS_PipeIn is not None else {}),
    **({"DS_PipeOut": DS_PipeOut} if DS_PipeOut is not None else {}),
    **({"DS_ImageCompare": DS_ImageCompare} if DS_ImageCompare is not None else {}),
    **({"DS_ImageCheckpoint": DS_ImageCheckpoint} if DS_ImageCheckpoint is not None else {}),
    **({"DS_ImagePreview": DS_ImagePreview} if DS_ImagePreview is not None else {}),
    **({"DS_AnySwitch": DS_AnySwitch} if DS_AnySwitch is not None else {}),
    **({"DS_Switch": DS_Switch} if DS_Switch is not None else {}),
    **({"DS_HardwareMonitor": DS_HardwareMonitor} if DS_HardwareMonitor is not None else {}),
    **({"DS_LoadImage": DS_LoadImage} if DS_LoadImage is not None else {}),
    **({"DS_LoadVideo": DS_LoadVideo} if DS_LoadVideo is not None else {}),
    **({"DS_Outpaint": DS_Outpaint} if DS_Outpaint is not None else {}),
    **({"DS_OutpaintStitch": DS_OutpaintStitch} if DS_OutpaintStitch is not None else {}),
    **({"DS_Prompt": DS_Prompt} if DS_Prompt is not None else {}),
    **({"DS_ShowText": DS_ShowText} if DS_ShowText is not None else {}),
    **({"DS_Resolution": DS_Resolution} if DS_Resolution is not None else {}),
    **({"DS_VideoTiming": DS_VideoTiming} if DS_VideoTiming is not None else {}),
    **({"DS_PromptCards": DS_PromptCards} if DS_PromptCards is not None else {}),
    **({"DS_GroupSwitch": DS_GroupSwitch} if DS_GroupSwitch is not None else {}),
    **({"DS_ControlPanel": DS_ControlPanel} if DS_ControlPanel is not None else {}),
    **({"DS_LoRaLoader": DS_LoRaLoader} if DS_LoRaLoader is not None else {}),
    **({"DS_SystemMonitor": DS_SystemMonitor} if DS_SystemMonitor is not None else {}),
    **({"DS_ImageLoader": DS_ImageLoader} if DS_ImageLoader is not None else {}),
    **({"DS_QuickSave": DS_QuickSave} if DS_QuickSave is not None else {}),
    **({"DS_LoadImagesFromFolder": DS_LoadImagesFromFolder} if DS_LoadImagesFromFolder is not None else {}),
    **({"DS_VersionCheck": DS_VersionCheck} if DS_VersionCheck is not None else {}),
    **({"DS_ThePurger": DS_ThePurger} if DS_ThePurger is not None else {}),
    **({"DS_VideoSave": DS_VideoSave} if DS_VideoSave is not None else {}),
    **({"DS_Seed": DS_Seed} if DS_Seed is not None else {}),
    **({"DS_Notes": DS_Notes} if DS_Notes is not None else {}),
    **({"DS_Gallery": DS_Gallery} if DS_Gallery is not None else {}),
    **({"DS_Interpolation": DS_Interpolation} if DS_Interpolation is not None else {}),
    **({"DS_Reroute": DS_Reroute} if DS_Reroute is not None else {}),
}

NODE_DISPLAY_NAME_MAPPINGS = {
    **({"DS_Label": "DS Label"} if DS_Label is not None else {}),
    **({"DS_RunTimer": "DS Run Timer"} if DS_RunTimer is not None else {}),
    **({"DS_PromptScanner": "DS Prompt Scanner"} if DS_PromptScanner is not None else {}),
    **({"DS_FuturisticHUD": "DS Futuristic HUD"} if DS_FuturisticHUD is not None else {}),
    **({"DS_ImageSaveAdvance": "DS Image Save Advance"} if DS_ImageSaveAdvance is not None else {}),
    **({"DS_PipeIn": "DS Pipe In (Universal)"} if DS_PipeIn is not None else {}),
    **({"DS_PipeOut": "DS Pipe Out (Universal)"} if DS_PipeOut is not None else {}),
    **({"DS_ImageCompare": "DS Image Compare"} if DS_ImageCompare is not None else {}),
    **({"DS_ImageCheckpoint": "DS Image Checkpoint"} if DS_ImageCheckpoint is not None else {}),
    **({"DS_ImagePreview": "DS Image Preview"} if DS_ImagePreview is not None else {}),
    **({"DS_AnySwitch": "DS Any Switch"} if DS_AnySwitch is not None else {}),
    **({"DS_Switch": "DS Switch"} if DS_Switch is not None else {}),
    **({"DS_HardwareMonitor": "DS Hardware Monitor"} if DS_HardwareMonitor is not None else {}),
    **({"DS_LoadImage": "DS Load Image"} if DS_LoadImage is not None else {}),
    **({"DS_LoadVideo": "DS Load Video"} if DS_LoadVideo is not None else {}),
    **({"DS_Outpaint": "DS Outpaint"} if DS_Outpaint is not None else {}),
    **({"DS_OutpaintStitch": "DS Outpaint Stitch"} if DS_OutpaintStitch is not None else {}),
    **({"DS_Prompt": "DS Prompt"} if DS_Prompt is not None else {}),
    **({"DS_ShowText": "DS Show Text"} if DS_ShowText is not None else {}),
    **({"DS_Resolution": "DS Resolution"} if DS_Resolution is not None else {}),
    **({"DS_VideoTiming": "DS Video Timing"} if DS_VideoTiming is not None else {}),
    **({"DS_PromptCards": "DS Prompt Cards"} if DS_PromptCards is not None else {}),
    **({"DS_GroupSwitch": "DS Group Switch"} if DS_GroupSwitch is not None else {}),
    **({"DS_ControlPanel": "DS Control Panel"} if DS_ControlPanel is not None else {}),
    **({"DS_LoRaLoader": "DS LoRa Loader"} if DS_LoRaLoader is not None else {}),
    **({"DS_SystemMonitor": "DS System Monitor"} if DS_SystemMonitor is not None else {}),
    **({"DS_ImageLoader": "DS Image Loader"} if DS_ImageLoader is not None else {}),
    **({"DS_QuickSave": "DS Quick Save"} if DS_QuickSave is not None else {}),
    **({"DS_LoadImagesFromFolder": "DS Load Images From Folder"} if DS_LoadImagesFromFolder is not None else {}),
    **({"DS_VersionCheck": "DS Version Check"} if DS_VersionCheck is not None else {}),
    **({"DS_ThePurger": "DS The Purger"} if DS_ThePurger is not None else {}),
    **({"DS_VideoSave": "DS Video Save"} if DS_VideoSave is not None else {}),
    **({"DS_Seed": "DS Seed"} if DS_Seed is not None else {}),
    **({"DS_Notes": "DS Notes"} if DS_Notes is not None else {}),
    **({"DS_Gallery": "DS Gallery"} if DS_Gallery is not None else {}),
    **({"DS_Interpolation": "DS Interpolation"} if DS_Interpolation is not None else {}),
    **({"DS_Reroute": "DS Reroute"} if DS_Reroute is not None else {}),
}

WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]