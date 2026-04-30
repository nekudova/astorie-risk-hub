import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import psycopg2
import psycopg2.extras
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

BASE_DIR = os.path.dirname(__file__)
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

app = FastAPI(title="ASTORIE Business Risk Hub", version="0.11")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))


def _connect():
    if not DATABASE_URL:
        return None
    return psycopg2.connect(DATABASE_URL)


def init_db() -> bool:
    conn = _connect()
    if not conn:
        return False
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS clients (
                    id SERIAL PRIMARY KEY,
                    ico TEXT,
                    name TEXT NOT NULL,
                    legal_form TEXT,
                    address TEXT,
                    data_box TEXT,
                    contact_person TEXT,
                    contact_email TEXT,
                    contact_phone TEXT,
                    website TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(ico)
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS inquiries (
                    id SERIAL PRIMARY KEY,
                    client_id INTEGER REFERENCES clients(id),
                    title TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'rozpracováno',
                    adviser_email TEXT,
                    adviser_name TEXT,
                    activity_code TEXT,
                    activity_name TEXT,
                    insurance_start TEXT,
                    insurance_period TEXT,
                    turnover TEXT,
                    employees TEXT,
                    territory TEXT,
                    export_info TEXT,
                    selected_insurers JSONB DEFAULT '[]'::jsonb,
                    additional_requirements JSONB DEFAULT '[]'::jsonb,
                    risks JSONB DEFAULT '[]'::jsonb,
                    full_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                    id SERIAL PRIMARY KEY,
                    entity_type TEXT NOT NULL,
                    entity_id INTEGER,
                    action TEXT NOT NULL,
                    actor_email TEXT,
                    detail JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS catalog_settings (
                    key TEXT PRIMARY KEY,
                    value JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            for key, filename in [
                ('activities', 'activities.json'),
                ('risks', 'risks.json'),
                ('insurers', 'insurers.json'),
                ('advisers', 'advisers.json'),
                ('requirementTypes', 'requirement_types.json'),
            ]:
                cur.execute("SELECT 1 FROM catalog_settings WHERE key=%s", (key,))
                if not cur.fetchone():
                    cur.execute(
                        "INSERT INTO catalog_settings (key, value) VALUES (%s, %s::jsonb)",
                        (key, json.dumps(load_json(filename))),
                    )
        return True
    finally:
        conn.close()


@app.on_event("startup")
def startup_event():
    try:
        init_db()
    except Exception as exc:
        print(f"DB init skipped/failed: {exc}")


def load_json(filename: str) -> Any:
    with open(os.path.join(BASE_DIR, "data", filename), "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
def health():
    ok = False
    try:
        ok = init_db()
    except Exception:
        ok = False
    return {"ok": True, "database_connected": ok, "version": "0.11"}


def get_catalogs() -> Dict[str, Any]:
    fallback = {
        "activities": load_json("activities.json"),
        "risks": load_json("risks.json"),
        "insurers": load_json("insurers.json"),
        "advisers": load_json("advisers.json"),
        "requirementTypes": load_json("requirement_types.json"),
    }
    conn = _connect()
    if not conn:
        return fallback
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT key, value FROM catalog_settings")
            rows = cur.fetchall()
            for row in rows:
                fallback[row["key"]] = row["value"]
            return fallback
    except Exception as exc:
        print(f"Catalog DB fallback: {exc}")
        return fallback
    finally:
        conn.close()


@app.get("/api/catalog")
def catalog():
    return get_catalogs()


@app.get("/api/admin/catalogs")
def admin_catalogs():
    return {"ok": True, "catalogs": get_catalogs()}


@app.post("/api/admin/catalogs")
async def save_admin_catalogs(request: Request):
    payload = await request.json()
    conn = _connect()
    if not conn:
        raise HTTPException(status_code=503, detail="Databáze není připojena.")
    allowed = {"insurers", "advisers", "requirementTypes"}
    try:
        with conn, conn.cursor() as cur:
            for key in allowed:
                if key in payload:
                    cur.execute(
                        """
                        INSERT INTO catalog_settings (key, value, updated_at)
                        VALUES (%s, %s::jsonb, NOW())
                        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
                        """,
                        (key, json.dumps(payload[key])),
                    )
            cur.execute(
                "INSERT INTO audit_log (entity_type, action, actor_email, detail) VALUES (%s,%s,%s,%s::jsonb)",
                ("catalog", "update", payload.get("actor_email") or "", json.dumps({"keys": list(payload.keys())})),
            )
        return {"ok": True, "message": "Admin číselníky byly uloženy do databáze."}
    finally:
        conn.close()


@app.get("/api/ares/{ico}")
async def ares(ico: str):
    ico_clean = "".join(ch for ch in ico if ch.isdigit())
    if len(ico_clean) != 8:
        raise HTTPException(status_code=400, detail="IČO musí mít 8 číslic.")
    url = f"https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico_clean}"
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.get(url)
        if r.status_code == 404:
            raise HTTPException(status_code=404, detail="Subjekt nebyl v ARES nalezen.")
        r.raise_for_status()
        data = r.json()
        sidlo = data.get("sidlo") or {}
        adresa = sidlo.get("textovaAdresa") or ""
        return {
            "ico": data.get("ico") or ico_clean,
            "name": data.get("obchodniJmeno") or "",
            "legal_form": str(data.get("pravniForma") or ""),
            "address": adresa,
            "data_box": data.get("datovaSchranka") or "",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ARES není dostupný: {exc}")


def upsert_client(cur, client: Dict[str, Any]) -> int:
    ico = (client.get("ico") or "").strip()
    name = (client.get("name") or "Bez názvu klienta").strip()
    values = {
        "ico": ico or None,
        "name": name,
        "legal_form": client.get("legal_form") or "",
        "address": client.get("address") or "",
        "data_box": client.get("data_box") or "",
        "contact_person": client.get("contact_person") or "",
        "contact_email": client.get("contact_email") or "",
        "contact_phone": client.get("contact_phone") or "",
        "website": client.get("website") or "",
    }
    if ico:
        cur.execute(
            """
            INSERT INTO clients (ico, name, legal_form, address, data_box, contact_person, contact_email, contact_phone, website)
            VALUES (%(ico)s, %(name)s, %(legal_form)s, %(address)s, %(data_box)s, %(contact_person)s, %(contact_email)s, %(contact_phone)s, %(website)s)
            ON CONFLICT (ico) DO UPDATE SET
              name=EXCLUDED.name,
              legal_form=EXCLUDED.legal_form,
              address=EXCLUDED.address,
              data_box=EXCLUDED.data_box,
              contact_person=EXCLUDED.contact_person,
              contact_email=EXCLUDED.contact_email,
              contact_phone=EXCLUDED.contact_phone,
              website=EXCLUDED.website,
              updated_at=NOW()
            RETURNING id;
            """,
            values,
        )
    else:
        cur.execute(
            """
            INSERT INTO clients (name, legal_form, address, data_box, contact_person, contact_email, contact_phone, website)
            VALUES (%(name)s, %(legal_form)s, %(address)s, %(data_box)s, %(contact_person)s, %(contact_email)s, %(contact_phone)s, %(website)s)
            RETURNING id;
            """,
            values,
        )
    return cur.fetchone()[0]


@app.post("/api/inquiries")
async def save_inquiry(request: Request):
    payload = await request.json()
    conn = _connect()
    if not conn:
        # fallback so UI is still usable if DB is not connected
        return {"ok": True, "db": False, "id": None, "message": "Databáze není připojena. Data jsou pouze v prohlížeči."}
    try:
        with conn, conn.cursor() as cur:
            client_id = upsert_client(cur, payload.get("client") or {})
            inquiry_id = payload.get("id")
            title = payload.get("title") or f"Poptávka – {(payload.get('client') or {}).get('name') or 'klient'}"
            data = {
                "client_id": client_id,
                "title": title,
                "status": payload.get("status") or "rozpracováno",
                "adviser_email": (payload.get("adviser") or {}).get("email") or "",
                "adviser_name": (payload.get("adviser") or {}).get("name") or "",
                "activity_code": (payload.get("activity") or {}).get("code") or "",
                "activity_name": (payload.get("activity") or {}).get("name") or "",
                "insurance_start": (payload.get("questionnaire") or {}).get("insurance_start") or "",
                "insurance_period": (payload.get("questionnaire") or {}).get("insurance_period") or "",
                "turnover": (payload.get("questionnaire") or {}).get("turnover") or "",
                "employees": (payload.get("questionnaire") or {}).get("employees") or "",
                "territory": (payload.get("questionnaire") or {}).get("territory") or "",
                "export_info": (payload.get("questionnaire") or {}).get("export_info") or "",
                "selected_insurers": json.dumps(payload.get("selected_insurers") or []),
                "additional_requirements": json.dumps(payload.get("additional_requirements") or []),
                "risks": json.dumps(payload.get("risks") or []),
                "full_payload": json.dumps(payload),
            }
            if inquiry_id:
                data["id"] = inquiry_id
                cur.execute(
                    """
                    UPDATE inquiries SET
                      client_id=%(client_id)s, title=%(title)s, status=%(status)s,
                      adviser_email=%(adviser_email)s, adviser_name=%(adviser_name)s,
                      activity_code=%(activity_code)s, activity_name=%(activity_name)s,
                      insurance_start=%(insurance_start)s, insurance_period=%(insurance_period)s,
                      turnover=%(turnover)s, employees=%(employees)s, territory=%(territory)s, export_info=%(export_info)s,
                      selected_insurers=%(selected_insurers)s::jsonb,
                      additional_requirements=%(additional_requirements)s::jsonb,
                      risks=%(risks)s::jsonb,
                      full_payload=%(full_payload)s::jsonb,
                      updated_at=NOW()
                    WHERE id=%(id)s
                    RETURNING id;
                    """,
                    data,
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Poptávka nebyla nalezena.")
                saved_id = row[0]
                action = "update"
            else:
                cur.execute(
                    """
                    INSERT INTO inquiries (
                      client_id, title, status, adviser_email, adviser_name, activity_code, activity_name,
                      insurance_start, insurance_period, turnover, employees, territory, export_info,
                      selected_insurers, additional_requirements, risks, full_payload
                    ) VALUES (
                      %(client_id)s, %(title)s, %(status)s, %(adviser_email)s, %(adviser_name)s, %(activity_code)s, %(activity_name)s,
                      %(insurance_start)s, %(insurance_period)s, %(turnover)s, %(employees)s, %(territory)s, %(export_info)s,
                      %(selected_insurers)s::jsonb, %(additional_requirements)s::jsonb, %(risks)s::jsonb, %(full_payload)s::jsonb
                    ) RETURNING id;
                    """,
                    data,
                )
                saved_id = cur.fetchone()[0]
                action = "create"
            cur.execute(
                "INSERT INTO audit_log (entity_type, entity_id, action, actor_email, detail) VALUES (%s,%s,%s,%s,%s::jsonb)",
                ("inquiry", saved_id, action, data["adviser_email"], json.dumps({"title": title, "client_id": client_id})),
            )
        return {"ok": True, "db": True, "id": saved_id, "message": "Poptávka byla uložena do databáze."}
    finally:
        conn.close()


@app.get("/api/inquiries")
def list_inquiries():
    conn = _connect()
    if not conn:
        return {"ok": True, "db": False, "items": []}
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT i.id, i.title, i.status, i.activity_name, i.adviser_name, i.adviser_email,
                       i.created_at, i.updated_at, c.ico, c.name AS client_name
                FROM inquiries i
                LEFT JOIN clients c ON c.id = i.client_id
                ORDER BY i.updated_at DESC
                LIMIT 100;
                """
            )
            rows = cur.fetchall()
            for r in rows:
                for k in ("created_at", "updated_at"):
                    if r.get(k): r[k] = r[k].isoformat()
            return {"ok": True, "db": True, "items": rows}
    finally:
        conn.close()


@app.get("/api/inquiries/{inquiry_id}")
def get_inquiry(inquiry_id: int):
    conn = _connect()
    if not conn:
        raise HTTPException(status_code=503, detail="Databáze není připojena.")
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT full_payload FROM inquiries WHERE id=%s", (inquiry_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Poptávka nebyla nalezena.")
            return {"ok": True, "item": row["full_payload"]}
    finally:
        conn.close()
