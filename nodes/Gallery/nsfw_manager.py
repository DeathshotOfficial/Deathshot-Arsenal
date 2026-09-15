# DeathshotArsenal/nodes/Gallery/nsfw_manager.py
import os
import io
import time
import json
import logging
import threading
import urllib.request
import numpy as np
from PIL import Image, ImageFilter

_HERE = os.path.dirname(os.path.realpath(__file__))
_DS_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
MODELS_DIR = os.path.join(_DS_ROOT, "models")
CACHE_FILE = os.path.join(_DS_ROOT, ".cache", "nsfw_cache.json")

# Default high-quality model for auto-download (AdamCodd ViT INT4, ~55MB, fine-tuned, 1M downloads)
DEFAULT_MODEL_URL = "https://huggingface.co/AdamCodd/vit-base-nsfw-detector/resolve/main/onnx/model_q4.onnx"
DEFAULT_MODEL_FILENAME = "vit_nsfw_q4.onnx"

# NudeNet unsafe classes if YOLO format
UNSAFE_CLASSES = {
    2,  # BUTTOCKS_EXPOSED
    3,  # FEMALE_BREAST_EXPOSED
    4,  # FEMALE_GENITALIA_EXPOSED
    6,  # ANUS_EXPOSED
    14  # MALE_GENITALIA_EXPOSED
}


class NSFWManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(NSFWManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True
        self.session = None
        self.model_path = None
        self.model_type = None  # 'vit' or 'yolo'
        self.input_name = None
        self.input_size = 384
        self.is_downloading = False
        self.download_progress = 0
        self.download_error = None
        self._download_lock = threading.Lock()

        # In-memory cache
        self.cache = {}
        self._load_disk_cache()

        # Check existing models
        self.refresh_model_path()

    def _ensure_models_dir(self):
        os.makedirs(MODELS_DIR, exist_ok=True)
        return MODELS_DIR

    def refresh_model_path(self):
        """Scans for available models in DeathshotArsenal/models/ and nodes/NSFW/models/."""
        self._ensure_models_dir()
        candidate_dirs = [
            MODELS_DIR,
            os.path.join(_HERE, "..", "NSFW", "models"),
            os.path.join(_HERE, "models"),
        ]

        priorities = [
            # High-accuracy ViT models (AdamCodd / fine-tuned)
            ("vit_nsfw_q4.onnx", "vit", 384),
            ("model_q4.onnx", "vit", 384),
            ("model_int8.onnx", "vit", 384),
            ("model_quantized.onnx", "vit", 384),
            ("model.onnx", "vit", 384),
            # NudeNet detectors
            ("640m.onnx", "yolo", 640),
            ("320m.onnx", "yolo", 320),
            ("320n.onnx", "yolo", 320),
            ("classifier.onnx", "vit", 224),
            # Legacy detector fallback
            ("nsfw_detector.onnx", "vit", 224),
        ]

        found = None
        for d in candidate_dirs:
            if not os.path.isdir(d):
                continue
            for fname, mtype, sz in priorities:
                p = os.path.join(d, fname)
                if os.path.isfile(p) and os.path.getsize(p) > 1024 * 1024:  # At least 1MB
                    found = (p, mtype, sz)
                    break
            if found:
                break

        if found:
            self.model_path, self.model_type, self.input_size = found
            return True

        self.model_path = None
        self.model_type = None
        return False

    def is_model_available(self) -> bool:
        if self.model_path and os.path.isfile(self.model_path):
            return True
        return self.refresh_model_path()

    def load_model(self) -> bool:
        if not self.is_model_available():
            return False

        if self.session is not None:
            return True

        try:
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            opts.inter_op_num_threads = 1
            opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

            # Use CPUExecutionProvider to preserve GPU resources for ComfyUI workflows
            providers = ["CPUExecutionProvider"]
            self.session = ort.InferenceSession(self.model_path, opts, providers=providers)
            self.input_name = self.session.get_inputs()[0].name

            # Inspect input shape and layout (NHWC vs NCHW)
            inp = self.session.get_inputs()[0]
            shape = inp.shape
            if len(shape) == 4 and shape[3] == 3:
                self.layout = "NHWC"
                self.input_size = shape[1] if isinstance(shape[1], int) and shape[1] > 0 else 224
            elif len(shape) == 4 and shape[1] == 3:
                self.layout = "NCHW"
                if isinstance(shape[2], int) and shape[2] > 0:
                    self.input_size = shape[2]
                elif "vit" in os.path.basename(self.model_path).lower():
                    self.input_size = 384
                else:
                    self.input_size = 224
            else:
                self.layout = "NCHW"
                self.input_size = 384 if "vit" in os.path.basename(self.model_path).lower() else 224

            logging.info(f"[DS Gallery] Loaded NSFW Model: {os.path.basename(self.model_path)} (Size: {self.input_size}, Layout: {self.layout}, Type: {self.model_type})")
            return True
        except Exception as e:
            logging.error(f"[DS Gallery] Model load error: {e}")
            self.session = None
            return False

    def start_download(self):
        """Asynchronously download the lightweight NSFW detector model."""
        with self._download_lock:
            if self.is_downloading:
                return
            if self.is_model_available():
                return
            self.is_downloading = True
            self.download_progress = 0
            self.download_error = None

        thread = threading.Thread(target=self._download_worker, daemon=True)
        thread.start()

    def _download_worker(self):
        self._ensure_models_dir()
        dest_path = os.path.join(MODELS_DIR, DEFAULT_MODEL_FILENAME)
        tmp_path = dest_path + ".download"

        try:
            req = urllib.request.Request(
                DEFAULT_MODEL_URL,
                headers={"User-Agent": "DeathshotArsenal-DSGallery/1.0"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                total_len = int(resp.headers.get("Content-Length") or 57925254)
                downloaded = 0
                chunk_size = 128 * 1024

                with open(tmp_path, "wb") as out_file:
                    while True:
                        chunk = resp.read(chunk_size)
                        if not chunk:
                            break
                        out_file.write(chunk)
                        downloaded += len(chunk)
                        self.download_progress = min(99, int((downloaded / total_len) * 100))

            # Verify downloaded file
            if os.path.getsize(tmp_path) < 1024 * 1024:
                raise ValueError("Downloaded file is too small or corrupted")

            if os.path.exists(dest_path):
                os.remove(dest_path)
            os.replace(tmp_path, dest_path)

            self.refresh_model_path()
            self.load_model()
            self.download_progress = 100
            logging.info(f"[DS Gallery] NSFW model downloaded successfully to {dest_path}")
        except Exception as e:
            logging.error(f"[DS Gallery] NSFW model download failed: {e}")
            self.download_error = str(e)
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
        finally:
            self.is_downloading = False

    def get_status(self):
        return {
            "model_available": self.is_model_available(),
            "model_loaded": self.session is not None,
            "model_name": os.path.basename(self.model_path) if self.model_path else None,
            "is_downloading": self.is_downloading,
            "download_progress": self.download_progress,
            "download_error": self.download_error,
        }

    def _load_disk_cache(self):
        if os.path.isfile(CACHE_FILE):
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self.cache = data
            except Exception:
                self.cache = {}

    def _save_disk_cache(self):
        try:
            os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
            # Cap cache size to 10000 entries
            if len(self.cache) > 10000:
                keys = list(self.cache.keys())[:2000]
                for k in keys:
                    self.cache.pop(k, None)
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(self.cache, f)
        except Exception:
            pass

    def preprocess_single(self, pil_image: Image.Image) -> np.ndarray:
        img = pil_image.convert("RGB").resize((self.input_size, self.input_size), Image.Resampling.BILINEAR)
        img_data = np.array(img).astype(np.float32)

        if self.model_type == "yolo":
            img_data /= 255.0
            img_data = np.transpose(img_data, (2, 0, 1))
        else:
            if getattr(self, "layout", "NCHW") == "NHWC":
                img_data /= 255.0
            else:
                img_data /= 255.0
                mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
                std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
                img_data = (img_data - mean) / std
                img_data = np.transpose(img_data, (2, 0, 1))

        return img_data

    def preprocess(self, pil_image: Image.Image) -> np.ndarray:
        return np.expand_dims(self.preprocess_single(pil_image), axis=0)

    def get_scores_batch(self, file_paths: list) -> dict:
        """
        Fast batched scoring for multiple file paths.
        Uses parallel I/O, cached thumbnails, and a single batched ONNX forward pass.
        """
        if not file_paths:
            return {}

        results = {}
        to_infer = []

        # 1. Resolve cached scores immediately
        for p in file_paths:
            if not isinstance(p, str) or not os.path.isfile(p):
                results[p] = 0.0
                continue
            try:
                st = os.stat(p)
                ck = f"{os.path.abspath(p)}_{st.st_mtime}"
                if ck in self.cache:
                    val = self.cache[ck]
                    if isinstance(val, (int, float)):
                        results[p] = float(val)
                        continue
                to_infer.append((p, ck))
            except OSError:
                results[p] = 0.0

        if not to_infer:
            return results

        if not self.is_model_available() or not self.load_model():
            for p, _ in to_infer:
                results[p] = 0.0
            return results

        # 2. Parallel image loading & preprocessing
        import concurrent.futures
        from .thumbnail_cache import get_cache_key, CACHE_DIR
        from .gallery_scanner import get_media_type

        def _load_and_preprocess(item):
            path, ck = item
            img = None
            try:
                thumb_file = os.path.join(CACHE_DIR, get_cache_key(path))
                if os.path.isfile(thumb_file) and os.path.getsize(thumb_file) > 0:
                    try:
                        img = Image.open(thumb_file)
                    except Exception:
                        img = None

                if img is None:
                    mtype = get_media_type(path)
                    if mtype == "video":
                        from .thumbnail_cache import extract_video_frame
                        img = extract_video_frame(path)
                    else:
                        img = Image.open(path)

                tensor = self.preprocess_single(img)
                return path, ck, tensor, None
            except Exception as e:
                return path, ck, None, e
            finally:
                if img is not None:
                    try:
                        img.close()
                    except Exception:
                        pass

        max_workers = min(6, len(to_infer), os.cpu_count() or 4)
        tensors = []
        valid_items = []

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            for path, ck, tensor, err in executor.map(_load_and_preprocess, to_infer):
                if tensor is not None:
                    tensors.append(tensor)
                    valid_items.append((path, ck))
                else:
                    results[path] = 0.0

        if not tensors:
            return results

        # 3. Batched ONNX inference
        try:
            batch_tensor = np.stack(tensors, axis=0)
            outputs = self.session.run(None, {self.input_name: batch_tensor})

            raw_out = outputs[0]
            if len(raw_out.shape) == 2 and raw_out.shape[1] == 2:
                exp = np.exp(raw_out - np.max(raw_out, axis=1, keepdims=True))
                probs = exp / np.sum(exp, axis=1, keepdims=True)
                scores = probs[:, 1]
            elif self.model_type == "yolo":
                scores = []
                for b_idx in range(len(valid_items)):
                    raw_b = raw_out[b_idx]
                    class_scores = raw_b[4:, :]
                    s = 0.0
                    for cls_idx in UNSAFE_CLASSES:
                        cls_max = float(np.max(class_scores[cls_idx]))
                        if cls_max > s:
                            s = cls_max
                    scores.append(s)
            else:
                exp = np.exp(raw_out - np.max(raw_out, axis=-1, keepdims=True))
                probs = exp / np.sum(exp, axis=-1, keepdims=True)
                scores = probs[:, -1]

            for idx, (path, ck) in enumerate(valid_items):
                score = min(1.0, max(0.0, float(scores[idx])))
                results[path] = score
                if ck:
                    self.cache[ck] = score

            self._save_disk_cache()
        except Exception as e:
            logging.error(f"[DS Gallery] Batched NSFW inference failed: {e}")
            for path, ck in valid_items:
                results[path] = self.get_score(path)

        return results

    def get_score(self, file_path_or_image) -> float:
        """
        Returns raw NSFW probability score in range [0.0, 1.0].
        """
        if not self.is_model_available():
            return 0.0

        if self.session is None:
            if not self.load_model():
                return 0.0

        cache_key = None
        img = None

        if isinstance(file_path_or_image, str):
            file_path = file_path_or_image
            if not os.path.isfile(file_path):
                return 0.0
            try:
                st = os.stat(file_path)
                cache_key = f"{os.path.abspath(file_path)}_{st.st_mtime}"
                if cache_key in self.cache:
                    val = self.cache[cache_key]
                    if isinstance(val, (int, float)):
                        return float(val)
            except OSError:
                pass
        else:
            img = file_path_or_image

        try:
            if img is None:
                from .gallery_scanner import get_media_type
                mtype = get_media_type(file_path)
                if mtype == "video":
                    from .thumbnail_cache import extract_video_frame
                    img = extract_video_frame(file_path)
                else:
                    img = Image.open(file_path)

            input_tensor = self.preprocess(img)
            outputs = self.session.run(None, {self.input_name: input_tensor})
            nsfw_score = 0.0

            if self.model_type == "yolo":
                raw = outputs[0][0]
                class_scores = raw[4:, :]
                for cls_idx in UNSAFE_CLASSES:
                    cls_max = float(np.max(class_scores[cls_idx]))
                    if cls_max > nsfw_score:
                        nsfw_score = cls_max
            else:
                raw_out = outputs[0][0]
                if len(raw_out) == 2:
                    # ViT [sfw, nsfw]
                    exp = np.exp(raw_out - np.max(raw_out))
                    probs = exp / np.sum(exp)
                    nsfw_score = float(probs[1])
                elif len(raw_out) == 5:
                    # NSFWJS 5 classes: [0: Drawing, 1: Hentai, 2: Neutral, 3: Porn, 4: Sexy]
                    probs = np.array(raw_out, dtype=np.float32)
                    if np.min(probs) < 0 or np.max(probs) > 1.05:
                        exp = np.exp(probs - np.max(probs))
                        probs = exp / np.sum(exp)
                    # Exclude Sexy (index 4) so normal human portraits are never flagged!
                    nsfw_score = float(probs[1] + probs[3])
                else:
                    exp = np.exp(raw_out - np.max(raw_out))
                    probs = exp / np.sum(exp)
                    nsfw_score = float(probs[-1])

            nsfw_score = min(1.0, max(0.0, float(nsfw_score)))

            if cache_key:
                self.cache[cache_key] = nsfw_score
                # Save disk cache periodically
                if len(self.cache) % 20 == 0:
                    self._save_disk_cache()

            return nsfw_score
        except Exception as e:
            logging.error(f"[DS Gallery] NSFW inference error: {e}")
            return 0.0
        finally:
            if img is not None and isinstance(file_path_or_image, str):
                try:
                    img.close()
                except Exception:
                    pass

    def classify_image(self, file_path_or_image, threshold: float = 0.65) -> bool:
        """
        Evaluates whether media at file_path or PIL Image is NSFW.
        Returns bool.
        """
        return self.get_score(file_path_or_image) >= threshold

    def blur_image(self, image: Image.Image, strength: int = 25) -> Image.Image:
        """Applies Gaussian blur to image."""
        return image.filter(ImageFilter.GaussianBlur(radius=strength))

    def clear_cache(self):
        self.cache.clear()
        if os.path.exists(CACHE_FILE):
            try:
                os.remove(CACHE_FILE)
            except OSError:
                pass
        return {"cleared": True}


nsfw_manager = NSFWManager()
