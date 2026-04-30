# Centrum obchodních rizik ASTORIE

MVP 0.13 – průvodce pro nováčky, náměty poradců, ukládání poptávek a DB.

## Render
Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Build command:

```bash
pip install -r requirements.txt
```

## Novinky 0.13
- samostatná sekce Průvodce,
- režim Nováček / Zkušený poradce,
- kontrola připravenosti poptávky,
- automatické otázky pro klienta podle rizik,
- sekce Náměty od poradců,
- ukládání námětů do PostgreSQL.
