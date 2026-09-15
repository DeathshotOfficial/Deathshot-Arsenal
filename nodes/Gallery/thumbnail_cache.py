# DeathshotArsenal/nodes/Gallery/thumbnail_cache.py
import os
import io
import hashlib
import logging
from PIL import Image, ImageOps

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

_HERE = os.path.dirname(os.path.realpath(__file__))
# DeathshotArsenal root directory
_DS_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
CACHE_DIR = os.path.join(_DS_ROOT, ".cache", "thumbnails")


def ensure_cache_dir():
    os.makedirs(CACHE_DIR, exist_ok=True)
    return CACHE_DIR


def get_cache_key(file_path: str, mtime: float = None, size: int = None) -> str:
    norm = os.path.abspath(file_path)
    if mtime is None or size is None:
        try:
            st = os.stat(norm)
            mtime = st.st_mtime
            size = st.st_size
        except OSError:
            mtime = 0
            size = 0
    raw = f"{norm}_{mtime}_{size}"
    return hashlib.md5(raw.encode("utf-8")).hexdigest() + ".webp"


def extract_video_frame(video_path: str) -> Image.Image:
    """Extract a representative keyframe from a video file without decoding the whole file."""
    if not HAS_CV2:
        raise RuntimeError("OpenCV (cv2) is required for video thumbnail generation")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video file: {video_path}")

    try:
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        # Sample ~10% into the video for a representative frame, or frame 0
        target = max(0, int(total_frames * 0.1)) if total_frames > 15 else 0
        cap.set(cv2.CAP_PROP_POS_FRAMES, target)
        ret, frame = cap.read()
        if not ret or frame is None:
            # Fallback to frame 0
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()

        if not ret or frame is None:
            raise RuntimeError("Failed to read video frame")

        # Convert BGR to RGB
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return Image.fromarray(frame_rgb)
    finally:
        cap.release()


def generate_thumbnail(file_path: str, target_size: int = 256) -> str:
    """
    Generates and saves a square WebP thumbnail to disk cache.
    Returns the absolute path to the cached thumbnail.
    """
    ensure_cache_dir()
    cache_filename = get_cache_key(file_path)
    cached_path = os.path.join(CACHE_DIR, cache_filename)

    # Check if cache file exists and is non-empty
    if os.path.isfile(cached_path) and os.path.getsize(cached_path) > 0:
        return cached_path

    ext = os.path.splitext(file_path)[1].lower()
    from .gallery_scanner import get_media_type
    media_type = get_media_type(file_path)

    img = None
    if media_type == "image":
        try:
            img = Image.open(file_path)
            ImageOps.exif_transpose(img, in_place=True)
        except Exception as e:
            logging.error(f"[DS Gallery] Error opening image '{file_path}': {e}")
            raise
    elif media_type == "video":
        try:
            img = extract_video_frame(file_path)
        except Exception as e:
            logging.error(f"[DS Gallery] Error extracting video frame from '{file_path}': {e}")
            raise
    else:
        raise ValueError(f"Unsupported media type for '{file_path}'")

    # Fit into square target_size x target_size preserving aspect ratio without distortion
    thumb = ImageOps.fit(img, (target_size, target_size), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))

    # Save to temp file first, then atomic rename
    tmp_path = cached_path + ".tmp"
    try:
        if thumb.mode in ("RGBA", "LA") or (thumb.mode == "P" and "transparency" in thumb.info):
            thumb.save(tmp_path, format="WEBP", quality=80, method=4)
        else:
            thumb = thumb.convert("RGB")
            thumb.save(tmp_path, format="WEBP", quality=80, method=4)

        if os.path.exists(cached_path):
            try:
                os.remove(cached_path)
            except OSError:
                pass
        os.replace(tmp_path, cached_path)
    except Exception as e:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise e
    finally:
        if img is not None:
            try:
                img.close()
            except Exception:
                pass

    return cached_path


def clear_thumbnail_cache():
    """Purges all files in the thumbnail cache directory."""
    if not os.path.isdir(CACHE_DIR):
        return {"cleared": 0, "freed_mb": 0.0}

    cleared = 0
    freed_bytes = 0
    with os.scandir(CACHE_DIR) as it:
        for entry in it:
            if entry.is_file() and entry.name.endswith(".webp"):
                try:
                    freed_bytes += entry.stat().st_size
                    os.remove(entry.path)
                    cleared += 1
                except Exception:
                    pass

    return {"cleared": cleared, "freed_mb": round(freed_bytes / (1024 * 1024), 2)}
