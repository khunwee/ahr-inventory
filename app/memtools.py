"""Keep memory flat on small hosts (Render free = 512 MB).

1) Limit glibc malloc arenas. Uvicorn runs sync endpoints in a pool of up to
   40 threads; by default glibc gives each busy thread its own arena, so memory
   used by one big request is kept per-thread and the process grows step by
   step. Two arenas is the usual fix (same effect as MALLOC_ARENA_MAX=2).
2) trim(): after a heavy job, run the garbage collector and hand free memory
   back to the operating system instead of keeping it reserved.
3) heavy_job(): backups, restores, imports and resets run one at a time.
"""
import contextlib
import ctypes
import gc
import threading

from fastapi import HTTPException

try:
    _libc = ctypes.CDLL("libc.so.6")
    _libc.mallopt(-8, 2)          # M_ARENA_MAX = 2
except Exception:                 # Windows / macOS / musl: nothing to tune
    _libc = None

_heavy = threading.Lock()


def trim():
    gc.collect()
    if _libc is not None:
        try:
            _libc.malloc_trim(0)
        except Exception:
            pass


@contextlib.contextmanager
def heavy_job(name="งานนี้"):
    if not _heavy.acquire(timeout=1):
        raise HTTPException(429, f"ระบบกำลังทำงานหนักอื่นอยู่ (สำรอง/กู้คืน/นำเข้า) — กรุณารอสักครู่แล้วลองใหม่")
    try:
        yield
    finally:
        _heavy.release()
        trim()
