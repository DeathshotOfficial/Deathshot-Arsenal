"""
DeathshotArsenal — DS GIF Generator
Encodes frame batches to animated GIF, WebP, or APNG with persistent settings and looping preview.
"""

import os
import re
import time
import shutil
import tempfile
import logging
import subprocess
from uuid import uuid4
from typing import Tuple, List, Dict, Any, Optional

try:
    import torch
except ImportError:
    torch = None

try:
    import numpy as np
except ImportError:
    np = None

try:
    from PIL import Image, ImageOps, features
except ImportError:
    Image = None
    ImageOps = None
    features = None

try:
    import folder_paths
except ImportError:
    folder_paths = None

try:
    import comfy.model_management
except ImportError:
    comfy = None

logger = logging.getLogger("DeathshotArsenal.GifGenerator")


def check_ffmpeg() -> Optional[str]:
    """Return absolute path to ffmpeg binary if available on system."""
    path = shutil.which("ffmpeg")
    if path:
        return path
    for p in ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"]:
        if os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


def check_gifsicle() -> Optional[str]:
    """Return absolute path to gifsicle binary if available."""
    return shutil.which("gifsicle")


def optimize_gif_with_gifsicle(path: str, compression: int) -> bool:
    """
    Post-process a GIF with gifsicle (-O3 + lossy). This is what web tools
    (ezgif etc.) do to get much smaller files than a raw ffmpeg/Pillow encode.
    Returns True when the file was replaced by a smaller optimized version.
    """
    gifsicle = check_gifsicle()
    if not gifsicle:
        return False
    out_path = path + ".opt.gif"
    lossy = int(round(max(0, min(100, compression)) * 0.8))
    attempts = []
    if lossy > 0:
        attempts.append([gifsicle, "-O3", f"--lossy={lossy}", "--no-comments", "-o", out_path, path])
    attempts.append([gifsicle, "-O3", "--no-comments", "-o", out_path, path])
    for cmd in attempts:
        try:
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=900)
            if res.returncode == 0 and os.path.isfile(out_path):
                if os.path.getsize(out_path) < os.path.getsize(path):
                    os.replace(out_path, path)
                    return True
                os.unlink(out_path)
                return False
        except Exception as e:
            logger.debug(f"[DS GIF] gifsicle attempt failed: {e}")
        if os.path.exists(out_path):
            try:
                os.unlink(out_path)
            except Exception:
                pass
    return False


# GIF delays are stored in 1/100 s. Delays <= 1cs (i.e. >50 FPS) are treated as
# 100 ms by browsers -> massive "slow motion". So GIF is capped at 50 FPS (2cs).
GIF_MAX_FPS = 50


WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def validate_path_security(raw_path: str) -> None:
    """Validate user-entered save path against security and OS filename constraints."""
    if not raw_path:
        return

    # Check for control characters
    for ch in raw_path:
        if ord(ch) < 32:
            raise ValueError(f"Save path contains illegal control character (ASCII {ord(ch)})")

    # Reject drive letter (e.g., C:, D:)
    if re.match(r"^[a-zA-Z]:", raw_path):
        raise ValueError("Absolute paths with drive letters are not allowed. Path must be relative to ComfyUI output directory.")

    # Reject leading slash/backslash (absolute paths)
    if raw_path.startswith("/") or raw_path.startswith("\\"):
        raise ValueError("Leading slash not allowed. Path must be relative to ComfyUI output directory.")

    # Reject illegal characters for Windows and cross-platform safety
    illegal_chars = set('<>:"|?*')
    found_illegal = [c for c in raw_path if c in illegal_chars]
    if found_illegal:
        raise ValueError(f"Save path contains illegal character(s): {', '.join(sorted(set(found_illegal)))}")

    # Check each segment
    normalized = raw_path.replace("\\", "/")
    segments = normalized.split("/")

    for seg in segments:
        if seg == "..":
            raise ValueError("Save path cannot contain '..' segments.")
        if seg.endswith(" ") or seg.endswith("."):
            raise ValueError(f"Path segment '{seg}' cannot end with a space or dot.")

        # Windows reserved device names check
        stem = seg.split(".")[0].upper()
        if stem in WINDOWS_RESERVED_NAMES:
            raise ValueError(f"Path segment '{seg}' uses reserved Windows device name '{stem}'.")


