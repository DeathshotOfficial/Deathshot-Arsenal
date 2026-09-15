# DeathshotArsenal/nodes/Gallery/gallery_scanner.py
import os
import re

# Centralized supported media formats
SUPPORTED_IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".bmp", ".tiff", ".tif", ".avif", ".ico"
}

SUPPORTED_VIDEO_EXTENSIONS = {
    ".mp4", ".webm", ".mov", ".mkv",
    ".avi", ".flv", ".wmv", ".m4v"
}

SUPPORTED_MEDIA_EXTENSIONS = SUPPORTED_IMAGE_EXTENSIONS | SUPPORTED_VIDEO_EXTENSIONS


def get_media_type(filename: str) -> str:
    """Return 'image', 'video', or empty string if unsupported."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in SUPPORTED_IMAGE_EXTENSIONS:
        return "image"
    if ext in SUPPORTED_VIDEO_EXTENSIONS:
        return "video"
    return ""


def is_supported_media(filename: str) -> bool:
    """Check if the given filename has a supported image or video extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in SUPPORTED_MEDIA_EXTENSIONS


def is_safe_subpath(base_dir: str, target_path: str) -> bool:
    """Ensure target_path resolves strictly within base_dir to prevent path traversal."""
    try:
        real_base = os.path.realpath(base_dir)
        real_target = os.path.realpath(target_path)
        return os.path.commonpath([real_target, real_base]) == real_base
    except (ValueError, OSError):
        return False


def natural_sort_key(s: str):
    """Sort strings with embedded numbers naturally (e.g. img2 before img10)."""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", s)]


def scan_gallery_folder(
    folder_path: str,
    media_filter: str = "all",
    search: str = "",
    sort_by: str = "name_asc",
    recursive: bool = False
):
    """
    Scans folder_path for supported media files.
    Returns:
      {
        "folder": clean_folder_path,
        "total": len(items),
        "files": [
           {
             "name": filename,
             "rel_path": relative_path,
             "full_path": absolute_normalized_path,
             "type": "image" | "video",
             "size": size_bytes,
             "mtime": timestamp,
             "ext": ext
           }, ...
        ]
      }
    """
    clean_path = str(folder_path or "").strip().strip('"').strip("'")
    if not clean_path or not os.path.isdir(clean_path):
        return {"folder": clean_path, "total": 0, "files": [], "error": "Folder not found"}

    real_base = os.path.realpath(clean_path)
    files_list = []
    search_lower = str(search or "").strip().lower()
    media_filter_lower = str(media_filter or "all").strip().lower()

    try:
        if recursive:
            for root, _, filenames in os.walk(real_base, followlinks=False):
                for fname in filenames:
                    if fname.startswith("."):
                        continue
                    mtype = get_media_type(fname)
                    if not mtype:
                        continue
                    if media_filter_lower == "images" and mtype != "image":
                        continue
                    if media_filter_lower == "videos" and mtype != "video":
                        continue
                    if search_lower and search_lower not in fname.lower():
                        continue

                    full = os.path.join(root, fname)
                    if not is_safe_subpath(real_base, full):
                        continue
                    try:
                        st = os.stat(full)
                    except OSError:
                        continue

                    rel = os.path.relpath(full, real_base).replace("\\", "/")
                    files_list.append({
                        "name": fname,
                        "rel_path": rel,
                        "full_path": full,
                        "type": mtype,
                        "size": st.st_size,
                        "mtime": st.st_mtime,
                        "ext": os.path.splitext(fname)[1].lower(),
                    })
        else:
            with os.scandir(real_base) as it:
                for entry in it:
                    if not entry.is_file():
                        continue
                    if entry.name.startswith("."):
                        continue
                    mtype = get_media_type(entry.name)
                    if not mtype:
                        continue
                    if media_filter_lower == "images" and mtype != "image":
                        continue
                    if media_filter_lower == "videos" and mtype != "video":
                        continue
                    if search_lower and search_lower not in entry.name.lower():
                        continue

                    try:
                        st = entry.stat()
                    except OSError:
                        continue

                    files_list.append({
                        "name": entry.name,
                        "rel_path": entry.name,
                        "full_path": entry.path,
                        "type": mtype,
                        "size": st.st_size,
                        "mtime": st.st_mtime,
                        "ext": os.path.splitext(entry.name)[1].lower(),
                    })
    except Exception as e:
        return {"folder": clean_path, "total": 0, "files": [], "error": str(e)}

    # Apply sorting
    sort_key = str(sort_by or "name_asc").lower()
    if sort_key in ("date_desc", "newest"):
        files_list.sort(key=lambda x: x["mtime"], reverse=True)
    elif sort_key in ("date_asc", "oldest"):
        files_list.sort(key=lambda x: x["mtime"], reverse=False)
    elif sort_key in ("size_desc", "largest"):
        files_list.sort(key=lambda x: x["size"], reverse=True)
    elif sort_key in ("size_asc", "smallest"):
        files_list.sort(key=lambda x: x["size"], reverse=False)
    elif sort_key in ("name_desc", "desc"):
        files_list.sort(key=lambda x: natural_sort_key(x["rel_path"]), reverse=True)
    elif sort_key in ("type", "type_asc"):
        files_list.sort(key=lambda x: (x["type"], natural_sort_key(x["name"])))
    else:  # default: name_asc
        files_list.sort(key=lambda x: natural_sort_key(x["rel_path"]), reverse=False)

    return {
        "folder": real_base,
        "total": len(files_list),
        "files": files_list
    }
