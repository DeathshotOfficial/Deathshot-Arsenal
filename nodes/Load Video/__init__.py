from .ds_load_video import DS_LoadVideo, register_api_routes as register_load_video_routes

NODE_CLASS_MAPPINGS = {"DS_LoadVideo": DS_LoadVideo}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_LoadVideo": "DS Load Video"}

__all__ = ["DS_LoadVideo", "register_load_video_routes", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
