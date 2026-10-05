"""
Deathshot Arsenal — DS AI Prompt Sensei
Cross-Platform Hardware & Telemetry Engine (Linux & Windows)

Monitors CPU, RAM, GPU, and VRAM with zero external dependency requirements,
supporting NVIDIA (NVML ctypes, pynvml, nvidia-smi), AMD (ROCm, sysfs, rocm-smi),
Intel (XPU, xpu-smi), and Apple Silicon (MPS).
"""

import os
import sys
import time
import shutil
import ctypes
import logging
import threading
import subprocess

logger = logging.getLogger("DeathshotArsenal.AIPromptSensei.Telemetry")

# ---------------------------------------------------------------------------
# Cross-Platform Subprocess Helper
# ---------------------------------------------------------------------------

def run_hidden_cmd(cmd, timeout=1.5):
    """Run command hidden without creating console windows on Windows or blocking on Linux."""
    try:
        kwargs = {
            "stdout": subprocess.PIPE,
            "stderr": subprocess.DEVNULL,
            "timeout": timeout,
            "text": True,
            "check": False,
        }
        if sys.platform == "win32" or os.name == "nt":
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            kwargs["startupinfo"] = si
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            if creationflags:
                kwargs["creationflags"] = creationflags
        return subprocess.run(cmd, **kwargs).stdout.strip()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Cross-Platform CPU Monitor (psutil + Linux /proc/stat + Windows GetSystemTimes)
# ---------------------------------------------------------------------------

class _CpuMonitor:
    def __init__(self):
        self._lock = threading.Lock()
        self._last_time = time.monotonic()
        self._last_proc_stat = None
        self._last_win_times = None
        self._psutil_ok = False
        try:
            import psutil
            psutil.cpu_percent(interval=None)
            self._psutil_ok = True
        except Exception:
            self._psutil_ok = False

    def get_cpu_percent(self) -> float:
        with self._lock:
            # 1. Try psutil first if present
            if self._psutil_ok:
                try:
                    import psutil
                    pct = float(psutil.cpu_percent(interval=None))
                    if pct > 0.0:
                        return round(pct, 1)
                except Exception:
                    pass

            # 2. Linux Fallback: /proc/stat delta (100% native kernel, zero external dependencies)
            if sys.platform.startswith("linux") and os.path.exists("/proc/stat"):
                try:
                    with open("/proc/stat", "r", encoding="utf-8", errors="ignore") as f:
                        line = f.readline()
                    fields = [float(x) for x in line.strip().split()[1:]]
                    idle = fields[3] + (fields[4] if len(fields) > 4 else 0.0)
                    total = sum(fields)
                    now = time.monotonic()
                    if self._last_proc_stat is not None:
                        last_idle, last_total, last_t = self._last_proc_stat
                        delta_total = total - last_total
                        delta_idle = idle - last_idle
                        if delta_total > 0:
                            pct = max(0.0, min(100.0, (1.0 - (delta_idle / delta_total)) * 100.0))
                            self._last_proc_stat = (idle, total, now)
                            return round(pct, 1)
                    self._last_proc_stat = (idle, total, now)
                except Exception:
                    pass

            # 3. Windows Fallback: GetSystemTimes via kernel32
            if sys.platform == "win32":
                try:
                    class FILETIME(ctypes.Structure):
                        _fields_ = [("dwLowDateTime", ctypes.c_ulong), ("dwHighDateTime", ctypes.c_ulong)]

                    idle_time = FILETIME()
                    kernel_time = FILETIME()
                    user_time = FILETIME()
                    if ctypes.windll.kernel32.GetSystemTimes(
                        ctypes.byref(idle_time),
                        ctypes.byref(kernel_time),
                        ctypes.byref(user_time)
                    ):
                        def to_int(ft):
                            return (ft.dwHighDateTime << 32) | ft.dwLowDateTime

                        idle_v = to_int(idle_time)
                        kernel_v = to_int(kernel_time)
                        user_v = to_int(user_time)
                        total_v = kernel_v + user_v
                        now = time.monotonic()
                        if self._last_win_times is not None:
                            last_idle, last_total, last_t = self._last_win_times
                            delta_total = total_v - last_total
                            delta_idle = idle_v - last_idle
                            if delta_total > 0:
                                pct = max(0.0, min(100.0, (1.0 - (delta_idle / delta_total)) * 100.0))
                                self._last_win_times = (idle_v, total_v, now)
                                return round(pct, 1)
                        self._last_win_times = (idle_v, total_v, now)
                except Exception:
                    pass

            return 0.0


