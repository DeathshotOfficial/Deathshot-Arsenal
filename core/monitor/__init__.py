"""
Deathshot Arsenal - Hardware & Performance Monitor Core Package
"""

from .hardware import get_static_specs, query_dynamic_telemetry
from .llm_tracker import report_llm, get_llm_telemetry, configure_llm_backends
from .service import register_monitor_routes, free_vram_and_memory, touch_client

__all__ = [
    "get_static_specs",
    "query_dynamic_telemetry",
    "report_llm",
    "get_llm_telemetry",
    "configure_llm_backends",
    "register_monitor_routes",
    "free_vram_and_memory",
    "touch_client",
]
