import os
import time
import datetime
import hashlib
import struct
import uuid
import logging
import asyncio
import shutil
import subprocess
import torch
import numpy as np
from PIL import Image

import server
import folder_paths
import comfy.model_management

logger = logging.getLogger("DeathshotArsenal.Stripper")


def _find_ffmpeg():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _is_output_linked(prompt, unique_id, output_index=0):
    if not prompt or not isinstance(prompt, dict):
        return False
    target = [str(unique_id), output_index]
    for node_data in prompt.values():
        if not isinstance(node_data, dict):
            continue
        inputs = node_data.get("inputs", {})
        if not isinstance(inputs, dict):
            continue
        for val in inputs.values():
            if val == target or (isinstance(val, list) and len(val) == 2 and str(val[0]) == str(unique_id) and val[1] == output_index):
                return True
    return False


def _verify_png_chunks(filepath):
    with open(filepath, "rb") as f:
        header = f.read(8)
        if header != b"\x89PNG\r\n\x1a\n":
            return False, [], -1

        chunks = []
        while True:
            len_bytes = f.read(4)
            if len(len_bytes) < 4:
                break
            length = struct.unpack(">I", len_bytes)[0]
            chunk_type = f.read(4).decode("latin-1", errors="replace")
            chunks.append(chunk_type)
            f.seek(length + 4, os.SEEK_CUR)
            if chunk_type == "IEND":
                break

    allowed = {"IHDR", "IDAT", "IEND"}
    extra_chunks = [c for c in chunks if c not in allowed]
    is_clean = len(extra_chunks) == 0 and "IHDR" in chunks and "IDAT" in chunks and "IEND" in chunks
    return is_clean, chunks, len(extra_chunks)


def _compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def _get_next_file_number(output_dir, prefix, extension):
    if not os.path.exists(output_dir):
        return 1
    max_num = 0
    ext = extension.lower().lstrip(".")
    for fname in os.listdir(output_dir):
        if fname.startswith(prefix) and fname.lower().endswith(f".{ext}"):
            part = fname[len(prefix):-len(ext) - 1].strip("_")
            if part.isdigit():
                max_num = max(max_num, int(part))
    return max_num + 1


def _make_progress_bar(percentage, length=20):
    filled = int(round(length * (percentage / 100.0)))
    filled = max(0, min(length, filled))
    return f"[{'█' * filled}{'░' * (length - filled)}]"


