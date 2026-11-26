"""Read Apple Screen Time data (Biome App.InFocus streams) from macOS: this Mac and synced devices."""
__version__ = "0.1.0"

from .infocus import (DEFAULT_SOURCE, SYSTEM_APPS, Device, Event, Session, devices, events,  # noqa: E402
                      sessions, stream_files, to_datetime)
from .segb import SEGBError, read_segb  # noqa: E402

__all__ = ["DEFAULT_SOURCE", "SYSTEM_APPS", "Device", "Event", "Session", "SEGBError", "devices", "events",
           "read_segb", "sessions", "stream_files", "to_datetime", "__version__"]
