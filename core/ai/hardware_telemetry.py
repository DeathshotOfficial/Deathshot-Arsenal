"""
Deathshot Arsenal — Centralized AI Core: Hardware Telemetry
Cross-platform GPU, VRAM, and RAM detection for auto-tuning GGUF models.
"""

import logging
import os
import sys

logger = logging.getLogger("DeathshotArsenal.Core.AI.Telemetry")


def get_hardware_info() -> dict:
    """Return GPU and system memory information for VRAM advisory warnings (Linux & Windows)."""
    # 1. Try importing existing Sensei telemetry if present
    try:
        from ...nodes.AIPromptSensei.telemetry import get_hardware_info as _sensei_hw
        return _sensei_hw()
    except Exception:
        pass

    try:
        # Relative or path fallback
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "nodes", "AI Prompt Sensei"))
        if base_dir not in sys.path:
            sys.path.insert(0, base_dir)
        import telemetry
        return telemetry.get_hardware_info()
    except Exception:
        pass

    # 2. Native PyTorch CUDA fallback
    info = {
        "gpu_name": "CPU Only",
        "total_vram_mb": 0,
        "available_vram_mb": 0,
        "system_ram_mb": 0,
        "has_gpu": False,
    }

    try:
        import torch
        if torch.cuda.is_available():
            dev = torch.cuda.current_device()
            info["gpu_name"] = torch.cuda.get_device_name(dev)
            info["has_gpu"] = True
            mem = torch.cuda.mem_get_info()
            info["available_vram_mb"] = int(mem[0] / (1024 * 1024))
            info["total_vram_mb"] = int(mem[1] / (1024 * 1024))
    except Exception as e:
        logger.debug(f"[Hardware Telemetry] Torch cuda query failed: {e}")

    try:
        import psutil
        vm = psutil.virtual_memory()
        info["system_ram_mb"] = int(vm.total / (1024 * 1024))
    except Exception:
        pass

    return info
