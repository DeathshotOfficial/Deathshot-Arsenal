# DeathshotArsenal/nodes/Load Images From Folder/auto_queue_runner.py
import server

class AutoQueueRunner:
    """
    Coordinator for the automated execution loop.
    Emits execution events to the frontend via PromptServer's WebSocket.
    """
    @staticmethod
    def notify_progress(node_id: str, current_index: int, total: int, filename: str):
        try:
            if hasattr(server, "PromptServer") and server.PromptServer.instance:
                server.PromptServer.instance.send_sync("ds_folder_loader_progress", {
                    "node_id": str(node_id),
                    "current_index": int(current_index),
                    "total": int(total),
                    "filename": str(filename),
                })
        except Exception:
            pass

    @staticmethod
    def notify_complete(node_id: str, total_processed: int):
        try:
            if hasattr(server, "PromptServer") and server.PromptServer.instance:
                server.PromptServer.instance.send_sync("ds_folder_loader_complete", {
                    "node_id": str(node_id),
                    "total_processed": int(total_processed),
                })
        except Exception:
            pass
