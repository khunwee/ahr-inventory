"""Daily SQLite backup with rotation."""
import shutil
from datetime import datetime
from pathlib import Path
from .config import BASE_DIR, DATA_DIR

BACKUP_DIR = BASE_DIR / "backups"


def run_backup(keep: int = 30) -> str:
    BACKUP_DIR.mkdir(exist_ok=True)
    db = DATA_DIR / "inventory.db"
    if not db.exists():
        return ""
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"inventory_{stamp}.db"
    shutil.copy2(db, dest)
    backups = sorted(BACKUP_DIR.glob("inventory_*.db"))
    for old in backups[:-keep]:
        try:
            old.unlink()
        except Exception:
            pass
    return dest.name