_CPU_MONITOR = _CpuMonitor()


# ---------------------------------------------------------------------------
# Cross-Platform System RAM Monitor
# ---------------------------------------------------------------------------

def get_system_ram():
    """Return (percent: float, used_gb: float, total_gb: float, free_gb: float)."""
    # 1. Try psutil
    try:
        import psutil
        vm = psutil.virtual_memory()
        used_gb = round(vm.used / (1024 ** 3), 1)
        total_gb = round(vm.total / (1024 ** 3), 1)
        free_gb = round(vm.available / (1024 ** 3), 1)
        return float(vm.percent), used_gb, total_gb, free_gb
    except Exception:
        pass

    # 2. Linux Fallback: /proc/meminfo
    if sys.platform.startswith("linux") and os.path.exists("/proc/meminfo"):
        try:
            mem = {}
            with open("/proc/meminfo", "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    parts = line.split(":")
                    if len(parts) == 2:
                        mem[parts[0].strip()] = int(parts[1].strip().split()[0])
            total_b = mem.get("MemTotal", 0) * 1024
            avail_b = mem.get("MemAvailable", mem.get("MemFree", 0)) * 1024
            used_b = max(0, total_b - avail_b)
            if total_b > 0:
                pct = round((used_b / total_b) * 100.0, 1)
                used_gb = round(used_b / (1024 ** 3), 1)
                total_gb = round(total_b / (1024 ** 3), 1)
                free_gb = round(avail_b / (1024 ** 3), 1)
                return pct, used_gb, total_gb, free_gb
        except Exception:
            pass

    # 3. Windows Fallback: GlobalMemoryStatusEx via kernel32
    if sys.platform == "win32":
        try:
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                total_b = stat.ullTotalPhys
                avail_b = stat.ullAvailPhys
                used_b = max(0, total_b - avail_b)
                if total_b > 0:
                    pct = float(stat.dwMemoryLoad)
                    used_gb = round(used_b / (1024 ** 3), 1)
                    total_gb = round(total_b / (1024 ** 3), 1)
                    free_gb = round(avail_b / (1024 ** 3), 1)
                    return pct, used_gb, total_gb, free_gb
        except Exception:
            pass

    return 0.0, 0.0, 0.0, 0.0


# ---------------------------------------------------------------------------
# Cross-Platform NVML Engine (Direct ctypes loader, works without pip package)
# ---------------------------------------------------------------------------

class _NVMLDirect:
    def __init__(self):
        self._lib = None
        self._initialized = False
        self._handle = None
        self._device_index = 0
        self._init_lock = threading.Lock()
        self._load()

    def _load(self):
        with self._init_lock:
            if self._initialized:
                return
            candidates = []
            if sys.platform == "win32":
                candidates = [
                    "nvml.dll",
                    os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "nvml.dll"),
                    os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "NVIDIA Corporation", "NVSMI", "nvml.dll"),
                    os.path.join(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"), "NVIDIA Corporation", "NVSMI", "nvml.dll"),
                ]
            else:
                candidates = [
                    "libnvidia-ml.so.1",
                    "libnvidia-ml.so",
                    "/usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1",
                    "/usr/lib64/libnvidia-ml.so.1",
                    "/usr/local/cuda/lib64/libnvidia-ml.so",
                    "/usr/lib/wsl/lib/libnvidia-ml.so.1",
                    "/opt/cuda/lib64/libnvidia-ml.so",
                ]

            for c in candidates:
                try:
                    self._lib = ctypes.CDLL(c)
                    break
                except Exception:
                    continue

            if not self._lib:
                return

            try:
                init_fn = getattr(self._lib, "nvmlInit_v2", getattr(self._lib, "nvmlInit", None))
                if init_fn and init_fn() == 0:
                    self._initialized = True
                    self._bind_device(0)
            except Exception as e:
                logger.debug(f"[Telemetry] Direct NVML init failed: {e}")
                self._initialized = False

    def _bind_device(self, idx=0):
        if not self._initialized or not self._lib:
            return
        try:
            h = ctypes.c_void_p()
            get_h = getattr(self._lib, "nvmlDeviceGetHandleByIndex_v2", getattr(self._lib, "nvmlDeviceGetHandleByIndex", None))
            if get_h and get_h(idx, ctypes.byref(h)) == 0:
                self._handle = h
                self._device_index = idx
        except Exception:
            pass

    def query(self, preferred_device=0):
        if not self._initialized or not self._lib:
            return None

        if self._handle is None or self._device_index != preferred_device:
            self._bind_device(preferred_device)

        if not self._handle:
            return None

        stats = {
            "gpu_available": True,
            "gpu_vendor": "NVIDIA",
        }

        # 1. Device Name
        try:
            name_buf = ctypes.create_string_buffer(96)
            if self._lib.nvmlDeviceGetName(self._handle, name_buf, 96) == 0:
                stats["gpu_name"] = name_buf.value.decode("utf-8", errors="replace")
        except Exception:
            pass

        # 2. GPU Utilization Rates (Real compute load %)
        try:
            class _nvmlUtilization_t(ctypes.Structure):
                _fields_ = [("gpu", ctypes.c_uint), ("memory", ctypes.c_uint)]

            util = _nvmlUtilization_t()
            if self._lib.nvmlDeviceGetUtilizationRates(self._handle, ctypes.byref(util)) == 0:
                stats["gpu"] = float(util.gpu)
        except Exception:
            pass

        # 3. GPU Temperature (°C)
        try:
            temp = ctypes.c_uint()
            # 0 is NVML_TEMPERATURE_GPU
            if self._lib.nvmlDeviceGetTemperature(self._handle, 0, ctypes.byref(temp)) == 0:
                stats["gpu_temp"] = float(temp.value)
        except Exception:
            pass

        # 4. Memory Info
        try:
            class _nvmlMemory_t(ctypes.Structure):
                _fields_ = [
                    ("total", ctypes.c_ulonglong),
                    ("free", ctypes.c_ulonglong),
                    ("used", ctypes.c_ulonglong),
                ]

            mem = _nvmlMemory_t()
            get_mem = getattr(self._lib, "nvmlDeviceGetMemoryInfo_v2", getattr(self._lib, "nvmlDeviceGetMemoryInfo", None))
            if get_mem:
                get_mem.argtypes = [ctypes.c_void_p, ctypes.POINTER(_nvmlMemory_t)]
                get_mem.restype = ctypes.c_int
                if get_mem(self._handle, ctypes.byref(mem)) == 0:
                    stats["vram_total_gb"] = round(float(mem.total) / (1024 ** 3), 1)
                    stats["vram_used_gb"] = round(float(mem.used) / (1024 ** 3), 1)
                    stats["vram_free_gb"] = round(float(mem.free) / (1024 ** 3), 1)
        except Exception:
            pass

        return stats


