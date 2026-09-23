# คู่มือการนำระบบ AHR Inventory ขึ้น Free Host

เอกสารนี้แนะนำวิธีนำโปรแกรมขึ้นโฮสต์ฟรีที่ **ใช้งานได้จริง** (รองรับ Python, WebSocket, และเก็บข้อมูลถาวร)

> **สิ่งที่ต้องรู้ก่อน:** โฮสต์ฟรีส่วนใหญ่ "ลบไฟล์ทิ้งเมื่อรีสตาร์ท" (ephemeral) — ถ้าใช้ SQLite เป็นไฟล์
> ข้อมูลจะหายเมื่อเซิร์ฟเวอร์รีสตาร์ท ดังนั้นสำหรับใช้งานจริงต้องเก็บข้อมูลไว้ที่ **ฐานข้อมูลถาวร (Postgres)**
> หรือใช้โฮสต์ที่มี **ดิสก์ถาวร (volume)** — โปรแกรมเวอร์ชันนี้ **ปรับให้รองรับทั้งสองแบบแล้ว**

---

## โปรแกรมนี้พร้อมขึ้นโฮสต์แล้ว (แก้ไขให้เรียบร้อยแล้ว)

ในแพ็กเกจนี้เพิ่ม/แก้ไขให้พร้อม deploy แล้ว — **คุณไม่ต้องแก้โค้ดเพิ่ม** เพียงตั้งค่า environment:
- อ่านค่า `DB_URL`, `PORT`, `SECRET_KEY` จาก environment
- รองรับ **Postgres** (แปลง `postgres://` อัตโนมัติ) นอกเหนือจาก SQLite
- WebSocket ใช้ `wss://` อัตโนมัติเมื่อเป็น HTTPS
- ไฟล์สำหรับ deploy: `Dockerfile`, `Procfile`, `render.yaml`, `runtime.txt`
- `scripts/bootstrap.py` — โหลดข้อมูลตัวอย่างให้อัตโนมัติ **เฉพาะตอนฐานข้อมูลว่าง** (รีสตาร์ทกี่ครั้งก็ไม่ซ้ำ)

---

## ตัวเลือกโฮสต์ (เรียงตามที่แนะนำ)

| โฮสต์ | ฟรีจริง | ต้องใช้บัตร | ข้อมูลถาวร | ความยาก |
|---|---|---|---|---|
| **A. Render + Neon Postgres** ⭐ | ✅ | ❌ ไม่ต้อง | ✅ (Neon) | ง่าย |
| **B. Fly.io + Volume** | ✅ (โควตา) | ✅ ยืนยันบัตร | ✅ (SQLite บน volume) | กลาง |
| **C. Oracle Cloud Always Free VM** | ✅ ถาวร | ✅ ยืนยันบัตร | ✅ (VM จริง) | ยาก แต่ดีสุดสำหรับ production |
| D. Hugging Face Spaces (Docker) | ✅ | ❌ | ⚠️ ต้องต่อ Postgres ภายนอก | ง่าย |

---

## ตัวเลือก A (แนะนำ): Render + Neon Postgres — ฟรี ไม่ต้องใช้บัตร ข้อมูลถาวร

### ขั้นตอนที่ 1 — เตรียมโค้ดขึ้น GitHub
1. สร้าง repo ใหม่บน GitHub (จะ private ก็ได้)
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์ `ahr_inventory` ขึ้น repo
   (ไม่ต้องอัปโหลดโฟลเดอร์ `.venv`, `data`, `backups`)

### ขั้นตอนที่ 2 — สร้างฐานข้อมูล Postgres ฟรีที่ Neon
1. สมัคร https://neon.tech (ฟรี ไม่ต้องใช้บัตร)
2. สร้าง Project → คัดลอก **Connection string** (หน้าตาแบบ `postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`)

### ขั้นตอนที่ 3 — สร้าง Web Service ที่ Render
1. สมัคร https://render.com (ฟรี ไม่ต้องใช้บัตร) → **New → Web Service** → เชื่อม GitHub repo
2. ตั้งค่า:
   - **Runtime:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python -m scripts.bootstrap && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** Free
