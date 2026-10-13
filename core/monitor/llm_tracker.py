"""
Deathshot Arsenal - Hardware & Performance Monitor: LLM Telemetry Tracker
Handles reporting hook from LLM nodes, sparkline history, and local server polling (Ollama, llama.cpp, LM Studio).
"""

import threading
import time
import urllib.request
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("DeathshotArsenal.HPM.LLM")

_MAX_SPARKLINE_SAMPLES = 18
_DEFAULT_BACKENDS = {
    "ollama": "http://127.0.0.1:11434",
    "llamacpp": "http://127.0.0.1:8080",
    "lmstudio": "http://127.0.0.1:1234",
}


class LLMTracker:
    def __init__(self):
        self._lock = threading.Lock()
        self._sparkline: List[float] = []
        self._state: Dict[str, Any] = {
            "status": "idle",             # "active" | "idle"
            "model_name": "",             # e.g. "Qwen2.5-7B-Instruct · Q5_K_M"
            "model_meta": "Local inference",
            "speed_tk_s": 0.0,
            "tokens": 0,
            "ttft_sec": None,
            "elapsed_sec": 0.0,
            "sparkline": [],              # last ~18 samples
            "avg_tk_s": 0.0,
            "backend": "None detected",
            "last_active_time": 0.0,
        }
        self._backend_urls = dict(_DEFAULT_BACKENDS)
        self._last_poll_time = 0.0
        self._poll_interval = 5.0

    def configure_backends(self, urls: Dict[str, str]):
        with self._lock:
            self._backend_urls.update(urls)

    def report_llm(
        self,
        model: str,
        tokens: int,
        seconds: float,
        ttft: Optional[float] = None,
        status: str = "active",
        format_name: str = "GGUF",
        offload: str = "GPU offload",
        backend: str = "Deathshot Core"
    ) -> Dict[str, Any]:
        """
        Public hook called by LLM nodes (Sensei, Describer, Randomizer, etc.)
        during and after generation.
        """
        now = time.time()
        with self._lock:
            sec = max(0.01, float(seconds))
            speed = round(float(tokens) / sec, 1) if tokens > 0 else 0.0

            if speed > 0 and (status == "active" or not self._sparkline or abs(self._sparkline[-1] - speed) > 0.05):
                self._sparkline.append(speed)
                if len(self._sparkline) > _MAX_SPARKLINE_SAMPLES:
                    self._sparkline = self._sparkline[-_MAX_SPARKLINE_SAMPLES:]

            avg_speed = round(sum(self._sparkline) / len(self._sparkline), 1) if self._sparkline else 0.0

            # Meta line: e.g. "GGUF · GPU offload · local inference"
            meta_parts = [p for p in (format_name, offload, "local inference") if p]
            model_meta = " · ".join(meta_parts)

            self._state.update({
                "status": status,
                "model_name": str(model or "Unknown Model"),
                "model_meta": model_meta,
                "speed_tk_s": speed,
                "tokens": int(tokens),
                "ttft_sec": round(float(ttft), 2) if ttft is not None else None,
                "elapsed_sec": round(sec, 1),
                "sparkline": list(self._sparkline),
                "avg_tk_s": avg_speed,
                "backend": backend,
                "last_active_time": now,
            })
            result = dict(self._state)

        # Immediately broadcast to connected frontend clients via WebSocket
        try:
            import server
            if hasattr(server, "PromptServer") and hasattr(server.PromptServer, "instance") and server.PromptServer.instance is not None:
                server.PromptServer.instance.send_sync("ds_hpm.llm", result)
        except Exception:
            pass

        return result

    def set_idle(self):
        with self._lock:
            self._state["status"] = "idle"

    def get_telemetry(self) -> Dict[str, Any]:
        now = time.time()
        with self._lock:
            # Auto-idle after 4 seconds without active reports
            if self._state["status"] == "active" and (now - self._state["last_active_time"] > 4.0):
                self._state["status"] = "idle"

            # If no node is reporting, poll external backends periodically
            if self._state["status"] == "idle" and not self._state["model_name"] and (now - self._last_poll_time > self._poll_interval):
                self._last_poll_time = now
                threading.Thread(target=self._poll_backends, daemon=True).start()

            return dict(self._state)

    def _poll_backends(self):
        """Polls Ollama, llama.cpp, or LM Studio if accessible."""
        # 1. Ollama (/api/ps or /api/tags)
        ollama_url = self._backend_urls.get("ollama", "").rstrip("/")
        if ollama_url:
            try:
                req = urllib.request.Request(f"{ollama_url}/api/ps", headers={"User-Agent": "DeathshotArsenal-HPM"})
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode())
                        models = data.get("models", [])
                        if models:
                            m_name = models[0].get("name", "")
                            with self._lock:
                                if self._state["status"] == "idle" and not self._state["model_name"]:
                                    self._state["model_name"] = m_name
                                    self._state["model_meta"] = "Ollama · local inference"
                                    self._state["backend"] = "Ollama"
                            return
            except Exception:
                pass

        # 2. llama.cpp server (/props)
        llamacpp_url = self._backend_urls.get("llamacpp", "").rstrip("/")
        if llamacpp_url:
            try:
                req = urllib.request.Request(f"{llamacpp_url}/props", headers={"User-Agent": "DeathshotArsenal-HPM"})
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode())
                        m_path = data.get("default_generation_settings", {}).get("model", "")
                        m_name = m_path.split("/")[-1].split("\\")[-1] if m_path else "llama.cpp server"
                        with self._lock:
                            if self._state["status"] == "idle" and not self._state["model_name"]:
                                self._state["model_name"] = m_name
                                self._state["model_meta"] = "llama.cpp server"
                                self._state["backend"] = "llama.cpp"
                        return
            except Exception:
                pass

        # 3. LM Studio (/v1/models)
        lmstudio_url = self._backend_urls.get("lmstudio", "").rstrip("/")
        if lmstudio_url:
            try:
                req = urllib.request.Request(f"{lmstudio_url}/v1/models", headers={"User-Agent": "DeathshotArsenal-HPM"})
                with urllib.request.urlopen(req, timeout=1.0) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode())
                        models = data.get("data", [])
                        if models:
                            m_name = models[0].get("id", "")
                            with self._lock:
                                if self._state["status"] == "idle" and not self._state["model_name"]:
                                    self._state["model_name"] = m_name
                                    self._state["model_meta"] = "LM Studio · local server"
                                    self._state["backend"] = "LM Studio"
                            return
            except Exception:
                pass


_GLOBAL_TRACKER = LLMTracker()


def report_llm(
    model: str,
    tokens: int,
    seconds: float,
    ttft: Optional[float] = None,
    status: str = "active",
    format_name: str = "GGUF",
    offload: str = "GPU offload",
    backend: str = "Deathshot Core"
) -> Dict[str, Any]:
    return _GLOBAL_TRACKER.report_llm(
        model=model,
        tokens=tokens,
        seconds=seconds,
        ttft=ttft,
        status=status,
        format_name=format_name,
        offload=offload,
        backend=backend
    )


def get_llm_telemetry() -> Dict[str, Any]:
    return _GLOBAL_TRACKER.get_telemetry()


def configure_llm_backends(urls: Dict[str, str]):
    _GLOBAL_TRACKER.configure_backends(urls)