_NVML = _NVMLDirect()


# ---------------------------------------------------------------------------
# Cross-Platform nvidia-smi CLI Finder & Runner
# ---------------------------------------------------------------------------

def find_nvidia_smi():
    """Locate nvidia-smi executable on both Linux and Windows."""
    found = shutil.which("nvidia-smi")
    if found:
        return found

    candidates = []
    if sys.platform == "win32" or os.name == "nt":
        where = run_hidden_cmd(["where.exe", "nvidia-smi.exe"])
        if where:
            candidates.extend([line.strip() for line in where.splitlines() if line.strip()])
        for env_name in ("ProgramFiles", "ProgramFiles(x86)"):
            base = os.environ.get(env_name)
            if base:
                candidates.append(os.path.join(base, "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"))
        candidates.append(os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32", "nvidia-smi.exe"))
    else:
        candidates.extend([
            "/usr/bin/nvidia-smi",
            "/usr/local/cuda/bin/nvidia-smi",
            "/usr/lib/wsl/lib/nvidia-smi",
            "/opt/cuda/bin/nvidia-smi",
        ])

    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)
    return None


def query_nvidia_smi(preferred_device=0):
    """Query nvidia-smi CLI for utilization, temp, and memory."""
    smi = find_nvidia_smi()
    if not smi:
        return None
    out = run_hidden_cmd([
        smi,
        "--query-gpu=index,name,utilization.gpu,temperature.gpu,memory.total,memory.used,memory.free",
        "--format=csv,noheader,nounits"
    ], timeout=2.0)
    if not out:
        return None

    rows = [r.strip() for r in out.splitlines() if r.strip()]
    if not rows:
        return None

    target_row = None
    for r in rows:
        parts = [p.strip() for p in r.split(",")]
        try:
            if int(float(parts[0])) == preferred_device:
                target_row = parts
                break
        except Exception:
            continue
    if target_row is None:
        target_row = [p.strip() for p in rows[0].split(",")]

    if len(target_row) >= 4:
        res = {
            "gpu_available": True,
            "gpu_vendor": "NVIDIA",
            "gpu_name": target_row[1] if len(target_row) > 1 else "NVIDIA GPU",
        }
        # Utilization
        val_u = target_row[2] if len(target_row) > 2 else ""
        if val_u and val_u not in ("N/A", "[N/A]"):
            try:
                res["gpu"] = float(val_u)
            except Exception:
                pass
        # Temp
        val_t = target_row[3] if len(target_row) > 3 else ""
        if val_t and val_t not in ("N/A", "[N/A]"):
            try:
                res["gpu_temp"] = float(val_t)
            except Exception:
                pass
        # Memory
        if len(target_row) >= 7:
            try:
                tot = float(target_row[4])
                used = float(target_row[5])
                free = float(target_row[6])
                res["vram_total_gb"] = round(tot / 1024.0, 1)
                res["vram_used_gb"] = round(used / 1024.0, 1)
                res["vram_free_gb"] = round(free / 1024.0, 1)
            except Exception:
                pass
        return res
    return None


