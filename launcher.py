"""One-file launcher for packaging with PyInstaller.

Builds a double-click .exe that starts the server and opens the browser,
so end users never see a terminal or any code.

    pip install pyinstaller
    pyinstaller --onefile --name AHR-Inventory ^
        --add-data "web;web" --add-data "data;data" --add-data ".env;." launcher.py
"""
import threading
import time
import webbrowser
import uvicorn
from app.config import settings


def _open():
    time.sleep(2)
    webbrowser.open(f"http://localhost:{settings.PORT}")


if __name__ == "__main__":
    threading.Thread(target=_open, daemon=True).start()
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, log_level="info")
