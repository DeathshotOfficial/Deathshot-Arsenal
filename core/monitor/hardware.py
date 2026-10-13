"""
Deathshot Arsenal - Hardware & Performance Monitor: Hardware Telemetry
Cross-platform (Linux & Windows) CPU, RAM, GPU, VRAM, thermal, and power detection.
"""

import os
import sys
import platform
import subprocess
import shutil
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("DeathshotArsenal.HPM.Hardware")

try:
    import psutil
except Exception:
    psutil = None

try:
    import torch
except Exception:
    torch = None

try:
    import pynvml
    pynvml.nvmlInit()
    _HAS_PYNVML = True
except Exception:
    _HAS_PYNVML = False


def get_cpu_model_name() -> str:
    """Returns human-readable CPU brand string on Linux, Windows, and macOS."""
    sys_name = platform.system()
    if sys_name == "Linux" and os.path.exists("/proc/cpuinfo"):
        try:
            with open("/proc/cpuinfo", "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if "model name" in line:
                        return line.split(":", 1)[1].strip()
        except Exception:
            pass

    if sys_name == "Windows":
        try:
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            out = subprocess.check_output(
                ["wmic", "cpu", "get", "name"],
                startupinfo=si,
                timeout=1.5,
                text=True,
                stderr=subprocess.DEVNULL
            ).strip().split("\n")
            if len(out) > 1 and out[1].strip():
                return out[1].strip()
        except Exception:
            pass
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
            val, _ = winreg.QueryValueEx(key, "ProcessorNameString")
            if val and str(val).strip():
                return str(val).strip()
        except Exception:
            pass

    if sys_name == "Darwin":
        try:
            return subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], timeout=1.5, text=True).strip()
        except Exception:
            pass

    return platform.processor() or "CPU"


def get_static_specs(gpu_index: int = 0) -> Dict[str, Any]:
    """Returns static hardware facts (sent once on connect, not every tick)."""
    cpu_model = get_cpu_model_name()
    p_cores = psutil.cpu_count(logical=False) if psutil else 1
    l_cores = psutil.cpu_count(logical=True) if psutil else 1

    total_ram_gb = 0.0
    if psutil:
        try:
            total_ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
        except Exception:
            pass

    gpu_info = {
        "gpu_available": False,
        "gpu_name": "No GPU",
        "gpu_count": 0,
        "vram_total_gb": 0.0,
        "driver_version": "N/A",
    }

    # NVML query for static specs
    if _HAS_PYNVML:
        try:
            count = pynvml.nvmlDeviceGetCount()
            if count > 0:
                idx = max(0, min(gpu_index, count - 1))
                h = pynvml.nvmlDeviceGetHandleByIndex(idx)
                raw_name = pynvml.nvmlDeviceGetName(h)
                name = raw_name.decode("utf-8") if isinstance(raw_name, bytes) else str(raw_name)
                mem = pynvml.nvmlDeviceGetMemoryInfo(h)
                drv = "N/A"
                try:
                    raw_drv = pynvml.nvmlSystemGetDriverVersion()
                    drv = raw_drv.decode("utf-8") if isinstance(raw_drv, bytes) else str(raw_drv)
                except Exception:
                    pass

                gpu_info["gpu_available"] = True
                gpu_info["gpu_name"] = name
                gpu_info["gpu_count"] = count
                gpu_info["vram_total_gb"] = round(mem.total / (1024 ** 3), 1)
                gpu_info["driver_version"] = drv
        except Exception as e:
            logger.debug(f"[Hardware Specs] NVML specs query error: {e}")

    # PyTorch fallback if NVML didn't succeed
    if not gpu_info["gpu_available"] and torch is not None:
        try:
            if torch.cuda.is_available():
                count = torch.cuda.device_count()
                idx = max(0, min(gpu_index, count - 1))
                props = torch.cuda.get_device_properties(idx)
                gpu_info["gpu_available"] = True
                gpu_info["gpu_name"] = torch.cuda.get_device_name(idx)
                gpu_info["gpu_count"] = count
                gpu_info["vram_total_gb"] = round(props.total_memory / (1024 ** 3), 1)
        except Exception as e:
            logger.debug(f"[Hardware Specs] Torch cuda specs error: {e}")

    # nvidia-smi fallback
    if not gpu_info["gpu_available"]:
        _smi_static_specs(gpu_info, gpu_index)

    return {
        "cpu_model": cpu_model,
        "cpu_physical_cores": p_cores or 1,
        "cpu_logical_cores": l_cores or 1,
        "ram_total_gb": total_ram_gb,
        **gpu_info
    }


