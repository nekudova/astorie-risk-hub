# ASTORIE Business Risk Hub

První funkční základ webové aplikace pro poptávky podnikatelského pojištění.

## Lokální spuštění

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Otevřít: http://127.0.0.1:8000

## Render

Build command:
```bash
pip install -r requirements.txt
```

Start command:
```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```
