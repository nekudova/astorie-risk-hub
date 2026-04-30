from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="ASTORIE Business Risk Hub", version="0.2.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "staticky"), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "sablony"))

def load_json(name: str):
    with open(BASE_DIR / "data" / name, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    activities = load_json("activities.json")
    return templates.TemplateResponse("index.html", {"request": request, "activities": activities})

@app.get("/api/activity/{activity_id}")
async def api_activity(activity_id: str):
    activities = load_json("activities.json")
    risks = load_json("risks.json")
    activity = next((a for a in activities if a["id"] == activity_id), None)
    if not activity:
        return JSONResponse({"error": "Činnost nebyla nalezena."}, status_code=404)
    risk_map = {r["id"]: r for r in risks}
    selected = []
    for rid in activity.get("defaultRiskIds", []):
        if rid in risk_map:
            row = dict(risk_map[rid])
            row["active"] = True
            selected.append(row)
    return {"activity": activity, "risks": selected}
