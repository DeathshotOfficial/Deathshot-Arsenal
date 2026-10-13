from .ds_gif_generator import DSGifGenerator

DS_GifGenerator = DSGifGenerator

NODE_CLASS_MAPPINGS = {
    "DS_GifGenerator": DS_GifGenerator,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DS_GifGenerator": "DS GIF Generator",
}

__all__ = ["DSGifGenerator", "DS_GifGenerator", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

