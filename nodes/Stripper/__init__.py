from .ds_stripper import DSStripper, _register_stripper_routes as register_stripper_routes

NODE_CLASS_MAPPINGS = {
    "DSStripper": DSStripper,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DSStripper": "DS Stripper",
}

__all__ = ["DSStripper", "NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "register_stripper_routes"]
