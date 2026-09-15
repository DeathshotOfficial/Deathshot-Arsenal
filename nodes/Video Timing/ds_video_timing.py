"""DS Video Timing - duration / FPS / frame-count helper for video workflows."""


class DS_VideoTiming:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "duration": ("FLOAT", {"default": 5.0, "min": 0.1, "max": 3600.0, "step": 0.1}),
                "fps": ("FLOAT", {"default": 24.0, "min": 1.0, "max": 240.0, "step": 1.0}),
            }
        }

    RETURN_TYPES = ("FLOAT", "FLOAT", "INT")
    RETURN_NAMES = ("duration", "fps", "frames")
    FUNCTION = "calculate"
    CATEGORY = "☠️ Deathshot Arsenal/🎬 Video"
    DESCRIPTION = "Select duration and FPS; frames = duration × FPS, rounded to the nearest whole frame."

    def calculate(self, duration=5.0, fps=24.0):
        duration = max(0.1, min(3600.0, float(duration)))
        fps = max(1.0, min(240.0, float(fps)))
        frames = max(1, int(round(duration * fps)))
        return (duration, fps, frames)


NODE_CLASS_MAPPINGS = {"DS_VideoTiming": DS_VideoTiming}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_VideoTiming": "DS Video Timing"}
