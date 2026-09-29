# AHR Maintenance Inventory — container image for cloud hosting
FROM python:3.12-slim

WORKDIR /app

# system deps for weasyprint/pdf are NOT required at runtime; keep image slim
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# hosts inject $PORT; default 8770 for local docker runs
ENV PORT=8770

# On boot: create tables + seed admin (via app) and load sample data only if
# the database is empty, then start the web server on the host's port.
CMD ["sh", "-c", "python -m scripts.bootstrap && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8770}"]
