from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import json
import re
import urllib.request
import urllib.error

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="ASTORIE Business Risk Hub", version="0.3.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


def load_json(name: str):
    with open(BASE_DIR / "data" / name, "r", encoding="utf-8") as f:
        return json.load(f)


def compact_ico(value: str) -> str:
    return re.sub(r"\D", "", value or "")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    activities = load_json("activities.json")
    risks = load_json("risks.json")
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "activities": activities,
            "risks": risks,
            "activities_json": json.dumps(activities, ensure_ascii=False),
            "risks_json": json.dumps(risks, ensure_ascii=False),
        },
    )


@app.get("/api/activity/{activity_id}")
async def api_activity(activity_id: str):
    activities = load_json("activities.json")
    risks = load_json("risks.json")
    activity = next((a for a in activities if a["id"] == activity_id), None)
    if not activity:
        return JSONResponse({"ok": False, "error": "Činnost nebyla nalezena."}, status_code=404)
    risk_map = {r["id"]: r for r in risks}
    selected = [risk_map[rid] for rid in activity.get("defaultRiskIds", []) if rid in risk_map]
    return {"ok": True, "activity": activity, "risks": selected}


@app.get("/api/ares/{ico}")
async def api_ares(ico: str):
    ico_clean = compact_ico(ico)
    if len(ico_clean) != 8:
        return JSONResponse({"ok": False, "error": "IČO musí mít 8 číslic."}, status_code=400)

    url = f"https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico_clean}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "ASTORIE-Business-Risk-Hub/0.3"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return JSONResponse({"ok": False, "error": "Subjekt nebyl v ARES nalezen."}, status_code=404)
        return JSONResponse({"ok": False, "error": f"ARES vrátil chybu {e.code}."}, status_code=502)
    except Exception:
        return JSONResponse({"ok": False, "error": "ARES se nepodařilo načíst. Zkuste to prosím znovu."}, status_code=502)

    sidlo = data.get("sidlo") or {}
    normalized = {
        "ico": data.get("ico", ico_clean),
        "dic": data.get("dic", ""),
        "name": data.get("obchodniJmeno", ""),
        "address": sidlo.get("textovaAdresa", ""),
        "legalForm": data.get("pravniForma", ""),
        "createdAt": data.get("datumVzniku", ""),
        "municipality": sidlo.get("nazevObce", ""),
        "district": sidlo.get("nazevOkresu", ""),
        "region": sidlo.get("nazevKraje", ""),
    }
    return {"ok": True, "source": "ARES", "client": normalized, "raw": data}
