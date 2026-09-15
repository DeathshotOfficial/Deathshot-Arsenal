from .ds_interpolation import (
    DS_Interpolation,
    register_interpolation_routes,
)

NODE_CLASS_MAPPINGS = {"DS_Interpolation": DS_Interpolation}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_Interpolation": "DS Interpolation"}

__all__ = [
    "DS_Interpolation",
    "register_interpolation_routes",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
