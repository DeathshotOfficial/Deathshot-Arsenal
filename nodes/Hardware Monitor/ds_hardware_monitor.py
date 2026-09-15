import os
import platform
import subprocess
import shutil
import threading
import time
import logging

import psutil
import server
from aiohttp import web

try:
    import torch
except Exception:
    torch = None

try:
    import pynvml
except Exception:
    pynvml = None

_LOG = logging.getLogger("DeathshotArsenal.HardwareMonitor")
if not _LOG.handlers:
    _LOG.setLevel(logging.INFO)

_LOCK = threading.Lock()
_CACHE = {
    "timestamp": 0,
    "cpu": 0,
    "ram": 0,
    "ram_used_gb": 0,
    "ram_total_gb": 0,
    "gpu": None,
    "gpu_name": None,
    "gpu_vendor": None,
    "gpu_temp": None,
    "gpu_power": None,
    "vram": None,
    "vram_used_gb": None,
    "vram_total_gb": None,
    "vram_free_gb": None,
    "peak_vram_gb": None,
    "gpu_available": False,
    "cpu_fan": None,
    "cpu_fan_supported": False,
    "gpu_fan": None,
    "gpu_fan_supported": False,
}


def _hidden_run(cmd, timeout=1.5):
    try:
        kwargs = {"stdout": subprocess.PIPE, "stderr": subprocess.DEVNULL, "timeout": timeout, "text": True}
        if platform.system() == "Windows":
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            kwargs["startupinfo"] = si
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        return subprocess.run(cmd, check=False, **kwargs).stdout.strip()
    except Exception as e:
        _LOG.debug("subprocess failed: %s", e)
        return ""


def _find_nvidia_smi():
    """Locate nvidia-smi without assuming a particular NVIDIA install path."""
    candidates = []
    found = shutil.which("nvidia-smi")
    if found:
        candidates.append(found)
    if os.name == "nt":
        where = _hidden_run(["where.exe", "nvidia-smi.exe"], timeout=1.0)
        if where:
            candidates.extend([line.strip() for line in where.splitlines() if line.strip()])
        for env_name in ("ProgramFiles", "ProgramFiles(x86)"):
            base = os.environ.get(env_name)
            if base:
                candidates.append(os.path.join(base, "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"))
        candidates.append(os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "nvidia-smi.exe"))
    for candidate in candidates:
        try:
            if os.path.isfile(candidate):
                return os.path.abspath(candidate)
        except Exception:
            pass
    return None