def _smi_static_specs(gpu_info: Dict[str, Any], gpu_index: int = 0) -> None:
    smi = shutil.which("nvidia-smi")
    if not smi:
        if os.name == "nt":
            for env in ("ProgramFiles", "SystemRoot"):
                base = os.environ.get(env, "")
                if base:
                    cand = os.path.join(base, "System32", "nvidia-smi.exe")
                    if os.path.isfile(cand):
                        smi = cand
                        break
        else:
            for cand in ("/usr/bin/nvidia-smi", "/usr/local/cuda/bin/nvidia-smi"):
                if os.path.isfile(cand):
                    smi = cand
                    break
    if not smi:
        return
    try:
        kwargs: Dict[str, Any] = {
            "stdout": subprocess.PIPE,
            "stderr": subprocess.DEVNULL,
            "timeout": 1.5,
            "text": True
        }
        if platform.system() == "Windows":
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            kwargs["startupinfo"] = si
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        cmd = [
            smi,
            f"--id={gpu_index}",
            "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader,nounits"
        ]
        out = subprocess.run(cmd, check=False, **kwargs).stdout.strip()
        if out:
            parts = [p.strip() for p in out.split(",")]
            if len(parts) >= 2:
                gpu_info["gpu_available"] = True
                gpu_info["gpu_name"] = parts[0]
                gpu_info["gpu_count"] = 1
                try:
                    gpu_info["vram_total_gb"] = round(float(parts[1]) / 1024.0, 1)
                except Exception:
                    pass
            if len(parts) >= 3:
                gpu_info["driver_version"] = parts[2]
    except Exception:
        pass


def query_dynamic_telemetry(gpu_index: int = 0) -> Dict[str, Any]:
    """Collects live utilization, VRAM, clock, temp, and power readings."""
    res: Dict[str, Any] = {
        "cpu": 0.0,
        "ram": 0.0,
        "ram_used_gb": 0.0,
        "ram_free_gb": 0.0,
        "ram_total_gb": 0.0,
        "gpu_available": False,
        "gpu": None,
        "vram_used_gb": None,
        "vram_free_gb": None,
        "vram_total_gb": None,
        "gpu_temp": None,
        "gpu_power": None,
        "gpu_clock": None,
        "gpu_fan": None,
        "vram_headroom_pct": None,
    }

    if psutil:
        try:
            res["cpu"] = round(float(psutil.cpu_percent(interval=None)), 1)
            vm = psutil.virtual_memory()
            res["ram"] = round(float(vm.percent), 1)
            res["ram_used_gb"] = round(vm.used / (1024 ** 3), 1)
            res["ram_free_gb"] = round(vm.available / (1024 ** 3), 1)
            res["ram_total_gb"] = round(vm.total / (1024 ** 3), 1)
        except Exception as e:
            logger.debug(f"[Hardware Telemetry] psutil query error: {e}")

    # 1. Preferred: pynvml
    nvml_ok = False
    if _HAS_PYNVML:
        try:
            count = pynvml.nvmlDeviceGetCount()
            if count > 0:
                idx = max(0, min(gpu_index, count - 1))
                h = pynvml.nvmlDeviceGetHandleByIndex(idx)
                util = pynvml.nvmlDeviceGetUtilizationRates(h)
                mem = pynvml.nvmlDeviceGetMemoryInfo(h)

                res["gpu_available"] = True
                res["gpu"] = round(float(util.gpu), 1)
                used_gb = mem.used / (1024 ** 3)
                total_gb = mem.total / (1024 ** 3)
                free_gb = mem.free / (1024 ** 3)
                res["vram_used_gb"] = round(used_gb, 1)
                res["vram_total_gb"] = round(total_gb, 1)
                res["vram_free_gb"] = round(free_gb, 1)
                if total_gb > 0:
                    res["vram_pct"] = round((used_gb / total_gb) * 100, 1)
                    res["vram_headroom_pct"] = max(0.0, round((free_gb / total_gb) * 100, 1))

                try:
                    res["gpu_temp"] = int(pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU))
                except Exception:
                    pass

                try:
                    res["gpu_power"] = int(round(pynvml.nvmlDeviceGetPowerUsage(h) / 1000.0))
                except Exception:
                    pass

                try:
                    res["gpu_clock"] = int(pynvml.nvmlDeviceGetClockInfo(h, pynvml.NVML_CLOCK_GRAPHICS))
                except Exception:
                    pass

                try:
                    if hasattr(pynvml, "nvmlDeviceGetFanSpeed"):
                        res["gpu_fan"] = int(pynvml.nvmlDeviceGetFanSpeed(h))
                except Exception:
                    pass

                nvml_ok = True
        except Exception as e:
            logger.debug(f"[Hardware Telemetry] NVML dynamic query error: {e}")

    # 2. PyTorch CUDA fallback
    if not nvml_ok and torch is not None:
        try:
            if torch.cuda.is_available():
                idx = max(0, min(gpu_index, torch.cuda.device_count() - 1))
                free_b, total_b = torch.cuda.mem_get_info(idx)
                used_b = max(0, total_b - free_b)
                used_gb = used_b / (1024 ** 3)
                total_gb = total_b / (1024 ** 3)
                free_gb = free_b / (1024 ** 3)

                res["gpu_available"] = True
                res["vram_used_gb"] = round(used_gb, 1)
                res["vram_total_gb"] = round(total_gb, 1)
                res["vram_free_gb"] = round(free_gb, 1)
                if total_gb > 0:
                    res["vram_pct"] = round((used_gb / total_gb) * 100, 1)
                    res["vram_headroom_pct"] = max(0.0, round((free_gb / total_gb) * 100, 1))

                try:
                    res["gpu"] = round(float(torch.cuda.utilization(idx)), 1)
                except Exception:
                    res["gpu"] = None
        except Exception as e:
            logger.debug(f"[Hardware Telemetry] Torch cuda dynamic query error: {e}")

    # 3. Fallback to nvidia-smi if utilization is still missing and pynvml wasn't used
    if not nvml_ok and (res["gpu"] is None or res["gpu_temp"] is None):
        _smi_query(res, gpu_index)

    return res


