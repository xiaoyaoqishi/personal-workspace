"""App.InFocus: one record each time an app gains or loses focus, on this Mac and on synced devices.

Stream layout::

    <source>/local/<segb files>                 this Mac
    <source>/remote/<DEVICE-UUID>/<segb files>  each device synced via iCloud
    …/tombstone/                                deletion markers (skipped)

Record fields used (protobuf, observed on macOS/iOS 17 – 27):
    3  1 when the app came into focus, 0 when it left
    4  event time, Cocoa seconds (double)
    6  app bundle id
    9  app version (string)
"""
import datetime as dt
import os
from dataclasses import dataclass
from typing import Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

from .protobuf import decode, text
from .segb import read_segb

DEFAULT_SOURCE = "~/Library/Biome/streams/restricted/App.InFocus"
COCOA_EPOCH = dt.datetime(2001, 1, 1, tzinfo=dt.timezone.utc)

# Focus records that aren't someone using an app: iPhone StandBy (charging clock),
# the Mac lock screen and screensaver. They still end the previous app's session.
SYSTEM_APPS = frozenset({"com.apple.springboard.stand-by", "com.apple.loginwindow", "com.apple.ScreenSaver.Engine"})
MAX_SESSION_SECONDS = 4 * 3600   # longer than this = screen left on; dropped

F_STARTING, F_TIME, F_APP, F_VERSION = 3, 4, 6, 9


def to_datetime(cocoa: float) -> dt.datetime:
    return COCOA_EPOCH + dt.timedelta(seconds=cocoa)


@dataclass(frozen=True)
class Device:
    id: str            # "local" or the remote device UUID
    path: str

    @property
    def short_id(self) -> str:
        return "local" if self.id == "local" else self.id.replace("-", "")[:8].upper()


@dataclass(frozen=True)
class Event:
    time: float        # Cocoa seconds
    app: str
    starting: bool
    device: str        # Device.id
    version: str = ""


@dataclass(frozen=True)
class Session:
    start: float       # Cocoa seconds
    end: float
    app: str
    device: str

    @property
    def seconds(self) -> float:
        return self.end - self.start


def devices(source: str = DEFAULT_SOURCE) -> List[Device]:
    """Stream folders under `source`: this Mac first, then each synced device."""
    root = os.path.expanduser(source)
    if not os.path.isdir(root):
        raise FileNotFoundError(f"{root} not found (or not readable: the process needs Full Disk Access)")
    found = []
    if os.path.isdir(os.path.join(root, "local")):
        found.append(Device("local", os.path.join(root, "local")))
    remote = os.path.join(root, "remote")
    if os.path.isdir(remote):
        for name in sorted(os.listdir(remote)):
            if os.path.isdir(os.path.join(remote, name)):
                found.append(Device(name, os.path.join(remote, name)))
    return found


def stream_files(device: Device) -> List[str]:
    """SEGB files of a device (named by creation timestamp), oldest first; tombstones skipped."""
    out = []
    for base, dirs, files in os.walk(device.path):
        dirs[:] = [d for d in dirs if d != "tombstone"]
        out += [os.path.join(base, f) for f in files if f.isdigit()]
    return sorted(out, key=lambda p: int(os.path.basename(p)))


def records(device: Device) -> Iterator[Tuple[Optional[float], Dict]]:
    for path in stream_files(device):
        for created, payload in read_segb(path):
            try:
                yield created, decode(payload)
            except (ValueError, IndexError):
                continue


def events(device: Device) -> Iterator[Event]:
    """Focus events of one device, in file order."""
    for created, rec in records(device):
        apps = [text(v) for w, v in rec.get(F_APP, []) if w == 2]
        app = next((a for a in apps if a), "")
        times = [v for w, v in rec.get(F_TIME, []) if w == 1]
        flags = [v for w, v in rec.get(F_STARTING, []) if w == 0]
        t = times[0] if times else created
        if not app or t is None or not flags:
            continue
        version = next((text(v) for w, v in rec.get(F_VERSION, []) if w == 2), "")
        yield Event(time=t, app=app, starting=bool(flags[0]), device=device.id, version=version)


def sessions(evts: Iterable[Event], exclude: Sequence[str] = SYSTEM_APPS,
             max_seconds: float = MAX_SESSION_SECONDS) -> List[Session]:
    """Pair focus-start/focus-end events (one device) into sessions.

    A session ends when its app loses focus or another app gains it. Sessions shorter than
    a second or longer than `max_seconds` are dropped, then `exclude`d apps are removed
    (they still close the session before them).
    """
    out: List[Session] = []
    cur: Optional[Tuple[float, str, str]] = None   # (start, app, device)
    for e in sorted(evts, key=lambda e: e.time):
        if e.starting:
            if cur and cur[1] != e.app:
                out.append(Session(cur[0], e.time, cur[1], cur[2]))
            if not cur or cur[1] != e.app:
                cur = (e.time, e.app, e.device)
        elif cur and cur[1] == e.app:
            out.append(Session(cur[0], e.time, cur[1], cur[2]))
            cur = None
    skip = set(exclude)
    return [s for s in out if 1 <= s.seconds <= max_seconds and s.app not in skip]
