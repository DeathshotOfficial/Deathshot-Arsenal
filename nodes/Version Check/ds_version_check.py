"""Deathshot Arsenal - DS Version Check
Provides a real-time system and package version checker node.
"""
import os
import sys
import server
from aiohttp import web


class DS_VersionCheck:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    CATEGORY = "☠️ Deathshot Arsenal/💾 Utilities"
    OUTPUT_NODE = False

    def noop(self):
        return ()


try:
    instance = getattr(server.PromptServer, "instance", None)
    if instance and not getattr(server.PromptServer, "_ds_version_check_route", False):
        @instance.routes.get("/ds/version_check")
        async def ds_version_check_endpoint(request):
            # 1. ComfyUI Version
            comfyui_ver = "unknown"
            try:
                import comfyui_version
                comfyui_ver = getattr(comfyui_version, "__version__", "unknown")
            except Exception:
                pass

            # 2. PyTorch & CUDA Version
            pytorch_ver = "unknown"
            try:
                import torch
                torch_base = getattr(torch, "__version__", "unknown")
                cuda_ver = getattr(getattr(torch, "version", None), "cuda", None)
                if cuda_ver and "+cu" not in torch_base:
                    pytorch_ver = f"{torch_base} (CUDA {cuda_ver})"
                else:
                    pytorch_ver = torch_base
            except Exception:
                pass

            # 3. Frontend Version
            frontend_ver = "unknown"
            try:
                from importlib.metadata import version
                frontend_ver = version("comfyui-frontend-package")
            except Exception:
                try:
                    from app.frontend_management import FrontendManager
                    frontend_ver = FrontendManager.get_required_frontend_version() or "unknown"
                except Exception:
                    pass

            # 4. Deathshot Arsenal Version
            ds_ver = "1.0"
            try:
                import custom_nodes.DeathshotArsenal as ds_pkg
                ds_ver = getattr(ds_pkg, "__version__", "1.0")
            except Exception:
                try:
                    import DeathshotArsenal as ds_pkg
                    ds_ver = getattr(ds_pkg, "__version__", "1.0")
                except Exception:
                    pass

            return web.json_response({
                "ok": True,
                "comfyui": comfyui_ver,
                "frontend": frontend_ver,
                "pytorch": pytorch_ver,
                "deathshot": ds_ver,
            })

        server.PromptServer._ds_version_check_route = True
except Exception as e:
    print(f"[DS Version Check] Route registration warning: {e}", flush=True)

NODE_CLASS_MAPPINGS = {"DS_VersionCheck": DS_VersionCheck}
NODE_DISPLAY_NAME_MAPPINGS = {"DS_VersionCheck": "DS Version Check"}