class DSStripper:
    _run_counter = 0

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Images": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("Images",)
    FUNCTION = "strip"
    CATEGORY = "☠️ Deathshot Arsenal/💾 Utilities"
    OUTPUT_NODE = True

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def strip(self, Images=None, images=None, prompt=None, unique_id=None, **kwargs):
        start_time = time.time()
        DSStripper._run_counter += 1
        run_id = DSStripper._run_counter

        card_log_lines = []

        def send_log(kind, text, progress=None):
            now_str = datetime.datetime.now().strftime("%H:%M:%S")
            formatted_kind = f"{kind:<4}"
            line = f"[{now_str}] [{formatted_kind}] {text}"
            card_log_lines.append(line)
            try:
                if server.PromptServer.instance is not None:
                    server.PromptServer.instance.send_sync("deathshotarsenal.stripper.log", {
                        "node": str(unique_id),
                        "run": run_id,
                        "kind": kind.strip(),
                        "text": text,
                        "progress": progress,
                        "time": now_str,
                    })
            except Exception as e:
                logger.debug(f"[DS Stripper] send_sync failed: {e}")

        target_images = Images if Images is not None else images
        if target_images is None:
            send_log("FAIL", "No image input provided")
            raise ValueError("[DS Stripper] 'Images' input is required.")

        batch_size = target_images.shape[0] if hasattr(target_images, "shape") else 1
        is_linked = _is_output_linked(prompt, unique_id, 0)

        output_dir = os.path.join(folder_paths.get_output_directory(), "Stripper")
        temp_dir = folder_paths.get_temp_directory()
        os.makedirs(temp_dir, exist_ok=True)

        if not is_linked:
            if not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)
                send_log("SYS", f"created output folder Stripper/")
            else:
                send_log("SYS", f"output folder Stripper/ ready")

        send_log("LOAD", f"input images: {batch_size} {'frame' if batch_size == 1 else 'frames'}")
        if is_linked:
            send_log("PASS", "output linked -> pass-through mode, nothing written to disk")

        out_images = target_images
        saved_files_count = 0

        if not is_linked:
            send_log("SCAN", "checking metadata chunks...")
            next_num = _get_next_file_number(output_dir, "Stripped_", "png")

            for i in range(batch_size):
                comfy.model_management.throw_exception_if_processing_interrupted()

                current_num = next_num + i
                filename = f"Stripped_{current_num:04d}.png"
                final_path = os.path.join(output_dir, filename)
                tmp_filename = f".tmp_strip_{uuid.uuid4().hex[:8]}_{filename}"
                tmp_path = os.path.join(temp_dir, tmp_filename)

                try:
                    frame = target_images[i]
                    frame_tensor = frame.cpu().numpy() if hasattr(frame, "cpu") else np.array(frame)
                    frame_uint8 = (frame_tensor * 255.0).clip(0, 255).astype(np.uint8)
                    pil_img = Image.fromarray(frame_uint8)

                    with open(tmp_path, "wb") as f_out:
                        pil_img.save(f_out, format="PNG")
                        f_out.flush()
                        os.fsync(f_out.fileno())

                    is_clean, chunks, extra_count = _verify_png_chunks(tmp_path)
                    if not is_clean or extra_count > 0:
                        if os.path.exists(tmp_path):
                            os.remove(tmp_path)
                        send_log("FAIL", f"Verification failed on {filename}: extra chunks found ({extra_count})")
                        logger.error(f"[DS Stripper] Metadata found in {filename}: {chunks}")
                        raise RuntimeError(f"Verification failed on {filename}: saved PNG contained metadata!")

                    os.replace(tmp_path, final_path)
                    sha12 = _compute_sha256(final_path)[:12]
                    saved_files_count += 1

                    if batch_size <= 10 or i < 10:
                        send_log("VRFY", f"{filename}  chunks: IHDR IDAT IEND  tags: 0")
                        send_log("SAVE", f"Stripper/{filename}  sha256:{sha12}")
                    else:
                        pct = int(round(((i + 1) / batch_size) * 100))
                        bar = _make_progress_bar(pct)
                        send_log("WIPE", f"encoding clean PNG {bar} {pct}%", progress=(i + 1) / batch_size)

                except Exception as e:
                    if os.path.exists(tmp_path):
                        try:
                            os.remove(tmp_path)
                        except Exception:
                            pass
                    send_log("FAIL", f"Failed saving {filename}: {e}")
                    logger.error(f"[DS Stripper] Write error on {filename}: {e}")
                    raise

            if batch_size > 10:
                send_log("WIPE", f"encoding clean PNG {_make_progress_bar(100)} 100%", progress=1.0)

        elapsed = time.time() - start_time
        if saved_files_count > 0:
            summary_msg = f"done. {saved_files_count} {'file' if saved_files_count == 1 else 'files'} saved to Stripper/  ({elapsed:.1f}s)"
        else:
            summary_msg = f"done. pass-through complete  ({elapsed:.1f}s)"

        send_log("OK", summary_msg)
        logger.info(f"[DS Stripper] run #{run_id} finished: {summary_msg}")

        return {"ui": {"card_log": card_log_lines}, "result": (out_images,)}