def _nvidia():
    """Prefer NVML, then nvidia-smi. Return live utilization, thermals and power."""
    if pynvml is not None:
        try:
            try:
                pynvml.nvmlInit()
            except Exception:
                pass
            count = int(pynvml.nvmlDeviceGetCount())
            if count > 0:
                preferred = 0
                if torch is not None:
                    try:
                        preferred = int(torch.cuda.current_device()) if torch.cuda.is_available() else 0
                    except Exception:
                        pass
                idx = max(0, min(preferred, count - 1))
                h = pynvml.nvmlDeviceGetHandleByIndex(idx)
                name = pynvml.nvmlDeviceGetName(h)
                if isinstance(name, bytes):
                    name = name.decode(errors="replace")
                mem = pynvml.nvmlDeviceGetMemoryInfo(h)
                util = pynvml.nvmlDeviceGetUtilizationRates(h)
                out = {
                    "gpu_available": True, "gpu_vendor": "NVIDIA", "gpu_name": str(name),
                    "gpu": float(getattr(util, "gpu", 0.0)),
                    "vram_used_gb": float(mem.used) / 2**30,
                    "vram_total_gb": float(mem.total) / 2**30,
                    "vram_free_gb": float(mem.free) / 2**30,
                }
                try:
                    out["gpu_temp"] = float(pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU))
                except Exception:
                    pass
                try:
                    out["gpu_power"] = float(pynvml.nvmlDeviceGetPowerUsage(h)) / 1000.0
                except Exception:
                    pass
                try:
                    if hasattr(pynvml, "nvmlDeviceGetFanSpeed"):
                        spd = pynvml.nvmlDeviceGetFanSpeed(h)
                        out["gpu_fan"] = int(spd)
                        out["gpu_fan_supported"] = True
                    elif hasattr(pynvml, "nvmlDeviceGetFanSpeed_v2"):
                        spd = pynvml.nvmlDeviceGetFanSpeed_v2(h, 0)
                        out["gpu_fan"] = int(spd)
                        out["gpu_fan_supported"] = True
                    else:
                        out["gpu_fan"] = None
                        out["gpu_fan_supported"] = False
                except Exception:
                    out["gpu_fan"] = None
                    out["gpu_fan_supported"] = False
                return out
        except Exception as e:
            _LOG.debug("NVML probe failed: %s", e)
    smi = _find_nvidia_smi()
    if smi:
        query = _hidden_run([
            smi,
            "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,memory.free,temperature.gpu,power.draw,fan.speed",
            "--format=csv,noheader,nounits"
        ], timeout=2.0)
        if query:
            rows = [line.strip() for line in query.splitlines() if line.strip()]
            preferred = 0
            if torch is not None:
                try:
                    preferred = int(torch.cuda.current_device()) if torch.cuda.is_available() else 0
                except Exception:
                    pass
            row = None
            for line in rows:
                parts = [x.strip() for x in line.split(",", 8)]
                try:
                    if int(float(parts[0])) == preferred:
                        row = parts
                        break
                except Exception:
                    continue
            if row is None and rows:
                row = [x.strip() for x in rows[0].split(",", 8)]
            if row and len(row) >= 6:
                try:
                    total = float(row[4]); used = float(row[3]); free = float(row[5])
                    result = {
                        "gpu_available": True, "gpu_vendor": "NVIDIA", "gpu_name": row[1],
                        "gpu": float(row[2]) if row[2] not in ("N/A", "[N/A]") else 0.0,
                        "vram_used_gb": used / 1024.0, "vram_total_gb": total / 1024.0, "vram_free_gb": free / 1024.0,
                        "gpu_fan": None, "gpu_fan_supported": False,
                    }
                    if len(row) >= 7 and row[6] not in ("N/A", "[N/A]"):
                        result["gpu_temp"] = float(row[6])
                    if len(row) >= 8 and row[7] not in ("N/A", "[N/A]"):
                        result["gpu_power"] = float(row[7])
                    if len(row) >= 9 and row[8] not in ("N/A", "[N/A]"):
                        try:
                            result["gpu_fan"] = float(row[8])
                            result["gpu_fan_supported"] = True
                        except Exception:
                            result["gpu_fan"] = None
                            result["gpu_fan_supported"] = False
                    return result
                except Exception:
                    pass
    return None


def _torch_gpu():
    if torch is None:
        return None
    try:
        if not torch.cuda.is_available():
            return None
        idx = torch.cuda.current_device()
        props = torch.cuda.get_device_properties(idx)
        total = float(props.total_memory)
        # ComfyUI may have already allocated/reserved VRAM. mem_get_info is a
        # better picture of real free device memory than allocator counters.
        try:
            free, total_mem = torch.cuda.mem_get_info(idx)
            used = max(0.0, float(total_mem) - float(free))
            total = float(total_mem)
            free_gb = float(free) / 2**30
        except Exception:
            reserved = float(torch.cuda.memory_reserved(idx))
            used = max(float(torch.cuda.memory_allocated(idx)), reserved)
            free_gb = max(0.0, (total - used) / 2**30)
        result = {"gpu_available": True, "gpu_vendor": "CUDA", "gpu_name": torch.cuda.get_device_name(idx),
                  "vram_used_gb": used/2**30, "vram_total_gb": total/2**30,
                  "vram_free_gb": free_gb, "gpu": None, "gpu_fan": None, "gpu_fan_supported": False}
        try:
            result["gpu"] = float(torch.cuda.utilization(idx))
        except Exception:
            pass
        return result
    except Exception:
        return None


