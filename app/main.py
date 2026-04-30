from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="ASTORIE Business Risk Hub", version="0.1.0")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

def load_json(name: str):
    with open(BASE_DIR / "data" / name, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    activities = load_json("activities.json")
    return templates.TemplateResponse("index.html", {"request": request, "activities": activities})

@app.get("/api/activities")
def api_activities():
    return JSONResponse(load_json("activities.json"))

@app.get("/api/risks/{activity_id}")
def api_risks(activity_id: str):
    activities = load_json("activities.json")
    risks = load_json("risks.json")
    selected = next((a for a in activities if a["id"] == activity_id), None)
    if not selected:
        return JSONResponse({"activity": None, "risks": []}, status_code=404)
    matched = [r for r in risks if activity_id in r.get("activities", [])]
    priority_order = {"povinné": 1, "kritické": 2, "důležité": 3, "doporučené": 4, "volitelné": 5}
    matched.sort(key=lambda r: priority_order.get(r.get("priority", ""), 99))
    return {"activity": selected, "risks": matched}