def _register_stripper_routes():
    if server.PromptServer.instance is None or server.PromptServer.instance.routes is None:
        return
    routes = server.PromptServer.instance.routes

    from aiohttp import web

    def _is_registered(method: str, path: str) -> bool:
        for r in routes:
            if getattr(r, "method", "").upper() == method.upper() and getattr(r, "path", "") == path:
                return True
        return False

    if _is_registered("POST", "/ds/stripper/strip_video"):
        return

    @routes.post("/ds/stripper/strip_video")
    async def handle_strip_video(request: web.Request):
        try:
            reader = await request.multipart()
            node_id = "unknown"
            temp_dir = folder_paths.get_temp_directory()
            os.makedirs(temp_dir, exist_ok=True)
            output_dir = os.path.join(folder_paths.get_output_directory(), "Stripper")
            os.makedirs(output_dir, exist_ok=True)

            orig_filename = "video.mp4"
            temp_in = None
            start_time = time.time()
            card_log_lines = []

            def send_ws(kind, text, progress=None):
                now_str = datetime.datetime.now().strftime("%H:%M:%S")
                formatted_kind = f"{kind:<4}"
                line = f"[{now_str}] [{formatted_kind}] {text}"
                card_log_lines.append(line)
                try:
                    server.PromptServer.instance.send_sync("deathshotarsenal.stripper.log", {
                        "node": str(node_id),
                        "run": "upload",
                        "kind": kind.strip(),
                        "text": text,
                        "progress": progress,
                        "time": now_str,
                    })
                except Exception:
                    pass

            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name == "node_id":
                    node_id = (await part.text()).strip()
                elif part.name == "file":
                    orig_filename = part.filename or "uploaded_video.mp4"
                    _, ext = os.path.splitext(orig_filename)
                    if not ext:
                        ext = ".mp4"
                    temp_in = os.path.join(temp_dir, f"strip_in_{uuid.uuid4().hex[:8]}{ext}")
                    with open(temp_in, "wb") as f:
                        while chunk := await part.read_chunk():
                            f.write(chunk)

            if not temp_in or not os.path.exists(temp_in):
                return web.json_response({"error": "No video file uploaded"}, status=400)

            file_size_mb = os.path.getsize(temp_in) / (1024 * 1024)
            send_ws("LOAD", f"Uploaded video: {orig_filename} ({file_size_mb:.2f} MB)")
            send_ws("SCAN", "Checking video & audio streams...")

            ffmpeg_exe = _find_ffmpeg()
            if not ffmpeg_exe:
                if os.path.exists(temp_in):
                    try: os.remove(temp_in)
                    except Exception: pass
                send_ws("FAIL", "ffmpeg binary not found in environment!")
                return web.json_response({"error": "ffmpeg not found"}, status=500)

            _, ext = os.path.splitext(orig_filename)
            ext_clean = ext.lstrip(".").lower() or "mp4"
            next_num = _get_next_file_number(output_dir, "Stripped_", ext_clean)
            final_filename = f"Stripped_{next_num:04d}.{ext_clean}"
            final_path = os.path.join(output_dir, final_filename)
            temp_out = os.path.join(temp_dir, f"strip_out_{uuid.uuid4().hex[:8]}.{ext_clean}")

            send_ws("WIPE", "Stripping container metadata, stream tags, chapter markers...")

            cmd = [
                ffmpeg_exe,
                "-y",
                "-i", temp_in,
                "-map", "0",
                "-c", "copy",
                "-map_metadata", "-1",
                "-map_metadata:s", "-1",
                "-fflags", "+bitexact",
                "-flags:v", "+bitexact",
                "-flags:a", "+bitexact",
                temp_out,
            ]

            proc = await asyncio.to_thread(
                subprocess.run, cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            if proc.returncode != 0:
                err_msg = proc.stderr.decode("utf-8", errors="replace")
                if os.path.exists(temp_in):
                    try: os.remove(temp_in)
                    except Exception: pass
                if os.path.exists(temp_out):
                    try: os.remove(temp_out)
                    except Exception: pass
                send_ws("FAIL", f"ffmpeg error: {err_msg[:200]}")
                return web.json_response({"error": err_msg}, status=500)

            os.replace(temp_out, final_path)
            if os.path.exists(temp_in):
                try: os.remove(temp_in)
                except Exception: pass

            sha12 = _compute_sha256(final_path)[:12]
            elapsed = time.time() - start_time

            send_ws("SAVE", f"Stripper/{final_filename}  sha256:{sha12}")
            send_ws("VRFY", f"{final_filename}  streams copied  tags: 0")
            send_ws("OK", f"done. video stripped & saved in {elapsed:.2f}s | SHA-256: {sha12}")

            return web.json_response({
                "success": True,
                "filename": final_filename,
                "output_path": f"Stripper/{final_filename}",
                "hash": sha12,
                "elapsed": elapsed,
                "logs": card_log_lines,
            })
        except Exception as e:
            logger.error(f"[DS Stripper] strip_video route error: {e}", exc_info=True)
            return web.json_response({"error": str(e)}, status=500)


try:
    _register_stripper_routes()
except Exception as _e:
    logger.debug(f"[DS Stripper] route registration deferred: {_e}")
