# DeathshotArsenal/ds_nsfw.py

import os
import logging
import numpy as np
from PIL import Image, ImageFilter

# Lazy import
ort = None

# NudeNet Class Map
UNSAFE_CLASSES = {
    2,  # BUTTOCKS_EXPOSED
    3,  # FEMALE_BREAST_EXPOSED
    4,  # FEMALE_GENITALIA_EXPOSED
    6,  # ANUS_EXPOSED
    14  # MALE_GENITALIA_EXPOSED
}

class NSFWDetector:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(NSFWDetector, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self):
        if self.initialized:
            return
        
        self.session = None
        self.model_path = None
        self.cache = {} 
        self.available = False
        self.initialized = True
        self.input_name = None
        self.input_size = 320 
        
        node_path = os.path.dirname(os.path.realpath(__file__))
        models_dir = os.path.join(node_path, "models")
        
        # Priority: 640m (Best) -> 320m (Balanced) -> 320n (Fastest)
        priorities = [
            ("640m.onnx", 640),
            ("320m.onnx", 320),
            ("320n.onnx", 320),
            ("classifier.onnx", 224) 
        ]
        
        for filename, size in priorities:
            p = os.path.join(models_dir, filename)
            if os.path.exists(p):
                self.model_path = p
                self.input_size = size
                break
        
        try:
            global ort
            import onnxruntime as ort
            self.has_dependency = True
        except ImportError:
            self.has_dependency = False
            logging.warning("[DeathshotArsenal] onnxruntime not found.")

    def load_model(self):
        if not self.has_dependency or not self.model_path:
            return False
        
        if self.session is not None:
            return True

        try:
            # GPU OPTIMIZATION: Prioritize CUDA
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            opts.inter_op_num_threads = 1
            opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            
            self.session = ort.InferenceSession(self.model_path, opts, providers=providers)
            self.input_name = self.session.get_inputs()[0].name
            
            # Log which provider was actually accepted
            active_provider = self.session.get_providers()[0]
            logging.info(f"[DeathshotArsenal] Loaded NSFW Model: {os.path.basename(self.model_path)} (Size: {self.input_size}) | Device: {active_provider}")
            
            self.available = True
            return True
        except Exception as e:
            logging.error(f"[DeathshotArsenal] Model Load Error: {e}")
            self.available = False
            return False

    def preprocess(self, image):
        img = image.convert('RGB').resize((self.input_size, self.input_size), Image.Resampling.BILINEAR)
        img_data = np.array(img).astype(np.float32)
        img_data /= 255.0
        img_data = np.transpose(img_data, (2, 0, 1))
        img_data = np.expand_dims(img_data, axis=0)
        return img_data

    def is_nsfw(self, file_path, threshold=0.6):
        if not self.model_path or not self.has_dependency:
            return False

        try:
            stat = os.stat(file_path)
            key = (file_path, stat.st_mtime, self.input_size)
            if key in self.cache: return self.cache[key]
        except: return False

        if self.session is None:
            if not self.load_model(): return False

        try:
            try:
                img = Image.open(file_path)
                img.load() 
            except: return False 

            processed_img = self.preprocess(img)
            outputs = self.session.run(None, {self.input_name: processed_img})
            
            raw = outputs[0][0]
            class_scores = raw[4:, :] 
            
            is_unsafe = False
            for cls_idx in UNSAFE_CLASSES:
                if np.any(class_scores[cls_idx] > threshold):
                    is_unsafe = True
                    break
            
            self.cache[key] = is_unsafe
            if len(self.cache) > 2000:
                keys = list(self.cache.keys())[:500]
                for k in keys: del self.cache[k]
                
            return is_unsafe

        except Exception as e:
            logging.error(f"[DeathshotArsenal] Inference error: {e}")
            return False

    def blur_image(self, image, strength=15):
        return image.filter(ImageFilter.GaussianBlur(radius=strength))

detector = NSFWDetector()