def parse_save_path(raw_path: str) -> Tuple[str, str]:
    """
    Parse folder and file prefix from user input string.
    Normalizes slashes and handles default fallbacks.
    """
    if raw_path is None:
        raw_path = ""
    raw = raw_path.strip()

    if not raw:
        return "Gif", "Gif"

    validate_path_security(raw)

    normalized = raw.replace("\\", "/")
    while "//" in normalized:
        normalized = normalized.replace("//", "/")

    had_trailing_slash = normalized.endswith("/")
    normalized = normalized.strip("/")
    if not normalized:
        return "", "Gif"

    if had_trailing_slash:
        return normalized, "Gif"

    parts = normalized.split("/")
    if len(parts) == 1:
        folder = ""
        prefix = parts[0]
    else:
        folder = "/".join(parts[:-1])
        prefix = parts[-1]

    if not prefix:
        prefix = "Gif"
    else:
        stem, ext = os.path.splitext(prefix)
        if ext and len(ext) <= 5:
            prefix = stem if stem else "Gif"

    return folder, prefix


def resolve_file_path(
    folder: str,
    prefix: str,
    fmt: str,
    save_mode: str,
    existing_files: str
) -> Tuple[str, str, str, str]:
    """
    Determine target folder, filename, full path, and save type ('output' or 'temp').
    """
    ext_map = {
        "GIF": ".gif",
        "WebP": ".webp",
        "APNG": ".png"
    }
    ext = ext_map.get(fmt, ".gif")

    if save_mode == "Preview only":
        save_type = "temp"
        base_dir = folder_paths.get_temp_directory() if folder_paths else tempfile.gettempdir()
        target_dir = os.path.join(base_dir, folder) if folder else base_dir
    else:
        save_type = "output"
        base_dir = folder_paths.get_output_directory() if folder_paths else os.getcwd()
        target_dir = os.path.join(base_dir, folder) if folder else base_dir

    try:
        os.makedirs(target_dir, exist_ok=True)
    except Exception as e:
        raise OSError(f"Cannot create directory '{target_dir}': {e}") from e

    if not os.access(target_dir, os.W_OK):
        raise PermissionError(f"Target folder '{target_dir}' is not writable.")

    if existing_files == "Overwrite":
        filename = f"{prefix}{ext}"
    else:
        # Auto-number
        existing_nums = []
        pattern = re.compile(rf"^{re.escape(prefix)}(\d+){re.escape(ext)}$", re.IGNORECASE)
        try:
            for item in os.listdir(target_dir):
                m = pattern.match(item)
                if m:
                    try:
                        existing_nums.append(int(m.group(1)))
                    except ValueError:
                        pass
        except Exception:
            pass

        next_num = max(existing_nums) + 1 if existing_nums else 1
        while True:
            candidate = f"{prefix}{next_num:04d}{ext}"
            candidate_path = os.path.join(target_dir, candidate)
            if not os.path.exists(candidate_path):
                filename = candidate
                break
            next_num += 1

    full_path = os.path.join(target_dir, filename)
    return target_dir, filename, full_path, save_type


def format_file_size(bytes_size: int) -> str:
    """Format bytes into human-readable string."""
    if bytes_size < 1024:
        return f"{bytes_size} B"
    elif bytes_size < 1024 * 1024:
        return f"{bytes_size / 1024:.1f} KB"
    else:
        return f"{bytes_size / (1024 * 1024):.1f} MB"