# ---------------------------------------------------------------------------
# Linux AMD ROCm & Sysfs Support
# ---------------------------------------------------------------------------

def query_amd_linux():
    """Detect and monitor AMD GPUs via Linux sysfs and rocm-smi."""
    if not sys.platform.startswith("linux"):
        return None

    drm_dir = "/sys/class/drm"
    if not os.path.isdir(drm_dir):
        return None

    # Search for AMD card
    for item in sorted(os.listdir(drm_dir)):
        if item.startswith("card") and "-" not in item:
            dev_path = os.path.join(drm_dir, item, "device")
            busy_path = os.path.join(dev_path, "gpu_busy_percent")
            if os.path.isfile(busy_path):
                stats = {
                    "gpu_available": True,
                    "gpu_vendor": "AMD",
                    "gpu_name": "AMD Radeon GPU",
                }
                # 1. GPU Utilization %
                try:
                    with open(busy_path, "r", encoding="utf-8") as f:
                        stats["gpu"] = float(f.read().strip())
                except Exception:
                    pass

                # 2. VRAM
                try:
                    used_p = os.path.join(dev_path, "mem_info_vram_used")
                    total_p = os.path.join(dev_path, "mem_info_vram_total")
                    if os.path.isfile(used_p) and os.path.isfile(total_p):
                        with open(used_p, "r") as fu, open(total_p, "r") as ft:
                            used_b = float(fu.read().strip())
                            total_b = float(ft.read().strip())
                            stats["vram_used_gb"] = round(used_b / (1024 ** 3), 1)
                            stats["vram_total_gb"] = round(total_b / (1024 ** 3), 1)
                            stats["vram_free_gb"] = round(max(0.0, total_b - used_b) / (1024 ** 3), 1)
                except Exception:
                    pass

                # 3. Temperature via hwmon
                try:
                    hwmon_root = os.path.join(dev_path, "hwmon")
                    if os.path.isdir(hwmon_root):
                        for hw in os.listdir(hwmon_root):
                            temp_file = os.path.join(hwmon_root, hw, "temp1_input")
                            if os.path.isfile(temp_file):
                                with open(temp_file, "r") as f:
                                    stats["gpu_temp"] = round(float(f.read().strip()) / 1000.0, 1)
                                break
                except Exception:
                    pass

                return stats
    return None


# ---------------------------------------------------------------------------
# Cross-Platform Unified Hardware Stats Collector
# ---------------------------------------------------------------------------

