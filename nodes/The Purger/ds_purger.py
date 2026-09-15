"""Deathshot Arsenal - DS The Purger

Zero-overhead inline passthrough utility node that triggers targeted or total
memory garbage collection (VRAM, RAM, Loaded Models, Execution Cache) at exact
points in execution.
"""

import gc
import torch
import comfy.model_management


class AnyType(str):
    """Universal wildcard type that compares equal to any other type."""

    def __ne__(self, __value: object) -> bool:
        return False

    def __eq__(self, __value: object) -> bool:
        return True


ANY = AnyType("*")


class DS_ThePurger:
    """Inline zero-mutation memory & cache management utility."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["All", "VRAM", "RAM", "Models", "Cache"], {"default": "All"}),
            },
            "optional": {
                "source": (ANY,),
            },
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("",)
    FUNCTION = "purge"
    CATEGORY = "☠️ Deathshot Arsenal/💾 Utilities"
    DESCRIPTION = "Zero-overhead inline passthrough utility to execute VRAM, RAM, Model, or Cache garbage collection."

    def purge(self, mode="All", source=None):
        # 1. Models: Free model graph bindings
        if mode in ("All", "Models"):
            try:
                comfy.model_management.unload_all_models()
            except Exception as e:
                print(f"[DS The Purger] Model unload warning: {e}", flush=True)

        # 2. Cache: Target model management cleanup and prompt cache
        if mode in ("All", "Cache"):
            try:
                comfy.model_management.cleanup_models()
                gc.collect(1)
            except Exception as e:
                print(f"[DS The Purger] Cache cleanup warning: {e}", flush=True)

        # 3. RAM: Clear dereferenced Python objects via full generation-2 GC
        if mode in ("All", "RAM"):
            try:
                gc.collect(2)
            except Exception as e:
                print(f"[DS The Purger] GC collect warning: {e}", flush=True)

        # 4. VRAM: Reclaim video memory allocations
        if mode in ("All", "VRAM"):
            try:
                comfy.model_management.soft_empty_cache()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    torch.cuda.ipc_collect()
                elif hasattr(torch, "mps") and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                    torch.mps.empty_cache()
            except Exception as e:
                print(f"[DS The Purger] VRAM empty warning: {e}", flush=True)

        # Direct passthrough with zero mutation
        return (source,)


NODE_CLASS_MAPPINGS = {"DS_ThePurger": DS_ThePurger}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_ThePurger": "DS The Purger"}