def _smi_query(res: Dict[str, Any], gpu_index: int = 0) -> None:
    """Optional nvidia-smi subprocess fallback for Linux and Windows."""
    smi = shutil.which("nvidia-smi")
    if not smi:
        if os.name == "nt":
            for env in ("ProgramFiles", "SystemRoot"):
                base = os.environ.get(env, "")
                if base:
                    cand = os.path.join(base, "System32", "nvidia-smi.exe")
                    if os.path.isfile(cand):
                        smi = cand
                        break
        else:
            for cand in ("/usr/bin/nvidia-smi", "/usr/local/cuda/bin/nvidia-smi"):
                if os.path.isfile(cand):
                    smi = cand
                    break

    if not smi:
        return

    try:
        kwargs: Dict[str, Any] = {
            "stdout": subprocess.PIPE,
            "stderr": subprocess.DEVNULL,
            "timeout": 1.5,
            "text": True
        }
        if platform.system() == "Windows":
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            kwargs["startupinfo"] = si
            kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)

        cmd = [
            smi,
            f"--id={gpu_index}",
            "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.current.graphics",
            "--format=csv,noheader,nounits"
        ]
        out = subprocess.run(cmd, check=False, **kwargs).stdout.strip()
        if out:
            parts = [p.strip() for p in out.split(",")]
            if len(parts) >= 3:
                res["gpu_available"] = True
                if res["gpu"] is None and parts[0] not in ("N/A", "[N/A]"):
                    res["gpu"] = round(float(parts[0]), 1)
                if res["vram_used_gb"] is None and parts[1] not in ("N/A", "[N/A]"):
                    res["vram_used_gb"] = round(float(parts[1]) / 1024.0, 1)
                if res["vram_total_gb"] is None and parts[2] not in ("N/A", "[N/A]"):
                    res["vram_total_gb"] = round(float(parts[2]) / 1024.0, 1)
            if len(parts) >= 4 and res["gpu_temp"] is None and parts[3] not in ("N/A", "[N/A]"):
                res["gpu_temp"] = int(float(parts[3]))
            if len(parts) >= 5 and res["gpu_power"] is None and parts[4] not in ("N/A", "[N/A]"):
                res["gpu_power"] = int(float(parts[4]))
            if len(parts) >= 6 and res["gpu_clock"] is None and parts[5] not in ("N/A", "[N/A]"):
                res["gpu_clock"] = int(float(parts[5]))
    except Exception:
        pass
