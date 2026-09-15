import os
import sys
import shutil
import urllib.request
import logging
import threading
from typing import Dict, List, Optional, Callable, Any

logger = logging.getLogger("DeathshotArsenal.Interpolation")

# ------------------------------------------------------------------
# Supported RIFE Models & Architecture Mapping
# ------------------------------------------------------------------
SUPPORTED_MODELS: Dict[str, str] = {
    "rife49.pth": "4.7",
    "rife47.pth": "4.7",
    "rife417.pth": "4.17",
    "rife426.pth": "4.26",
    "sudo_rife4_269.662_testV1_scale1.pth": "4.0",
}

DEFAULT_MODEL = "rife49.pth"

MODEL_NAMES = [
    "sudo_rife4_269.662_testV1_scale1.pth",
    "rife47.pth",
    "rife49.pth",
    "rife417.pth",
    "rife426.pth",
]

# ------------------------------------------------------------------
# Centralized Model Download URLs & Mirrors
# ------------------------------------------------------------------
MODEL_URLS: Dict[str, List[str]] = {
    "sudo_rife4_269.662_testV1_scale1.pth": [
        "https://huggingface.co/marduk191/rife/resolve/main/sudo_rife4_269.662_testV1_scale1.pth",
        "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/sudo_rife4_269.662_testV1_scale1.pth",
        "https://github.com/styler00dollar/VSGAN-tensorrt-docker/releases/download/models/sudo_rife4_269.662_testV1_scale1.pth",
    ],
    "rife47.pth": [
        "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/rife47.pth",
        "https://huggingface.co/marduk191/rife/resolve/main/rife47.pth",
        "https://github.com/styler00dollar/VSGAN-tensorrt-docker/releases/download/models/rife47.pth",
    ],
    "rife49.pth": [
        "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/rife49.pth",
        "https://huggingface.co/marduk191/rife/resolve/main/rife49.pth",
        "https://github.com/styler00dollar/VSGAN-tensorrt-docker/releases/download/models/rife49.pth",
    ],
    "rife417.pth": [
        "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/rife417.pth",
        "https://huggingface.co/marduk191/rife/resolve/main/rife417.pth",
        "https://github.com/styler00dollar/VSGAN-tensorrt-docker/releases/download/models/rife417.pth",
    ],
    "rife426.pth": [
        "https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/releases/download/models/rife426.pth",
        "https://huggingface.co/marduk191/rife/resolve/main/rife426.pth",
        "https://github.com/styler00dollar/VSGAN-tensorrt-docker/releases/download/models/rife426.pth",
    ],
}

_DOWNLOAD_LOCK = threading.Lock()
_CURRENT_DOWNLOADS: Dict[str, Dict[str, Any]] = {}


def get_model_dir() -> str:
    """Returns the absolute path to DeathshotArsenal/Interpolation Models/, creating it if needed."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    target_dir = os.path.join(base_dir, "Interpolation Models")
    try:
        os.makedirs(target_dir, exist_ok=True)
    except Exception as e:
        logger.warning(f"Could not create model directory {target_dir}: {e}")
    return target_dir


def get_model_path(ckpt_name: str) -> str:
    """Returns the full path to a checkpoint in the Interpolation Models folder."""
    return os.path.join(get_model_dir(), ckpt_name)


def is_model_installed(ckpt_name: str) -> bool:
    """Checks whether the requested checkpoint exists and has non-zero size."""
    p = get_model_path(ckpt_name)
    return os.path.isfile(p) and os.path.getsize(p) > 1024


def discover_local_copy(ckpt_name: str) -> Optional[str]:
    """
    Checks common ComfyUI directories to see if the user already has this checkpoint,
    saving bandwidth by copying or hardlinking locally.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    comfy_dir = os.path.dirname(base_dir)  # custom_nodes
    comfy_root = os.path.dirname(comfy_dir)  # ComfyUI root

    candidate_dirs = [
        os.path.join(comfy_dir, "comfyui-frame-interpolation", "ckpts", "rife"),
        os.path.join(comfy_dir, "ComfyUI-Frame-Interpolation", "ckpts", "rife"),
        os.path.join(comfy_dir, "ComfyUI-VFI", "ckpts", "rife"),
        os.path.join(comfy_root, "models", "frame_interpolation"),
        os.path.join(comfy_root, "models", "rife"),
    ]

    for cdir in candidate_dirs:
        candidate_file = os.path.join(cdir, ckpt_name)
        if os.path.isfile(candidate_file) and os.path.getsize(candidate_file) > 1024:
            return candidate_file

    return None


