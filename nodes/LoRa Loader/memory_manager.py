# DS LoRa Loader — conservative cache management hooks
def clear_lora_caches():
    try:
        import comfy.model_management as mm
        cache = getattr(mm, "lora_cache", None)
        if hasattr(cache, "clear"):
            cache.clear()
    except Exception:
        pass

    try:
        import comfy.sd as sd
        for attr in ("lora_cache", "lora_loader"):
            obj = getattr(sd, attr, None)
            if hasattr(obj, "clear"):
                obj.clear()
    except Exception:
        pass