class DSGifGenerator:
    """
    DS GIF Generator node.
    Encodes ComfyUI IMAGE frame batches to animated GIF, WebP, or APNG.
    """

    CATEGORY = "☠️ Deathshot Arsenal/🎬 Video"
    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "frames": ("IMAGE",),
                "save_path": ("STRING", {"default": "Gif/Gif"}),
                "format": (["GIF", "WebP", "APNG"], {"default": "GIF"}),
                "save_mode": (["Save + preview", "Preview only"], {"default": "Save + preview"}),
                "existing_files": (["Auto-number", "Overwrite"], {"default": "Auto-number"}),
                "fps": ("INT", {"default": 24, "min": 1, "max": 60, "step": 1}),
                "loop_count": ("INT", {"default": 0, "min": 0, "max": 100, "step": 1}),
                "playback_order": (["Forward", "Reverse", "Ping-pong"], {"default": "Forward"}),
                "start_frame": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
                "end_frame": ("INT", {"default": 0, "min": 0, "max": 1000000, "step": 1}),
                "frame_step": ("INT", {"default": 1, "min": 1, "max": 1000000, "step": 1}),
                "max_side": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1}),
                "resample": (["Lanczos", "Bicubic", "Bilinear", "Nearest"], {"default": "Lanczos"}),
                "quality": ("INT", {"default": 90, "min": 1, "max": 100, "step": 1}),
                "compression": ("INT", {"default": 50, "min": 0, "max": 100, "step": 1}),
                "colors": ("INT", {"default": 256, "min": 2, "max": 256, "step": 1}),
                "dither": (["Bayer", "Floyd-Steinberg", "None"], {"default": "Bayer"}),
                "palette": (["Global", "Per frame"], {"default": "Global"}),
                "optimize": ("BOOLEAN", {"default": True}),
                "lossless": ("BOOLEAN", {"default": False}),
                "timing_mode": (["Sync speed (Real-time)", "Keep all frames"], {"default": "Sync speed (Real-time)"}),
                "source_fps": ("INT", {"default": 0, "min": 0, "max": 240, "step": 1}),
            },
            "optional": {
                "opt_video_info": ("VIDEO_INFO",),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
            },
        }

    def run(
        self,
        frames: torch.Tensor,
        save_path: str = "Gif/Gif",
        format: str = "GIF",
        save_mode: str = "Save + preview",
        existing_files: str = "Auto-number",
        fps: int = 24,
        loop_count: int = 0,
        playback_order: str = "Forward",
        start_frame: int = 0,
        end_frame: int = 0,
        frame_step: int = 1,
        max_side: int = 0,
        resample: str = "Lanczos",
        quality: int = 90,
        compression: int = 50,
        colors: int = 256,
        dither: str = "Bayer",
        palette: str = "Global",
        optimize: bool = True,
        lossless: bool = False,
        timing_mode: str = "Sync speed (Real-time)",
        source_fps: int = 0,
        opt_video_info: dict = None,
        unique_id: str = None,
        prompt: dict = None,
    ) -> Dict[str, Any]:
        start_time = time.time()

        # 1. Validate frames tensor
        if not isinstance(frames, torch.Tensor) or frames.ndim != 4:
            raise ValueError("No frames received. Connect a frame batch.")

        total_frames = frames.shape[0]
        if total_frames == 0:
            raise ValueError("No frames received. Connect a frame batch.")

        channels = frames.shape[3]
        if channels not in (1, 3, 4):
            raise ValueError(f"Invalid frame channel count ({channels}). Expected 1, 3, or 4.")

        # 2. Validate and clamp numeric parameters
        clamped_fps = max(1, min(60, int(fps)))
        if clamped_fps != fps:
            logger.warning(f"[DS GIF] Clamped fps from {fps} to {clamped_fps}")
        fps = clamped_fps
        requested_fps = fps
        if format == "GIF" and fps > GIF_MAX_FPS:
            fps = GIF_MAX_FPS  # >50 FPS cannot be stored in GIF (see GIF_MAX_FPS)

        loop_count = max(0, min(100, int(loop_count)))
        colors = max(2, min(256, int(colors)))
        quality = max(1, min(100, int(quality)))
        compression = max(0, min(100, int(compression)))
        max_side = max(0, min(8192, int(max_side)))
        frame_step = max(1, int(frame_step))
        start_frame = max(0, int(start_frame))
        end_frame = max(0, int(end_frame))

        # 3. Frame range & playback order
        if start_frame >= total_frames:
            raise ValueError(f"Selected frame range is empty ({total_frames} frames available).")

        effective_end = total_frames if (end_frame == 0 or end_frame > total_frames) else end_frame
        if effective_end <= start_frame:
            raise ValueError(f"Selected frame range is empty ({total_frames} frames available).")

        indices = list(range(start_frame, effective_end, frame_step))
        if not indices:
            raise ValueError(f"Selected frame range is empty ({total_frames} frames available).")
        warning_parts: List[str] = []

        # Resolve source FPS (auto-detection from opt_video_info or upstream prompt graph if source_fps <= 0)
        effective_source_fps = float(source_fps or 0)
        if effective_source_fps <= 0 and opt_video_info and isinstance(opt_video_info, dict):
            try:
                candidate = opt_video_info.get("source_fps") or opt_video_info.get("loaded_fps")
                if candidate and float(candidate) > 0:
                    effective_source_fps = float(candidate)
                    logger.info(f"[DS GIF] Using source FPS {effective_source_fps} from connected video_info")
            except Exception:
                pass

        if effective_source_fps <= 0 and prompt and unique_id:
            try:
                node_info = prompt.get(str(unique_id), {})
                frames_link = node_info.get("inputs", {}).get("frames")
                if isinstance(frames_link, list) and len(frames_link) >= 1:
                    upstream_id = str(frames_link[0])
                    # Follow reroute nodes in prompt graph
                    hops = 0
                    while hops < 10:
                        u_node = prompt.get(upstream_id, {})
                        u_cls = u_node.get("class_type", "")
                        if "Reroute" in u_cls:
                            u_in = u_node.get("inputs", {})
                            found = False
                            for k, v in u_in.items():
                                if isinstance(v, list) and len(v) >= 1:
                                    upstream_id = str(v[0])
                                    found = True
                                    break
                            if not found:
                                break
                            hops += 1
                        else:
                            break

                    upstream_node = prompt.get(upstream_id, {})
                    upstream_inputs = upstream_node.get("inputs", {})

                    up_nth = 1
                    try:
                        _n = upstream_inputs.get("select_every_nth", 1)
                        if isinstance(_n, (int, float)) and _n >= 1:
                            up_nth = int(_n)
                    except Exception:
                        up_nth = 1

                    _fr = upstream_inputs.get("force_rate", 0)
                    force_rate = float(_fr) if isinstance(_fr, (int, float)) else 0.0
                    if force_rate > 0:
                        effective_source_fps = force_rate / up_nth
                        logger.info(f"[DS GIF] Auto-detected source FPS {effective_source_fps} from upstream force_rate")
                    else:
                        video_name = upstream_inputs.get("video")
                        if video_name:
                            import cv2
                            vid_path = None
                            if folder_paths and hasattr(folder_paths, "get_annotated_filepath"):
                                try:
                                    vid_path = folder_paths.get_annotated_filepath(str(video_name))
                                except Exception:
                                    pass
                            if not vid_path and folder_paths:
                                try:
                                    cand = os.path.join(folder_paths.get_input_directory(), str(video_name))
                                    if os.path.isfile(cand):
                                        vid_path = cand
                                except Exception:
                                    pass
                            if not vid_path:
                                for candidate_dir in [
                                    "/home/godkiller/ComfyUI-Easy-Install/ComfyUI/input",
                                    os.path.join(os.getcwd(), "input"),
                                    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "input")
                                ]:
                                    cand = os.path.join(candidate_dir, str(video_name))
                                    if os.path.isfile(cand):
                                        vid_path = cand
                                        break
                            if not vid_path and os.path.isfile(str(video_name)):
                                vid_path = str(video_name)
                            if vid_path and os.path.isfile(vid_path):
                                cap = cv2.VideoCapture(vid_path)
                                if cap.isOpened():
                                    v_fps = cap.get(cv2.CAP_PROP_FPS)
                                    cap.release()
                                    if v_fps and v_fps > 0:
                                        effective_source_fps = round(float(v_fps) / up_nth, 3)
                                        logger.info(f"[DS GIF] Auto-detected source video FPS {effective_source_fps} from '{vid_path}'")
            except Exception as e:
                logger.debug(f"[DS GIF] Could not auto-detect source FPS from prompt: {e}")

        # Temporal speed synchronization (preserves 1.0x real-time duration)
        # NOTE: `indices` is already decimated by frame_step, so its real input rate is
        # source_fps / frame_step and its duration is len(indices) * frame_step / source_fps.
        sync_mode = timing_mode == "Sync speed (Real-time)"
        if sync_mode and effective_source_fps <= 0:
            msg = ("Source FPS unknown - all frames kept, so speed may be off. "
                   "Set 'Source FPS' to your video's FPS (e.g. 60) for real-time speed.")
            warning_parts.append(msg)
            logger.warning(f"[DS GIF] {msg}")

        if sync_mode and effective_source_fps > 0:
            in_fps = effective_source_fps / float(frame_step)
            # Never upsample (duplicating frames only bloats the file, speed stays correct via delay)
            if in_fps < float(fps):
                fps = max(1, int(round(in_fps))) if abs(in_fps - round(in_fps)) < 0.01 else fps
            slice_duration = len(indices) / in_fps
            if abs(in_fps - float(fps)) > 0.01:
                target_count = max(1, int(round(slice_duration * float(fps))))
                ratio = in_fps / float(fps)
                n_in = len(indices)
                sample_positions = [min(n_in - 1, int(i * ratio + 1e-6)) for i in range(target_count)]
                indices = [indices[p] for p in sample_positions]
            logger.info(
                f"[DS GIF] Synced playback speed: {len(indices)} frames "
                f"({effective_source_fps:g} fps source / step {frame_step} -> {fps} fps output, {slice_duration:.2f}s)"
            )

        if playback_order == "Reverse":
            indices = indices[::-1]
        elif playback_order == "Ping-pong":
            if len(indices) > 1:
                indices = indices + indices[-2:0:-1]

        selected_count = len(indices)
        if selected_count > 3000:
            raise ValueError(
                f"Selected {selected_count} frames, which exceeds the 3000 safety limit. "
                "Use Start frame, End frame, Every Nth frame, or Max side to reduce the frame count."
            )

        if selected_count == 1:
            msg = "Only 1 frame, the result is not animated."
            warning_parts.append(msg)
            logger.warning(f"[DS GIF] {msg}")

        if format == "GIF" and requested_fps > GIF_MAX_FPS:
            msg = (f"GIF cannot store {requested_fps} FPS (browsers turn delays <20ms into 100ms = slow motion). "
                   f"Output capped at {GIF_MAX_FPS} FPS with real-time speed kept. Use WebP for true 60 FPS.")
            warning_parts.append(msg)
            logger.warning(f"[DS GIF] {msg}")

        # 4. Filter map for resizing
        resample_map = {
            "Lanczos": Image.Resampling.LANCZOS,
            "Bicubic": Image.Resampling.BICUBIC,
            "Bilinear": Image.Resampling.BILINEAR,
            "Nearest": Image.Resampling.NEAREST,
        }
        resample_filter = resample_map.get(resample, Image.Resampling.LANCZOS)

        def send_progress(step: int, text: str, stage: str = "processing"):
            try:
                import server
                if hasattr(server, "PromptServer") and server.PromptServer.instance:
                    pct = int(min(100, max(0, round((step / max(1, selected_count)) * 100))))
                    server.PromptServer.instance.send_sync(
                        "ds_gif_progress",
                        {
                            "node_id": str(unique_id) if unique_id is not None else None,
                            "step": step,
                            "total": selected_count,
                            "percent": pct,
                            "text": text,
                            "stage": stage,
                        }
                    )
            except Exception:
                pass

        # 5. Timing calculation with error diffusion
        target_ms = 1000.0 / float(fps)
        durations: List[int] = []
        err = 0.0

        if format == "GIF":
            for _ in range(selected_count):
                desired = target_ms + err
                steps = max(2, int(round(desired / 10.0)))
                actual = steps * 10
                err = desired - actual
                durations.append(actual)
        else:
            for _ in range(selected_count):
                desired = target_ms + err
                actual = max(1, int(round(desired)))
                err = desired - actual
                durations.append(actual)

        # 6. Target dimensions & path resolution
        first_frame = frames[indices[0]]
        orig_h, orig_w = first_frame.shape[0], first_frame.shape[1]
        final_w, final_h = orig_w, orig_h

        if max_side > 0:
            longer = max(orig_w, orig_h)
            if longer > max_side:
                scale = max_side / float(longer)
                final_w = max(1, int(round(orig_w * scale)))
                final_h = max(1, int(round(orig_h * scale)))

        folder, prefix = parse_save_path(save_path)
        target_dir, filename, full_path, save_type = resolve_file_path(
            folder, prefix, format, save_mode, existing_files
        )

        temp_fd, temp_path = tempfile.mkstemp(
            prefix=f".dsgif_{uuid4().hex[:8]}_",
            suffix=f"_{filename}",
            dir=target_dir
        )
        os.close(temp_fd)

        ffmpeg_bin = check_ffmpeg()

        # 7. Fast Multithreaded Streaming Encoding via FFmpeg (for GIF, WebP, and APNG)
        # Avoids holding 600+ frames in RAM, bypasses slow single-threaded libwebp/Pillow CPU bottlenecks,
        # and applies industry-standard palette differencing and Bayer dithering.
        if ffmpeg_bin and format in ("GIF", "WebP", "APNG"):
            enc_w, enc_h = final_w, final_h  # GIF/WebP/APNG accept odd sizes; no padding needed
            ff_quiet = ["-hide_banner", "-loglevel", "error", "-nostats"]

            if format == "GIF":
                base_colors = max(2, min(256, int(colors)))
                q_factor = quality / 100.0
                comp_factor = 1.0 - (compression / 100.0) * 0.40
                effective_colors = min(base_colors, max(16, int(round(base_colors * q_factor * comp_factor))))

                dither_lower = str(dither).lower()
                if "bayer" in dither_lower:
                    bayer_scale = min(5, max(1, int(round(1 + (compression / 100.0) * 4))))
                    paletteuse_dither = f"dither=bayer:bayer_scale={bayer_scale}"
                elif "none" in dither_lower:
                    paletteuse_dither = "dither=none"
                else:
                    paletteuse_dither = "dither=floyd_steinberg"

                diff_arg = ":diff_mode=rectangle" if optimize else ""
                new_arg = ":new=1" if palette == "Per frame" else ""
                stats_mode = "single" if palette == "Per frame" else "diff"

                filter_chain = []
                if enc_w != orig_w or enc_h != orig_h:
                    filter_chain.append(f"scale={enc_w}:{enc_h}:flags=lanczos")

                scale_prefix = (",".join(filter_chain) + ",") if filter_chain else ""
                filter_complex = (
                    f"[0:v] {scale_prefix}split [s0][s1]; "
                    f"[s0] palettegen=max_colors={effective_colors}:stats_mode={stats_mode}:reserve_transparent=0 [p]; "
                    f"[s1][p] paletteuse={paletteuse_dither}{diff_arg}{new_arg}"
                )

                gif_loop = 0 if loop_count == 0 else loop_count
                cmd = [
                    ffmpeg_bin, "-y", *ff_quiet,
                    "-f", "rawvideo",
                    "-vcodec", "rawvideo",
                    "-s", f"{orig_w}x{orig_h}",
                    "-pix_fmt", "rgb24",
                    "-r", str(fps),
                    "-i", "-",
                    "-filter_complex", filter_complex,
                    "-loop", str(gif_loop),
                    temp_path
                ]

            elif format == "WebP":
                comp_level = min(4, max(0, int(round((compression / 100.0) * 4))))
                cmd = [
                    ffmpeg_bin, "-y", *ff_quiet,
                    "-f", "rawvideo",
                    "-vcodec", "rawvideo",
                    "-s", f"{orig_w}x{orig_h}",
                    "-pix_fmt", "rgb24",
                    "-r", str(fps),
                    "-i", "-",
                ]
                if enc_w != orig_w or enc_h != orig_h:
                    cmd.extend(["-vf", f"scale={enc_w}:{enc_h}:flags=lanczos"])
                cmd.extend([
                    "-c:v", "libwebp",
                    "-lossless", "1" if lossless else "0",
                    "-q:v", str(int(quality)),
                    "-compression_level", str(comp_level),
                    "-loop", str(int(loop_count)),
                    temp_path
                ])
            else:  # APNG
                cmd = [
                    ffmpeg_bin, "-y", *ff_quiet,
                    "-f", "rawvideo",
                    "-vcodec", "rawvideo",
                    "-s", f"{orig_w}x{orig_h}",
                    "-pix_fmt", "rgb24",
                    "-r", str(fps),
                    "-i", "-",
                ]
                if enc_w != orig_w or enc_h != orig_h:
                    cmd.extend(["-vf", f"scale={enc_w}:{enc_h}:flags=lanczos"])
                cmd.extend([
                    "-f", "apng",
                    "-c:v", "apng",
                    "-plays", str(int(loop_count)),
                    temp_path
                ])

            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                for i, frame_idx in enumerate(indices):
                    if comfy and hasattr(comfy.model_management, "throw_exception_if_processing_interrupted"):
                        comfy.model_management.throw_exception_if_processing_interrupted()

                    frame_t = frames[frame_idx]
                    frame_np = (frame_t.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
                    if frame_np.shape[2] == 1:
                        frame_np = np.repeat(frame_np, 3, axis=2)
                    elif frame_np.shape[2] == 4:
                        frame_np = frame_np[:, :, :3]

                    try:
                        proc.stdin.write(frame_np.tobytes())
                    except (BrokenPipeError, OSError):
                        break  # ffmpeg exited early; real error is reported below

                    pct = int(round(((i + 1) / max(1, selected_count)) * 85))
                    send_progress(i + 1, f"Encoding {format}: Frame {i + 1}/{selected_count} ({pct}%)", stage="encoding")

                try:
                    proc.stdin.close()
                except Exception:
                    pass
                send_progress(selected_count, f"Finalizing {format} container...", stage="finalizing")
                stderr_out = proc.stderr.read()
                proc.wait()
                if proc.returncode != 0:
                    raise RuntimeError(f"FFmpeg {format} encoding failed (code {proc.returncode}): {stderr_out.decode('utf-8', errors='ignore')}")

            finally:
                if proc.poll() is None:
                    try:
                        proc.kill()
                    except Exception:
                        pass

            if format == "GIF" and optimize:
                send_progress(selected_count, "Optimizing GIF (gifsicle lossy)...", stage="optimizing")
                if not optimize_gif_with_gifsicle(temp_path, compression):
                    if not check_gifsicle():
                        warning_parts.append("Install 'gifsicle' (apt/brew/choco install gifsicle) for 30-50% smaller GIFs.")

            shutil.move(temp_path, full_path)
            final_w, final_h = enc_w, enc_h

        else:
            # 8. Pillow-based Pipeline (Native GIF or Pillow WebP/APNG fallback)
            pil_frames: List[Image.Image] = []
            for i, frame_idx in enumerate(indices):
                if comfy and hasattr(comfy.model_management, "throw_exception_if_processing_interrupted"):
                    comfy.model_management.throw_exception_if_processing_interrupted()

                frame_t = frames[frame_idx]
                frame_np = (frame_t.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
                if frame_np.shape[2] == 1:
                    frame_np = np.repeat(frame_np, 3, axis=2)
                elif frame_np.shape[2] == 4:
                    frame_np = frame_np[:, :, :3]
                pil_img = Image.fromarray(frame_np, mode="RGB")

                if max_side > 0:
                    cur_w, cur_h = pil_img.size
                    longer = max(cur_w, cur_h)
                    if longer > max_side:
                        scale = max_side / float(longer)
                        new_w = max(1, int(round(cur_w * scale)))
                        new_h = max(1, int(round(cur_h * scale)))
                        pil_img = pil_img.resize((new_w, new_h), resample=resample_filter)

                final_w, final_h = pil_img.size
                pil_frames.append(pil_img)

                pct = int(round(((i + 1) / max(1, selected_count)) * 40))
                send_progress(i + 1, f"Preparing Frame {i + 1}/{selected_count} ({pct}%)", stage="preparing")

            try:
                if format == "GIF":
                    base_colors = max(2, min(256, int(colors)))
                    q_factor = quality / 100.0
                    comp_factor = 1.0 - (compression / 100.0) * 0.40
                    effective_colors = min(base_colors, max(16, int(round(base_colors * q_factor * comp_factor))))
                    dither_mode = Image.Dither.FLOYDSTEINBERG if dither == "Floyd-Steinberg" else Image.Dither.NONE

                    if palette == "Global":
                        sample_indices = np.linspace(0, len(pil_frames) - 1, min(16, len(pil_frames)), dtype=int)
                        sampled = [pil_frames[i] for i in sample_indices]
                        thumb_w = max(1, min(128, final_w))
                        thumb_h = max(1, min(128, final_h))
                        palette_canvas = Image.new("RGB", (thumb_w * len(sampled), thumb_h))
                        for i, smp in enumerate(sampled):
                            palette_canvas.paste(smp.resize((thumb_w, thumb_h), Image.Resampling.NEAREST), (i * thumb_w, 0))

                        palette_img = palette_canvas.quantize(colors=effective_colors, method=Image.Quantize.MEDIANCUT)
                        encoded_frames = []
                        for k, f in enumerate(pil_frames):
                            if comfy and hasattr(comfy.model_management, "throw_exception_if_processing_interrupted"):
                                comfy.model_management.throw_exception_if_processing_interrupted()
                            encoded_frames.append(f.quantize(colors=effective_colors, palette=palette_img, dither=dither_mode))
                            pct = 40 + int(round(((k + 1) / max(1, selected_count)) * 50))
                            send_progress(k + 1, f"Quantizing GIF: Frame {k + 1}/{selected_count} ({pct}%)", stage="encoding")
                    else:
                        encoded_frames = []
                        for k, f in enumerate(pil_frames):
                            if comfy and hasattr(comfy.model_management, "throw_exception_if_processing_interrupted"):
                                comfy.model_management.throw_exception_if_processing_interrupted()
                            encoded_frames.append(f.quantize(colors=effective_colors, method=Image.Quantize.MEDIANCUT, dither=dither_mode))
                            pct = 40 + int(round(((k + 1) / max(1, selected_count)) * 50))
                            send_progress(k + 1, f"Quantizing GIF: Frame {k + 1}/{selected_count} ({pct}%)", stage="encoding")

                    send_progress(selected_count, f"Saving GIF container...", stage="saving")
                    encoded_frames[0].save(
                        temp_path,
                        format="GIF",
                        save_all=True,
                        append_images=encoded_frames[1:],
                        duration=durations,
                        loop=loop_count,
                        optimize=bool(optimize),
                    )

                elif format == "WebP":
                    if not features.check("webp"):
                        raise RuntimeError("Pillow was compiled without WebP support.")

                    # Fast balanced WebP method for animations (avoids catastrophic method=6 CPU freeze)
                    fast_method = min(2, max(0, int((compression / 100.0) * 3)))
                    send_progress(selected_count, f"Compressing WebP ({final_w}x{final_h})...", stage="saving")
                    pil_frames[0].save(
                        temp_path,
                        format="WEBP",
                        save_all=True,
                        append_images=pil_frames[1:],
                        duration=durations,
                        loop=loop_count,
                        quality=quality,
                        lossless=bool(lossless),
                        method=fast_method,
                    )

                elif format == "APNG":
                    comp_level = min(9, max(1, int(round(6 + (float(compression) / 100.0) * 3))))
                    send_progress(selected_count, f"Compressing APNG ({final_w}x{final_h})...", stage="saving")
                    pil_frames[0].save(
                        temp_path,
                        format="PNG",
                        save_all=True,
                        append_images=pil_frames[1:],
                        duration=durations,
                        loop=loop_count,
                        compress_level=comp_level,
                    )

                else:
                    raise ValueError(f"Unsupported format: {format}")

                if format == "GIF" and optimize:
                    send_progress(selected_count, "Optimizing GIF (gifsicle lossy)...", stage="optimizing")
                    if not optimize_gif_with_gifsicle(temp_path, compression):
                        if not check_gifsicle():
                            warning_parts.append("Install 'gifsicle' for 30-50% smaller GIFs.")

                shutil.move(temp_path, full_path)

            except Exception as e:
                if os.path.exists(temp_path):
                    try:
                        os.unlink(temp_path)
                    except Exception:
                        pass
                logger.error(f"[DS GIF] Encoding failed: {e}", exc_info=True)
                raise e

        # 10. Result summary & logging
        file_size = os.path.getsize(full_path)
        formatted_size = format_file_size(file_size)
        elapsed = time.time() - start_time

        rel_path = f"{folder}/{filename}" if folder else filename
        logger.info(
            f"[DS GIF] Encoded {format} - {selected_count} frames - {final_w}x{final_h} - "
            f"{fps} fps - {rel_path} - {formatted_size} in {elapsed:.2f}s"
        )

        info = {
            "path": rel_path,
            "filename": filename,
            "frames": selected_count,
            "resolution": f"{final_w}x{final_h}",
            "width": final_w,
            "height": final_h,
            "bytes": file_size,
            "size": formatted_size,
            "fps": fps,
            "format": format,
            "quality": quality,
            "compression": compression,
            "elapsed": f"{elapsed:.2f}s",
            "warning": " ".join(warning_parts),
            "source_fps": effective_source_fps,
            "requested_fps": requested_fps,
        }

        return {
            "ui": {
                "card_preview": [{
                    "filename": filename,
                    "subfolder": folder,
                    "type": save_type
                }],
                "ds_gif_info": [info]
            }
        }
