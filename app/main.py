
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import json, pathlib, httpx

BASE = pathlib.Path(__file__).resolve().parent
app = FastAPI(title="ASTORIE Business Risk Hub")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE / "templates"))

def load_json(name):
    with open(BASE / "data" / name, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/activities")
async def api_activities():
    return load_json("activities.json")

@app.get("/api/risks/{activity_id}")
async def api_risks(activity_id: str):
    data = load_json("risks.json")
    return data.get(activity_id, [])

@app.get("/api/ares/{ico}")
async def api_ares(ico: str):
    ico = "".join(ch for ch in ico if ch.isdigit())
    if len(ico) != 8:
        return JSONResponse({"ok": False, "message": "IČO musí mít 8 číslic."}, status_code=400)
    url = f"https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return JSONResponse({"ok": False, "message": "Subjekt nebyl v ARES nalezen."}, status_code=404)
        d = r.json()
        sidlo = d.get("sidlo", {})
        adresa = d.get("sidlo", {}).get("textovaAdresa", "")
        return {
            "ok": True,
            "ico": d.get("ico", ico),
            "nazev": d.get("obchodniJmeno", ""),
            "adresa": adresa,
            "pravni_forma": d.get("pravniForma", ""),
            "datova_schranka": d.get("datovaSchranka", "")
        }
    except Exception as e:
        return JSONResponse({"ok": False, "message": "ARES se nepodařilo načíst. Zadejte údaje ručně."}, status_code=502)
