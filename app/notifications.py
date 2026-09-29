"""Multi-channel notifications. Config is read live from the DB-backed settings
store (falls back to .env), so admins can change channels from the UI.
Each channel is best-effort and isolated: one failing channel never blocks
the others or the request."""
import asyncio
import json
from typing import List
import httpx
from . import settings_store as cfg


class WSManager:
    """Tracks live WebSocket clients for real-time inventory / feed updates."""
    def __init__(self):
        self.clients: List = []

    async def connect(self, ws):
        await ws.accept()
        self.clients.append(ws)

    def disconnect(self, ws):
        if ws in self.clients:
            self.clients.remove(ws)

    async def broadcast(self, event: str, payload: dict):
        dead = []
        msg = json.dumps({"event": event, "data": payload}, default=str)
        for ws in list(self.clients):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = WSManager()


async def _discord(text: str):
    url = cfg.get("DISCORD_WEBHOOK")
    if not url:
        return
    async with httpx.AsyncClient(timeout=10) as c:
        await c.post(url, json={"content": text[:1900]})


async def _telegram(text: str):
    token = cfg.get("TELEGRAM_BOT_TOKEN")
    chat = cfg.get("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    async with httpx.AsyncClient(timeout=10) as c:
        await c.post(url, json={"chat_id": chat, "text": text, "parse_mode": "HTML"})


async def _line_push(text: str):
    token = cfg.get("LINE_CHANNEL_ACCESS_TOKEN")
    target = cfg.get("LINE_NOTIFY_TARGET")
    if not (token and target):
        return
    url = "https://api.line.me/v2/bot/message/push"
    headers = {"Authorization": f"Bearer {token}"}
    body = {"to": target, "messages": [{"type": "text", "text": text[:4900]}]}
    async with httpx.AsyncClient(timeout=10) as c:
        await c.post(url, headers=headers, json=body)


async def notify(event: str, text: str, payload: dict | None = None,
                 channels: tuple = ("ws", "discord", "telegram", "line")):
    """Fan out a message. `event`/`payload` drive the live web feed;
    `text` is the human-readable message for chat channels."""
    tasks = []
    if "ws" in channels:
        tasks.append(ws_manager.broadcast(event, payload or {"text": text}))
    if "discord" in channels:
        tasks.append(_discord(text))
    if "telegram" in channels:
        tasks.append(_telegram(text))
    if "line" in channels:
        tasks.append(_line_push(text))
    await asyncio.gather(*tasks, return_exceptions=True)


async def test_channel(channel: str) -> dict:
    """Send a test message to one channel; report success/failure to the UI."""
    configured = {
        "discord": bool(cfg.get("DISCORD_WEBHOOK")),
        "telegram": bool(cfg.get("TELEGRAM_BOT_TOKEN") and cfg.get("TELEGRAM_CHAT_ID")),
        "line": bool(cfg.get("LINE_CHANNEL_ACCESS_TOKEN") and cfg.get("LINE_NOTIFY_TARGET")),
    }
    if channel not in configured:
        return {"ok": False, "error": "unknown channel"}
    if not configured[channel]:
        return {"ok": False, "error": "ยังไม่ได้ตั้งค่าช่องทางนี้ครบ"}
    text = f"✅ ทดสอบการแจ้งเตือนจาก AHR Maintenance Inventory ({channel})"
    fn = {"discord": _discord, "telegram": _telegram, "line": _line_push}[channel]
    try:
        await fn(text)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
