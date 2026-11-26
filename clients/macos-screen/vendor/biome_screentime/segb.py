"""Readers for Apple's SEGB files, the on-disk format of Biome streams.

Two layouts exist and both are handled:

* **v2** (current macOS/iOS): a 32-byte header starting with ``SEGB``, records from offset 32,
  and a trailer at the end of the file with one 16-byte entry per record
  (end offset relative to 32, state, creation time). Records start with a CRC32 of their payload,
  so a misread layout shows up as CRC failures instead of silently wrong data.
* **v1** (older systems): ``SEGB`` at byte 52 of a 56-byte header, then records with a 32-byte
  header each (length, state, two timestamps, padding), 8-byte aligned.

Record states: 1 = live, 3 = deleted, 4 = unused slot. Only live records are returned.
Times are Cocoa seconds (since 2001-01-01 UTC).
"""
import struct
import zlib
from typing import Iterator, Optional, Tuple

COCOA_MIN, COCOA_MAX = 4.0e8, 1.3e9  # sanity range for timestamps (2013 … 2042)


class SEGBError(ValueError):
    """The file is not laid out the way this reader expects."""


def read_segb(path: str) -> Iterator[Tuple[Optional[float], bytes]]:
    """Yield ``(creation_time_or_None, payload)`` for each live record in a SEGB file."""
    with open(path, "rb") as f:
        buf = f.read()
    if len(buf) < 32:
        return
    if buf[:4] == b"SEGB":
        yield from _v2(buf, path)
    elif len(buf) >= 56 and buf[52:56] == b"SEGB":
        yield from _v1(buf)
    # anything else (lock files, empty files) is not a stream file


def _ts(t: float) -> Optional[float]:
    return t if COCOA_MIN < t < COCOA_MAX else None


def _v2(buf: bytes, path: str) -> Iterator[Tuple[Optional[float], bytes]]:
    count = struct.unpack_from("<i", buf, 4)[0]
    if count <= 0:
        return
    trailer = len(buf) - 16 * count
    if trailer < 32:
        raise SEGBError("%s: bad SEGB v2 trailer" % path)
    entries = [struct.unpack_from("<iid", buf, trailer + 16 * i) for i in range(count)]
    entries = sorted((e for e in entries if e[0] > 0), key=lambda e: e[0])
    start, live, bad = 32, 0, 0
    for end_off, state, created in entries:
        end = 32 + end_off
        if end > trailer or end - start < 8:
            raise SEGBError("%s: SEGB v2 record out of bounds" % path)
        if state == 1:
            live += 1
            crc = struct.unpack_from("<I", buf, start)[0]
            payload = buf[start + 8:end]
            if zlib.crc32(payload) & 0xFFFFFFFF == crc:
                yield _ts(created), payload
            else:
                bad += 1
        start = (end + 3) & ~3
    if live and bad > max(3, live // 20):  # a few torn writes are normal; many = wrong layout
        raise SEGBError("%s: %d of %d records fail CRC (unknown SEGB layout)" % (path, bad, live))


def _v1(buf: bytes) -> Iterator[Tuple[Optional[float], bytes]]:
    end_of_data = struct.unpack_from("<i", buf, 0)[0]
    pos = 56
    while pos + 32 <= min(end_of_data, len(buf)):
        length, state, t1, _t2 = struct.unpack_from("<iidd", buf, pos)
        if length <= 0:
            break
        payload = buf[pos + 32:pos + 32 + length]
        if state == 1:
            yield _ts(t1), payload
        pos = (pos + 32 + length + 7) & ~7