def get_realtime_hw_stats():
    """
    Collect comprehensive CPU, RAM, GPU, and VRAM telemetry.
    Works natively across Linux, Windows, NVIDIA, AMD, Intel, and Apple.
    """
    # 1. CPU & System RAM
    cpu_pct = _CPU_MONITOR.get_cpu_percent()
    ram_pct, ram_used_gb, ram_total_gb, ram_free_gb = get_system_ram()

    stats = {
        "cpu": cpu_pct,
        "ram": ram_pct,
        "ram_used_gb": ram_used_gb,
        "ram_total_gb": ram_total_gb,
        "gpu": 0.0,
        "gpu_temp": None,
        "gpu_available": False,
        "gpu_name": None,
        "vram_used_gb": 0.0,
        "vram_total_gb": 0.0,
        "vram_free_gb": 0.0,
    }

    preferred_device = 0
    torch_available = False

    # 2. PyTorch CUDA / ROCm diagnostics
    try:
        import torch
        if torch.cuda.is_available():
            torch_available = True
            preferred_device = torch.cuda.current_device()
            free_b, total_b = torch.cuda.mem_get_info(preferred_device)
            used_b = max(0, total_b - free_b)
            stats["gpu_available"] = True
            stats["gpu_name"] = torch.cuda.get_device_name(preferred_device)
            stats["vram_total_gb"] = round(total_b / (1024 ** 3), 1)
            stats["vram_used_gb"] = round(used_b / (1024 ** 3), 1)
            stats["vram_free_gb"] = round(free_b / (1024 ** 3), 1)
            try:
                if hasattr(torch.cuda, "utilization"):
                    stats["gpu"] = float(torch.cuda.utilization(preferred_device))
            except Exception:
                pass
    except Exception:
        pass

    # 3. Direct NVML query via ctypes (instantaneous, zero overhead, works on Linux & Windows)
    nvml_data = _NVML.query(preferred_device=preferred_device)
    if nvml_data:
        stats["gpu_available"] = True
        if nvml_data.get("gpu_name"):
            stats["gpu_name"] = nvml_data["gpu_name"]
        if "gpu" in nvml_data:
            stats["gpu"] = nvml_data["gpu"]
        if "gpu_temp" in nvml_data:
            stats["gpu_temp"] = nvml_data["gpu_temp"]
        if "vram_total_gb" in nvml_data and stats["vram_total_gb"] == 0.0:
            stats["vram_total_gb"] = nvml_data["vram_total_gb"]
            stats["vram_used_gb"] = nvml_data["vram_used_gb"]
            stats["vram_free_gb"] = nvml_data["vram_free_gb"]

    # 4. Fallback to pynvml if direct ctypes was inactive
    if not nvml_data:
        try:
            import pynvml
            pynvml.nvmlInit()
            h = pynvml.nvmlDeviceGetHandleByIndex(preferred_device)
            stats["gpu_available"] = True
            try:
                stats["gpu_temp"] = float(pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU))
            except Exception:
                pass
            try:
                rates = pynvml.nvmlDeviceGetUtilizationRates(h)
                if rates:
                    stats["gpu"] = float(rates.gpu)
            except Exception:
                pass
            try:
                mem = pynvml.nvmlDeviceGetMemoryInfo(h)
                if stats["vram_total_gb"] == 0.0:
                    stats["vram_total_gb"] = round(float(mem.total) / (1024 ** 3), 1)
                    stats["vram_used_gb"] = round(float(mem.used) / (1024 ** 3), 1)
                    stats["vram_free_gb"] = round(float(mem.free) / (1024 ** 3), 1)
            except Exception:
                pass
        except Exception:
            pass

    # 5. Fallback to nvidia-smi CLI (only if NVML was unavailable and temp is missing)
    if stats["gpu_available"] and not nvml_data and stats["gpu_temp"] is None:
        smi_data = query_nvidia_smi(preferred_device=preferred_device)
        if smi_data:
            if "gpu" in smi_data:
                stats["gpu"] = smi_data["gpu"]
            if "gpu_temp" in smi_data:
                stats["gpu_temp"] = smi_data["gpu_temp"]
            if stats["vram_total_gb"] == 0.0 and "vram_total_gb" in smi_data:
                stats["vram_total_gb"] = smi_data["vram_total_gb"]
                stats["vram_used_gb"] = smi_data["vram_used_gb"]
                stats["vram_free_gb"] = smi_data["vram_free_gb"]

    # 6. Fallback to AMD Linux sysfs (for AMD ROCm users)
    if not stats["gpu_available"] or (stats["gpu"] == 0.0 and stats["gpu_temp"] is None):
        amd_data = query_amd_linux()
        if amd_data:
            stats["gpu_available"] = True
            stats["gpu_name"] = amd_data.get("gpu_name", "AMD Radeon GPU")
            if "gpu" in amd_data:
                stats["gpu"] = amd_data["gpu"]
            if "gpu_temp" in amd_data:
                stats["gpu_temp"] = amd_data["gpu_temp"]
            if stats["vram_total_gb"] == 0.0 and "vram_total_gb" in amd_data:
                stats["vram_total_gb"] = amd_data["vram_total_gb"]
                stats["vram_used_gb"] = amd_data["vram_used_gb"]
                stats["vram_free_gb"] = amd_data["vram_free_gb"]

    # 7. Fallback to Intel XPU
    if not stats["gpu_available"]:
        try:
            import torch
            if hasattr(torch, "xpu") and torch.xpu.is_available():
                idx = torch.xpu.current_device()
                stats["gpu_available"] = True
                stats["gpu_name"] = torch.xpu.get_device_name(idx)
                free_b, total_b = torch.xpu.mem_get_info(idx)
                stats["vram_total_gb"] = round(total_b / (1024 ** 3), 1)
                stats["vram_used_gb"] = round((total_b - free_b) / (1024 ** 3), 1)
                stats["vram_free_gb"] = round(free_b / (1024 ** 3), 1)
        except Exception:
            pass

    # 8. Fallback to Apple Silicon MPS
    if not stats["gpu_available"]:
        try:
            import torch
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                stats["gpu_available"] = True
                stats["gpu_name"] = "Apple Silicon GPU"
        except Exception:
            pass

    return stats