def _generic_gpu():
    if platform.system() == "Windows":
        # PowerShell can be absent/restricted, so try both CIM and legacy WMI.
        for cmd in [
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }"],
            ["wmic", "path", "win32_VideoController", "get", "Name"],
        ]:
            out = _hidden_run(cmd, timeout=2.0)
            names = [x.strip() for x in out.splitlines() if x.strip() and x.strip().lower() != "name"]
            if names:
                return {"gpu_available": True, "gpu_vendor": "GPU", "gpu_name": names[0], "gpu": None, "gpu_fan": None, "gpu_fan_supported": False}
    return None


def _cpu_fan():
    try:
        if hasattr(psutil, "sensors_fans"):
            fans = psutil.sensors_fans()
            if fans and isinstance(fans, dict):
                for fan_list in fans.values():
                    for fan in fan_list:
                        spd = getattr(fan, "current", 0)
                        if spd and spd > 0:
                            return {"cpu_fan": int(spd), "cpu_fan_supported": True}
    except Exception:
        pass
    return {"cpu_fan": None, "cpu_fan_supported": False}


def collect():
    mem = psutil.virtual_memory()
    result = {
        "timestamp": time.time(),
        "cpu": float(psutil.cpu_percent(interval=None)),
        "ram": float(mem.percent),
        "ram_used_gb": mem.used / 2**30,
        "ram_total_gb": mem.total / 2**30,
    }
    result.update(_cpu_fan())
    gpu = _nvidia() or _torch_gpu() or _generic_gpu()
    if gpu:
        result.update(gpu)
    else:
        result.update({"gpu_available": False, "gpu_name": None, "gpu_vendor": None, "gpu": None, "gpu_fan": None, "gpu_fan_supported": False})
    with _LOCK:
        previous_peak = float(_CACHE.get("peak_vram_gb") or 0.0)
    result["peak_vram_gb"] = max(previous_peak, float(result.get("vram_used_gb") or 0.0))
    return result


class _MonitorThread(threading.Thread):
    daemon = True
    def run(self):
        while True:
            started = time.monotonic()
            try:
                data = collect()
                with _LOCK:
                    _CACHE.clear(); _CACHE.update(data)
                try:
                    server.PromptServer.instance.send_sync("ds_hardware_stats", data)
                except Exception:
                    pass
            except Exception:
                _LOG.exception("Telemetry collection failed")
            time.sleep(max(0.05, 1.0 - (time.monotonic() - started)))


_LOG.info("Starting hardware telemetry thread")
_monitor = _MonitorThread(name="DS-HardwareMonitor", daemon=True)
_monitor.start()


@server.PromptServer.instance.routes.get("/ds/hardware_monitor/stats")
async def hardware_stats(_request):
    with _LOCK:
        data = dict(_CACHE)
    return web.json_response(data)


@server.PromptServer.instance.routes.post("/ds/hardware_monitor/action")
async def hardware_action(request):
    try:
        body = await request.json()
        action = body.get("action")
        _LOG.info("Action request: %s", action)
    except Exception:
        _LOG.exception("Invalid hardware action request")
        return web.json_response({"ok": False, "error": "Invalid request"}, status=400)

    if action not in {"free_vram", "unload_models"}:
        _LOG.warning("Unknown action: %r", action)
        return web.json_response({"ok": False, "error": "Unknown action"}, status=400)

    try:
        import comfy.model_management as mm
        if action == "unload_models":
            mm.unload_all_models()
        mm.soft_empty_cache()
        _LOG.info("Action completed: %s", action)
        return web.json_response({"ok": True})
    except Exception as e:
        _LOG.exception("Action failed: %s", action)
        return web.json_response({"ok": False, "error": str(e)}, status=500)


class DS_HardwareMonitor:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}
    RETURN_TYPES = ()
    FUNCTION = "monitor"
    CATEGORY = "☠️ Deathshot Arsenal/🖥️ Monitoring"
    # Frontend-only: the node is a live UI and never needs execution.
    OUTPUT_NODE = False
    DESCRIPTION = "Compact real-time hardware monitor."

    def monitor(self):
        return ()
