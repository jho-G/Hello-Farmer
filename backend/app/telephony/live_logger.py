"""Live telephony event logging buffer for real-time diagnostics and troubleshooting."""
import collections
import threading
import time
from datetime import datetime
from typing import Any

_MAX_LOGS = 300
_log_buffer: collections.deque = collections.deque(maxlen=_MAX_LOGS)
_lock = threading.Lock()
_event_counter = 0


def log_telephony_event(
    level: str,
    tag: str,
    message: str,
    call_id: str = "",
    details: dict[str, Any] | None = None,
):
    """Append a structured live telephony event to the ring buffer."""
    global _event_counter
    with _lock:
        _event_counter += 1
        event = {
            "id": _event_counter,
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "level": level.upper(),  # "INFO", "SPEECH", "AI", "AUDIO", "WARN", "ERROR"
            "tag": tag,
            "message": message,
            "call_id": call_id[:8] if call_id else "",
            "details": details or {},
        }
        _log_buffer.append(event)


def get_telephony_logs(limit: int = 100, since_id: int = 0) -> dict[str, Any]:
    """Retrieve the most recent telephony event logs."""
    with _lock:
        all_logs = list(_log_buffer)

    if since_id > 0:
        filtered = [l for l in all_logs if l["id"] > since_id]
    else:
        filtered = all_logs[-limit:] if limit > 0 else all_logs

    return {
        "total": len(all_logs),
        "logs": filtered,
        "latest_id": _event_counter,
        "timestamp": time.time(),
    }


def clear_telephony_logs():
    """Clear all entries in the telephony event log buffer."""
    with _lock:
        _log_buffer.clear()
