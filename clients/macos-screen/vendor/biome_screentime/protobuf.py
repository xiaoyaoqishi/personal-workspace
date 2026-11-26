"""Minimal schema-less protobuf decoder (Biome payloads are protobuf messages)."""
import struct
from collections import defaultdict
from typing import Dict, List, Tuple

Field = Tuple[int, object]  # (wire type, value)


def _varint(b: bytes, i: int) -> Tuple[int, int]:
    shift = result = 0
    while True:
        if i >= len(b):
            raise ValueError("truncated varint")
        c = b[i]
        result |= (c & 0x7F) << shift
        i += 1
        if not c & 0x80:
            return result, i
        shift += 7
        if shift > 70:
            raise ValueError("bad varint")


def decode(b: bytes) -> Dict[int, List[Field]]:
    """Decode one message into ``{field_number: [(wire_type, value), ...]}``.

    Varints come back as int, fixed64 as float (double), length-delimited as bytes
    (nested messages are left undecoded), fixed32 as float.
    """
    out: Dict[int, List[Field]] = defaultdict(list)
    i = 0
    while i < len(b):
        key, i = _varint(b, i)
        field, wire = key >> 3, key & 7
        if field == 0:
            raise ValueError("field number 0")
        if wire == 0:
            v, i = _varint(b, i)
        elif wire == 1:
            v = struct.unpack_from("<d", b, i)[0]
            i += 8
        elif wire == 2:
            n, i = _varint(b, i)
            v = bytes(b[i:i + n])
            i += n
            if i > len(b):
                raise ValueError("truncated bytes")
        elif wire == 5:
            v = struct.unpack_from("<f", b, i)[0]
            i += 4
        else:
            raise ValueError("unsupported wire type %d" % wire)
        out[field].append((wire, v))
    return out


def text(v: object) -> str:
    """Printable UTF-8 text of a length-delimited value, or '' if it isn't text."""
    if not isinstance(v, (bytes, bytearray)):
        return ""
    try:
        s = v.decode("utf-8")
    except UnicodeDecodeError:
        return ""
    return s if s.isprintable() else ""