# ---------------------------------------------------------------------------
# Hardware Info for Node Initialization / Warnings
# ---------------------------------------------------------------------------

def get_hardware_info():
    """Return GPU and system memory information for VRAM advisory warnings."""
    st = get_realtime_hw_stats()
    return {
        "gpu_name": st.get("gpu_name") or "Unknown",
        "total_vram_mb": int(st.get("vram_total_gb", 0) * 1024),
        "available_vram_mb": int(st.get("vram_free_gb", 0) * 1024),
        "system_ram_mb": int(st.get("ram_total_gb", 0) * 1024),
        "has_gpu": bool(st.get("gpu_available", False)),
    }


# ---------------------------------------------------------------------------
# Cross-Platform Hardware Action (Free VRAM & Unload Models)
# ---------------------------------------------------------------------------

def perform_hardware_action(action: str) -> bool:
    """
    Execute hardware memory actions with deep cross-platform cache purges.
    Supports Linux malloc_trim and Windows EmptyWorkingSet.
    """
    import gc

    if action == "unload_models":
        # 1. ComfyUI models
        try:
            import comfy.model_management as mm
            mm.unload_all_models()
        except Exception:
            pass

        # 2. LM Studio
        try:
            try:
                from .llm_engine import kill_active_generation, unload_llm_memory
            except Exception:
                from llm_engine import kill_active_generation, unload_llm_memory
            kill_active_generation()
            unload_llm_memory()
        except Exception:
            pass

        # 3. Built-In LLM
        try:
            try:
                from .builtin_llm import unload as unload_builtin
            except Exception:
                from builtin_llm import unload as unload_builtin
            unload_builtin()
        except Exception:
            pass

    # Free VRAM PyTorch cache
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
            try:
                torch.cuda.synchronize()
            except Exception:
                pass
    except Exception:
        pass

    # ComfyUI soft empty cache
    try:
        import comfy.model_management as mm
        mm.soft_empty_cache()
    except Exception:
        pass

    # Double pass GC
    gc.collect()
    gc.collect()

    # OS-Specific Physical Memory Trim:
    # On Linux: glibc malloc_trim releases free arenas back to the OS
    if sys.platform.startswith("linux"):
        try:
            libc = ctypes.CDLL("libc.so.6")
            if hasattr(libc, "malloc_trim"):
                libc.malloc_trim(0)
        except Exception:
            pass

    # On Windows: EmptyWorkingSet trims memory-mapped physical pages
    if sys.platform == "win32":
        try:
            k32 = ctypes.windll.kernel32
            psapi = ctypes.windll.psapi
            psapi.EmptyWorkingSet(k32.GetCurrentProcess())
        except Exception:
            pass

    return True