def get_all_models_status() -> List[Dict[str, Any]]:
    """Returns list of models with their availability status, size, and version."""
    model_dir = get_model_dir()
    results = []
    for name in MODEL_NAMES:
        path = os.path.join(model_dir, name)
        installed = os.path.isfile(path) and os.path.getsize(path) > 1024
        size_bytes = os.path.getsize(path) if installed else 0
        results.append({
            "name": name,
            "arch_ver": SUPPORTED_MODELS.get(name, "4.7"),
            "installed": installed,
            "size": size_bytes,
            "is_default": (name == DEFAULT_MODEL),
        })
    return results


def download_model_file(
    ckpt_name: str,
    progress_callback: Optional[Callable[[int, int, float], None]] = None
) -> str:
    """
    Downloads the selected checkpoint using available mirrors with progress reporting
    and atomic file replacement to prevent corrupted checkpoint files.
    """
    if ckpt_name not in MODEL_URLS:
        raise ValueError(f"Unknown interpolation model '{ckpt_name}'. Available: {list(MODEL_URLS.keys())}")

    target_dir = get_model_dir()
    target_path = os.path.join(target_dir, ckpt_name)

    # 1. Check if already installed
    if os.path.isfile(target_path) and os.path.getsize(target_path) > 1024:
        return target_path

    # 2. Check local copy discovery
    local_source = discover_local_copy(ckpt_name)
    if local_source:
        logger.info(f"[DS Interpolation] Found existing local checkpoint for '{ckpt_name}' at '{local_source}'. Copying...")
        try:
            shutil.copy2(local_source, target_path)
            if os.path.isfile(target_path) and os.path.getsize(target_path) > 1024:
                logger.info(f"[DS Interpolation] Copied local model '{ckpt_name}' successfully.")
                return target_path
        except Exception as e:
            logger.warning(f"[DS Interpolation] Failed to copy local model: {e}")

    temp_path = os.path.join(target_dir, f".tmp_{os.getpid()}_{ckpt_name}")
    urls = MODEL_URLS[ckpt_name]
    last_err = None

    with _DOWNLOAD_LOCK:
        _CURRENT_DOWNLOADS[ckpt_name] = {"progress": 0.0, "status": "downloading"}

    try:
        for idx, url in enumerate(urls):
            logger.info(f"[DS Interpolation] Downloading '{ckpt_name}' from mirror {idx + 1}/{len(urls)}: {url}")
            try:
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ComfyUI DeathshotArsenal"}
                req = urllib.request.Request(url, headers=headers)

                with urllib.request.urlopen(req, timeout=30) as resp:
                    total_size = int(resp.headers.get("content-length", 0))
                    downloaded = 0
                    chunk_size = 128 * 1024

                    with open(temp_path, "wb") as f:
                        while True:
                            chunk = resp.read(chunk_size)
                            if not chunk:
                                break
                            f.write(chunk)
                            downloaded += len(chunk)
                            pct = (downloaded / total_size * 100.0) if total_size > 0 else 0.0

                            if progress_callback:
                                progress_callback(downloaded, total_size, pct)

                            with _DOWNLOAD_LOCK:
                                _CURRENT_DOWNLOADS[ckpt_name] = {
                                    "progress": pct,
                                    "downloaded": downloaded,
                                    "total": total_size,
                                    "status": "downloading",
                                }

                    if total_size > 0 and downloaded < (total_size * 0.95):
                        raise IOError(f"Incomplete download: received {downloaded}/{total_size} bytes")

                # Atomic rename
                if os.path.exists(target_path):
                    try:
                        os.remove(target_path)
                    except Exception:
                        pass

                os.rename(temp_path, target_path)
                logger.info(f"[DS Interpolation] Successfully installed '{ckpt_name}'.")

                with _DOWNLOAD_LOCK:
                    _CURRENT_DOWNLOADS[ckpt_name] = {"progress": 100.0, "status": "completed"}

                return target_path

            except Exception as e:
                last_err = e
                logger.warning(f"[DS Interpolation] Mirror failed for '{url}': {e}")
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass

        raise RuntimeError(f"Failed to download interpolation model '{ckpt_name}' from all available sources. Last error: {last_err}")

    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        with _DOWNLOAD_LOCK:
            if ckpt_name in _CURRENT_DOWNLOADS and _CURRENT_DOWNLOADS[ckpt_name].get("status") == "downloading":
                _CURRENT_DOWNLOADS[ckpt_name] = {"progress": 0.0, "status": "failed"}


def ensure_model(ckpt_name: str, progress_callback: Optional[Callable] = None) -> str:
    """Ensures model is installed, downloading if necessary."""
    if is_model_installed(ckpt_name):
        return get_model_path(ckpt_name)
    return download_model_file(ckpt_name, progress_callback=progress_callback)