3. เพิ่ม **Environment Variables**:
   - `DB_URL` = (วาง Connection string จาก Neon)
   - `SECRET_KEY` = (สุ่มข้อความยาว ๆ เช่นจาก https://randomkeygen.com)
   - (ไม่บังคับ) `TIMEZONE=Asia/Bangkok`
4. กด **Create Web Service** → รอ build เสร็จ (~2-3 นาที)

### ขั้นตอนที่ 4 — เข้าใช้งาน
- เปิด URL ที่ Render ให้ (เช่น `https://ahr-inventory.onrender.com`)
- ล็อกอิน `admin` / `admin123` → ระบบบังคับตั้งรหัสใหม่ทันที
- ข้อมูลตัวอย่าง AHR จะถูกโหลดให้อัตโนมัติในครั้งแรก (หรือใช้เมนู "นำเข้าข้อมูล" อัปโหลดชุดของคุณเอง)

> **หมายเหตุ Render Free:** เซิร์ฟเวอร์จะ "หลับ" หลังไม่มีคนใช้ ~15 นาที และตื่นช้า ~50 วินาทีในครั้งถัดไป (ปกติของ free tier)
> ข้อมูลไม่หายเพราะเก็บที่ Neon แต่ **รูปภาพที่แนบตอนเบิก** เก็บบนดิสก์ชั่วคราวของ Render อาจหายเมื่อรีสตาร์ท
> (ถ้าต้องการให้รูปถาวรด้วย ใช้ตัวเลือก B/C หรือต่อ object storage ภายหลัง)

---

## ตัวเลือก B: Fly.io + Volume (คง SQLite, ข้อมูล+รูปถาวรทั้งหมด)

Fly.io มีโควตาฟรี (ต้องยืนยันบัตร แต่ไม่คิดเงินในโควตา) และมี **ดิสก์ถาวร (volume)** ทำให้ใช้ SQLite ได้เลย

1. ติดตั้ง flyctl → `fly auth signup`
2. ในโฟลเดอร์โปรเจกต์: `fly launch` (เลือกไม่ deploy ทันที) — จะสร้าง `fly.toml`
3. สร้าง volume: `fly volumes create ahr_data --size 1`
4. แก้ `fly.toml` ให้ mount volume และตั้ง DB ให้อยู่บน volume:
   ```toml
   [mounts]
     source = "ahr_data"
     destination = "/data"
   [env]
     DB_URL = "sqlite:////data/inventory.db"
     SECRET_KEY = "ใส่ค่าสุ่มยาว ๆ"
     PORT = "8080"
   [http_service]
     internal_port = 8080
   ```
5. `fly deploy` → เปิด URL ที่ได้ → ล็อกอิน admin/admin123

> ข้อดี: ข้อมูล + รูปภาพ + สำรองข้อมูล อยู่บน volume ถาวรทั้งหมด (เหมือนรันบนเครื่องจริง)

---

## ตัวเลือก C: Oracle Cloud Always Free VM (ดีที่สุดสำหรับ production)

Oracle ให้ VM ฟรีถาวร (Always Free) — เป็นเซิร์ฟเวอร์จริง รันได้ทุกอย่าง ข้อมูลถาวร 100%

1. สมัคร Oracle Cloud → สร้าง **Always Free VM** (Ubuntu 22.04, ARM Ampere หรือ x86)
2. เปิดพอร์ตใน Security List (เช่น 8770 หรือ 80/443)
3. SSH เข้า VM แล้วรัน:
   ```bash
   sudo apt update && sudo apt install -y python3-venv git
   git clone <your-repo> ahr && cd ahr
   python3 -m venv .venv && . .venv/bin/activate
   pip install -r requirements.txt
   python -m scripts.bootstrap
   nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8770 &
   ```
4. เปิด `http://<public-ip>:8770`
5. (แนะนำ) ตั้งเป็น systemd service + ใส่ nginx + ใบรับรอง HTTPS (Let's Encrypt) เพื่อความเสถียร

---

## ตัวแปร Environment ที่ใช้

| ตัวแปร | ความหมาย | ตัวอย่าง |
|---|---|---|
| `DB_URL` | ที่อยู่ฐานข้อมูล | `postgresql://...` (Neon) หรือ `sqlite:////data/inventory.db` |
| `SECRET_KEY` | กุญแจเข้ารหัส session (ต้องตั้งเป็นค่าสุ่มยาว) | `a-very-long-random-string` |
| `PORT` | พอร์ต (โฮสต์กำหนดให้เอง) | `$PORT` |
| `TIMEZONE` | เขตเวลาสำหรับสรุปสิ้นวัน | `Asia/Bangkok` |
| `MINIZINC_PATH` | (ไม่บังคับ) พาท MiniZinc | เว้นว่าง = ใช้ PuLP |

---

## ข้อควรระวังด้านความปลอดภัย (สำคัญ)

- การขึ้นโฮสต์สาธารณะ = ใครมี URL ก็เข้าหน้า login ได้ → **ต้องตั้ง `SECRET_KEY` เป็นค่าสุ่มที่ยาวและเป็นความลับ** และเปลี่ยนรหัส admin ทันที (ระบบบังคับอยู่แล้ว)
- พิจารณาว่าข้อมูลอะไหล่/ราคาเป็นความลับบริษัทหรือไม่ ถ้าอ่อนไหวมาก แนะนำ **ตัวเลือก C (VM ของตัวเอง)** มากกว่าฟรีโฮสต์สาธารณะ
- ควรตั้ง backup ของฐานข้อมูล (Neon มี auto-backup, Fly/Oracle ใช้โฟลเดอร์ `backups/`)

---

## สรุปคำแนะนำ

- **อยากลองเร็ว ไม่ต้องใช้บัตร ข้อมูลไม่หาย** → **ตัวเลือก A (Render + Neon)**
- **อยากได้ครบ (ข้อมูล+รูป+สำรอง ถาวร) และคง SQLite** → **ตัวเลือก B (Fly.io + volume)**
- **ใช้งานจริงจังระยะยาว ควบคุมเองทั้งหมด** → **ตัวเลือก C (Oracle Always Free VM)**

โค้ดพร้อมขึ้นทุกตัวเลือกแล้ว หากติดขั้นตอนไหนแจ้งได้ครับ เดี๋ยวช่วยไล่ทีละสเต็ป
