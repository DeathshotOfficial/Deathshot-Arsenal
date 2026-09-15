"""
DS Load Video - Backend Execution Engine
Deathshot Arsenal / DS Node Pack
"""

import os
import re
import json
import math
import mimetypes
import logging
import asyncio
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
import cv2

import folder_paths
import server
from aiohttp import web

logger = logging.getLogger("DeathshotArsenal.LoadVideo")

STATE_CACHE_FILE = os.path.join(os.path.dirname(__file__), ".ds_load_video_cache.json")


def load_persisted_state() -> Dict[str, Any]:
    if os.path.isfile(STATE_CACHE_FILE):
        try:
            with open(STATE_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.debug(f"Failed to read state cache: {e}")
    return {"nodes": {}, "last_video": ""}


def save_persisted_state(data: Dict[str, Any]):
    try:
        with open(STATE_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.debug(f"Failed to write state cache: {e}")

# Supported video extensions across Deathshot Arsenal
SUPPORTED_VIDEO_EXTENSIONS = {
    ".mp4", ".webm", ".mov", ".mkv",
    ".avi", ".flv", ".wmv", ".m4v"
}

# Supported Video Formats and alignment / frame count contracts
FORMAT_CONFIGS = {
    "None": {},
    "AnimateDiff": {"target_rate": 8, "dim": (8, 0, 512, 512)},
    "Mochi": {"target_rate": 24, "dim": (16, 0, 848, 480), "frames": (6, 1)},
    "LTXV": {"target_rate": 24, "dim": (32, 0, 768, 512), "frames": (8, 1)},
    "Hunyuan": {"target_rate": 24, "dim": (16, 0, 848, 480), "frames": (4, 1)},
    "Cosmos": {"target_rate": 24, "dim": (16, 0, 1280, 704), "frames": (8, 1)},
    "Wan": {"target_rate": 16, "dim": (8, 0, 832, 480), "frames": (4, 1)},
    "H3": {"target_rate": 24, "dim": (32, 0, 1344, 768), "frames": (17, 5)},
}

FORMAT_NAMES = list(FORMAT_CONFIGS.keys())


def natural_sort_key(s: str) -> List[Any]:
    """Natural sort key for predictable alphanumeric file ordering (e.g. video_1 before video_10)."""
    return [int(text) if text.isdigit() else text.lower() for text in re.split(r"(\d+)", str(s))]


def resolve_video_path(video_input: str) -> Optional[str]:
    """Resolves a video file path safely from absolute paths or ComfyUI input paths."""
    if not video_input:
        return None
    clean = str(video_input).strip().strip('"').strip("'")
    if not clean:
        return None

    # 1. Absolute path check
    if os.path.isabs(clean) and os.path.isfile(clean):
        return os.path.normpath(clean)

    # 2. ComfyUI annotated filepath resolver
    try:
        if folder_paths.exists_annotated_filepath(clean):
            return folder_paths.get_annotated_filepath(clean)
    except Exception:
        pass

    # 3. ComfyUI input directory
    input_dir = folder_paths.get_input_directory()
    candidate = os.path.join(input_dir, clean)
    if os.path.isfile(candidate):
        return os.path.normpath(candidate)

    # 4. Standard current working directory
    if os.path.isfile(clean):
        return os.path.abspath(clean)

    return None


def calculate_target_size(width: int, height: int, custom_width: int, custom_height: int, downscale_ratio: int = 1) -> Tuple[int, int]:
    """Calculates aspect-ratio-preserving dimensions snapped to downscale_ratio multiples."""
    downscale_ratio = max(1, int(downscale_ratio or 1))
    if custom_width <= 0 and custom_height <= 0:
        w, h = width, height
    elif custom_height <= 0:
        scale = custom_width / max(1, width)
        w = custom_width
        h = int(round(height * scale))
    elif custom_width <= 0:
        scale = custom_height / max(1, height)
        h = custom_height
        w = int(round(width * scale))
    else:
        w = custom_width
        h = custom_height

    w = max(downscale_ratio, int(round(w / downscale_ratio)) * downscale_ratio)
    h = max(downscale_ratio, int(round(h / downscale_ratio)) * downscale_ratio)
    return (w, h)


def extract_audio_track(filepath: str, start_time: float = 0.0, duration: float = 0.0) -> Optional[Dict[str, Any]]:
    """Extracts audio waveform tensor from video using PyAV, with graceful fallback if no audio is present."""
    try:
        import av
        with av.open(filepath) as container:
            if not container.streams.audio:
                return None
            audio_stream = container.streams.audio[0]
            sr = audio_stream.codec_context.sample_rate or 44100
            channels = audio_stream.channels or 2

            if start_time > 0 and audio_stream.time_base:
                pts = int(start_time / float(audio_stream.time_base))
                container.seek(pts, stream=audio_stream)

            frames = []
            total_samples = 0
            max_samples = int(duration * sr) if duration > 0 else 0

            for frame in container.decode(streams=audio_stream.index):
                arr = frame.to_ndarray()
                if arr.dtype != np.float32:
                    if np.issubdtype(arr.dtype, np.integer):
                        max_val = float(np.iinfo(arr.dtype).max)
                        arr = arr.astype(np.float32) / max_val
                    else:
                        arr = arr.astype(np.float32)

                t = torch.from_numpy(arr)
                if t.dim() == 1:
                    t = t.unsqueeze(0)
                elif t.shape[0] != channels and t.shape[1] == channels:
                    t = t.transpose(0, 1)

                frames.append(t)
                total_samples += t.shape[1]
                if max_samples > 0 and total_samples >= max_samples:
                    break

            if not frames:
                return None

            waveform = torch.cat(frames, dim=1)
            if max_samples > 0 and waveform.shape[1] > max_samples:
                waveform = waveform[:, :max_samples]

            if waveform.dim() == 2:
                waveform = waveform.unsqueeze(0)

            return {"waveform": waveform, "sample_rate": int(sr)}
    except Exception as e:
        logger.debug(f"Audio extraction not available for {filepath}: {e}")
        return None


def probe_video_metadata(filepath: str) -> Dict[str, Any]:
    """Fast, lightweight probe of video properties without decoding full video into RAM."""
    meta = {
        "fps": 24.0,
        "frame_count": 0,
        "width": 0,
        "height": 0,
        "duration": 0.0,
        "has_audio": False,
        "codec": "unknown",
    }
    if not filepath or not os.path.isfile(filepath):
        return meta

    # OpenCV metadata probe
    cap = cv2.VideoCapture(filepath)
    if cap.isOpened():
        try:
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
            if fps > 0.0 and not math.isnan(fps):
                meta["fps"] = round(fps, 2)
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

            if w > 0 and h > 0:
                meta["width"] = w
                meta["height"] = h
            else:
                ret, frame = cap.read()
                if ret and frame is not None:
                    meta["height"], meta["width"] = frame.shape[:2]

            meta["frame_count"] = max(0, total)
            if meta["fps"] > 0:
                meta["duration"] = round(meta["frame_count"] / meta["fps"], 2)
        finally:
            cap.release()

    # PyAV fast stream probe for audio presence & codec
    try:
        import av
        with av.open(filepath) as container:
            if container.streams.video:
                v_stream = container.streams.video[0]
                if v_stream.codec_context and v_stream.codec_context.name:
                    meta["codec"] = v_stream.codec_context.name
                if meta["frame_count"] == 0 and v_stream.frames > 0:
                    meta["frame_count"] = int(v_stream.frames)
                    if meta["fps"] > 0:
                        meta["duration"] = round(meta["frame_count"] / meta["fps"], 2)
            meta["has_audio"] = bool(container.streams.audio)
    except Exception:
        pass

    return meta


class DS_LoadVideo:
    """
    DS Load Video Node
    Provides video loading, directory navigation, aspect-ratio-safe resizing,
    frame-rate adjustments, audio extraction, and format-aligned video info.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video": ("STRING", {"default": ""}),
                "force_rate": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 240.0, "step": 1.0}),
                "custom_width": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 8}),
                "custom_height": ("INT", {"default": 0, "min": 0, "max": 16384, "step": 8}),
                "frame_load_cap": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
                "skip_first_frames": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
                "select_every_nth": ("INT", {"default": 1, "min": 1, "max": 1000, "step": 1}),
                "format": (FORMAT_NAMES, {"default": "LTXV"}),
            },
            "hidden": {
                "ds_load_video_state": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("IMAGE", "AUDIO", "INT", "VHS_VIDEOINFO")
    RETURN_NAMES = ("Images", "Audio", "Frame_Count", "Video_Info")
    FUNCTION = "load_video"
    CATEGORY = "☠️ Deathshot Arsenal/🎬 Video"

    @classmethod
    def VALIDATE_INPUTS(cls, video, **kwargs):
        path = resolve_video_path(video)
        if not path or not os.path.isfile(path):
            return f"Video file not found or invalid: '{video}'"
        return True

    @classmethod
    def IS_CHANGED(cls, video, force_rate=0.0, custom_width=0, custom_height=0,
                   frame_load_cap=0, skip_first_frames=0, select_every_nth=1,
                   format="LTXV", ds_load_video_state=""):
        path = resolve_video_path(video)
        if not path or not os.path.isfile(path):
            return float("nan")
        try:
            mtime = os.path.getmtime(path)
            size = os.path.getsize(path)
            return f"{path}_{mtime}_{size}_{force_rate}_{custom_width}_{custom_height}_{frame_load_cap}_{skip_first_frames}_{select_every_nth}_{format}"
        except Exception:
            return float("nan")

    def load_video(self, video: str, force_rate: float = 0.0, custom_width: int = 0,
                   custom_height: int = 0, frame_load_cap: int = 0, skip_first_frames: int = 0,
                   select_every_nth: int = 1, format: str = "LTXV", ds_load_video_state: str = ""):
        path = resolve_video_path(video)
        if not path or not os.path.isfile(path):
            raise ValueError(f"[DS Load Video] Video file not found or inaccessible: '{video}'")

        # Input sanitization & validation (PRD Section 29)
        force_rate = max(0.0, float(force_rate or 0.0))
        custom_width = max(0, int(custom_width or 0))
        custom_height = max(0, int(custom_height or 0))
        frame_load_cap = max(0, int(frame_load_cap or 0))
        skip_first_frames = max(0, int(skip_first_frames or 0))
        select_every_nth = max(1, int(select_every_nth or 1))
        format_name = format if format in FORMAT_CONFIGS else "LTXV"
        format_cfg = FORMAT_CONFIGS[format_name]

        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise RuntimeError(f"[DS Load Video] Could not open video file: '{path}'")

        try:
            raw_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
            fps = raw_fps if (raw_fps > 0.0 and not math.isnan(raw_fps)) else 24.0
            orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

            # Read first frame to verify dimensions if metadata is zero
            if orig_w <= 0 or orig_h <= 0:
                ret, sample_frame = cap.read()
                if not ret or sample_frame is None:
                    raise RuntimeError(f"[DS Load Video] Could not retrieve frame data from '{path}'")
                orig_h, orig_w = sample_frame.shape[:2]
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

            duration = (total_frames / fps) if fps > 0 else 0.0

            # Calculate target dimensions with format downscale ratio
            downscale_ratio = format_cfg.get("dim", (1,))[0]
            target_w, target_h = calculate_target_size(orig_w, orig_h, custom_width, custom_height, downscale_ratio)

            base_frame_time = 1.0 / fps if fps > 0 else 1.0 / 24.0
            target_frame_time = (1.0 / force_rate) if force_rate > 0.0 else base_frame_time

            frames: List[torch.Tensor] = []
            curr_frame_idx = 0
            evaluated_idx = -1
            time_offset = target_frame_time

            while cap.isOpened():
                if force_rate > 0.0:
                    if time_offset < target_frame_time:
                        grabbed = cap.grab()
                        if not grabbed:
                            break
                        time_offset += base_frame_time
                    if time_offset < target_frame_time:
                        continue
                    time_offset -= target_frame_time

                ret, frame_bgr = cap.read()
                if not ret or frame_bgr is None:
                    break

                curr_frame_idx += 1
                if curr_frame_idx <= skip_first_frames:
                    continue

                evaluated_idx += 1
                if evaluated_idx % select_every_nth != 0:
                    continue

                # Convert BGR to RGB
                frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

                # Resize if target dimensions differ
                if (target_w, target_h) != (orig_w, orig_h):
                    interpolation = cv2.INTER_AREA if (target_w < orig_w and target_h < orig_h) else cv2.INTER_LANCZOS4
                    frame_rgb = cv2.resize(frame_rgb, (target_w, target_h), interpolation=interpolation)

                # Normalize to float32 [0.0, 1.0]
                arr = np.ascontiguousarray(frame_rgb, dtype=np.float32) / 255.0
                frames.append(torch.from_numpy(arr))

                if frame_load_cap > 0 and len(frames) >= frame_load_cap:
                    break
        finally:
            cap.release()

        if not frames:
            raise RuntimeError(f"[DS Load Video] No frames could be loaded from '{path}' with the specified settings.")

        # Format-specific frame count constraint (PRD Section 20)
        if "frames" in format_cfg and len(frames) > 0:
            div, mod = format_cfg["frames"][:2]
            if len(frames) % div != mod:
                valid_count = (len(frames) - mod) // div * div + mod
                if valid_count <= 0:
                    valid_count = mod if len(frames) >= mod else len(frames)
                frames = frames[:valid_count]

        loaded_frame_count = len(frames)
        images = torch.stack(frames, dim=0)

        # Calculate effective loaded frame rate and duration
        effective_step = target_frame_time * select_every_nth
        loaded_fps = (1.0 / effective_step) if effective_step > 0 else fps
        loaded_duration = loaded_frame_count * effective_step

        # Audio extraction
        audio_start_time = skip_first_frames * base_frame_time
        audio_duration = loaded_duration
        audio_data = extract_audio_track(path, start_time=audio_start_time, duration=audio_duration)

        # Video_Info output dictionary (PRD Section 2)
        video_info = {
            "source_fps": float(fps),
            "source_frame_count": int(total_frames),
            "source_duration": float(duration),
            "source_width": int(orig_w),
            "source_height": int(orig_h),
            "loaded_fps": float(loaded_fps),
            "loaded_frame_count": int(loaded_frame_count),
            "loaded_duration": float(loaded_duration),
            "loaded_width": int(target_w),
            "loaded_height": int(target_h),
            "format": format_name,
        }

        try:
            state = load_persisted_state()
            state["last_video"] = str(video)
            save_persisted_state(state)
        except Exception:
            pass

        return (images, audio_data, int(loaded_frame_count), video_info)


# ------------------------------------------------------------------
# Server API Routes (Directory scan, query, streaming preview)
# ------------------------------------------------------------------
def register_api_routes():
    try:
        prompt_server = server.PromptServer.instance
        routes = prompt_server.routes

        def _is_registered(method: str, path: str) -> bool:
            try:
                for r in routes:
                    if getattr(r, "method", "").upper() == method.upper() and getattr(r, "path", "") == path:
                        return True
            except Exception:
                pass
            return False

        if not _is_registered("POST", "/ds/load_video/query"):
            @routes.post("/ds/load_video/query")
            async def load_video_query(request):
                try:
                    payload = await request.json()
                except Exception:
                    payload = {}

                raw_path = payload.get("path", "")
                resolved = resolve_video_path(raw_path)

                if not resolved or not os.path.isfile(resolved):
                    return web.json_response({
                        "ok": False,
                        "error": "Video unavailable",
                        "path": raw_path,
                    })

                directory = os.path.dirname(resolved)
                filename = os.path.basename(resolved)

                # Scan directory for supported video files
                supported_files: List[str] = []
                try:
                    with os.scandir(directory) as entries:
                        for entry in entries:
                            if entry.is_file() and not entry.name.startswith("."):
                                ext = os.path.splitext(entry.name)[1].lower()
                                if ext in SUPPORTED_VIDEO_EXTENSIONS:
                                    supported_files.append(entry.name)
                except Exception as e:
                    logger.warning(f"Error reading directory '{directory}': {e}")
                    supported_files = [filename]

                supported_files.sort(key=natural_sort_key)
                try:
                    curr_index = supported_files.index(filename)
                except ValueError:
                    supported_files.insert(0, filename)
                    curr_index = 0

                has_prev = (curr_index > 0)
                has_next = (curr_index < len(supported_files) - 1)
                prev_file = supported_files[curr_index - 1] if has_prev else None
                next_file = supported_files[curr_index + 1] if has_next else None

                loop = asyncio.get_event_loop()
                metadata = await loop.run_in_executor(None, probe_video_metadata, resolved)

                # Return path relative to ComfyUI input folder if located inside input dir
                input_dir = folder_paths.get_input_directory()
                rel_name = filename
                try:
                    if os.path.commonpath([resolved, input_dir]) == input_dir:
                        rel_name = os.path.relpath(resolved, input_dir).replace("\\", "/")
                except Exception:
                    rel_name = resolved

                return web.json_response({
                    "ok": True,
                    "filename": filename,
                    "rel_name": rel_name,
                    "full_path": resolved,
                    "directory": directory,
                    "index": curr_index,
                    "total": len(supported_files),
                    "has_prev": has_prev,
                    "has_next": has_next,
                    "prev_file": prev_file,
                    "next_file": next_file,
                    "files": supported_files,
                    "metadata": metadata,
                })

        if not _is_registered("GET", "/ds/load_video/preview"):
            @routes.get("/ds/load_video/preview")
            async def load_video_preview(request):
                raw_path = request.query.get("path", "")
                resolved = resolve_video_path(raw_path)
                if not resolved or not os.path.isfile(resolved):
                    return web.Response(status=404, text="Video not found")

                ext = os.path.splitext(resolved)[1].lower()
                mime_map = {
                    ".mp4": "video/mp4",
                    ".webm": "video/webm",
                    ".mov": "video/quicktime",
                    ".mkv": "video/x-matroska",
                    ".avi": "video/x-msvideo",
                    ".wmv": "video/x-ms-wmv",
                    ".flv": "video/x-flv",
                    ".m4v": "video/x-m4v",
                }
                content_type = mime_map.get(ext) or mimetypes.guess_type(resolved)[0] or "video/mp4"
                safe_name = os.path.basename(resolved).replace('"', '\\"')
                headers = {
                    "Content-Type": content_type,
                    "Content-Disposition": f'inline; filename="{safe_name}"',
                    "Accept-Ranges": "bytes",
                }
                return web.FileResponse(resolved, headers=headers)

        if not _is_registered("GET", "/ds/load_video/state"):
            @routes.get("/ds/load_video/state")
            async def load_video_get_state(request):
                state = load_persisted_state()
                return web.json_response(state)

        if not _is_registered("POST", "/ds/load_video/state"):
            @routes.post("/ds/load_video/state")
            async def load_video_post_state(request):
                try:
                    payload = await request.json()
                except Exception:
                    payload = {}

                node_id = str(payload.get("node_id", ""))
                state = load_persisted_state()
                if node_id:
                    state["nodes"][node_id] = payload
                if payload.get("video"):
                    state["last_video"] = payload.get("video")
                save_persisted_state(state)
                return web.json_response({"ok": True})

    except Exception as e:
        logger.warning(f"[DS Load Video] Failed registering server routes: {e}")


register_api_routes()
