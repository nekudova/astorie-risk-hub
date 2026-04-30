# ASTORIE Business Risk Hub

MVP 0.10 – ukládání klientů a více poptávek do databáze Render PostgreSQL.

## Render
Build command:
```bash
pip install -r requirements.txt
```
Start command:
```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```
Environment variable:
```text
DATABASE_URL=postgresql://...
```
