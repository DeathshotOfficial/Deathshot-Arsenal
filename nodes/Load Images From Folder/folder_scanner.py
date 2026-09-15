# DeathshotArsenal/nodes/Load Images From Folder/folder_scanner.py
import os
import re

SUPPORTED_IMAGE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".bmp",
    ".gif", ".tiff", ".tif", ".avif", ".ico"
}


def is_image_file(filename: str) -> bool:
    """Check if the given filename or path has a supported image extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext in SUPPORTED_IMAGE_EXTENSIONS


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


def scan_folder(folder_path: str, recursive: bool = False, sort_by: str = "name", sort_dir: str = "asc"):
    """
    Scan folder_path for image files.
    Returns a list of dicts containing:
      - name: base filename (e.g., 'image_01.png')
      - rel_path: relative path with forward slashes (e.g., 'subfolder/image_01.png')
      - full_path: absolute normalized path
      - size: file size in bytes
      - mtime: last modified timestamp (epoch float)
      - ext: file extension (e.g., '.png')
    """
    folder_path = str(folder_path or "").strip().strip('"').strip("'")
    if not folder_path or not os.path.isdir(folder_path):
        return []

    real_base = os.path.realpath(folder_path)
    files_list = []

    try:
        if recursive:
            for root, _, filenames in os.walk(real_base, followlinks=False):
                for fname in filenames:
                    if fname.startswith("."):
                        continue
                    if not is_image_file(fname):
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
                    if not is_image_file(entry.name):
                        continue
                    try:
                        st = entry.stat()
                    except OSError:
                        continue
                    files_list.append({
                        "name": entry.name,
                        "rel_path": entry.name,
                        "full_path": entry.path,
                        "size": st.st_size,
                        "mtime": st.st_mtime,
                        "ext": os.path.splitext(entry.name)[1].lower(),
                    })
    except Exception as e:
        print(f"[DS Load Images From Folder] Folder scan error on '{folder_path}': {e}")
        return []

    # Apply sorting
    reverse = (sort_dir.lower() == "desc")
    sort_by_lower = sort_by.lower()

    if sort_by_lower in ("date", "mtime", "date modified"):
        files_list.sort(key=lambda x: x["mtime"], reverse=reverse)
    elif sort_by_lower in ("size", "file size"):
        files_list.sort(key=lambda x: x["size"], reverse=reverse)
    elif sort_by_lower in ("type", "extension", "ext"):
        files_list.sort(key=lambda x: (x["ext"], natural_sort_key(x["name"])), reverse=reverse)
    else:  # default: name
        files_list.sort(key=lambda x: natural_sort_key(x["rel_path"]), reverse=reverse)

    return files_list
