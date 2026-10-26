# MediMate IoT: Smart Pill Dispenser Prototype (expo build)

**Academic prototype. Not a certified medical device. Do not use it to manage real medication.**

Simulation-first. No ESP32, motor, or sensor is required. Everything runs on one Windows laptop.

## What is in this folder
- `backend/`: FastAPI + SQLite API, dispenser simulator, dose state machine, emergency workflow (simulated), tests
- `frontend/`: React + Vite + Tailwind + Recharts + React Three Fiber dashboard
- `docs/architecture.md`: architecture, database, state machine, API reference
- `docs/hardware-integration.md`: ESP32 + MQTT plan, topics, payloads
- `docs/expo-demo-and-testing.md`: 5-minute demo script, test checklist, evaluation metrics, limitations

## Quick start (Windows, one time)
1. Install **Python 3.11+** (https://www.python.org, tick "Add to PATH") and **Node.js 20 LTS** (https://nodejs.org).
2. Open this folder in VS Code (File > Open Folder).

## Run the app (two terminals)
**Terminal 1: backend**
```bat
cd medimate-iot\backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m pytest -q
uvicorn app.main:app --reload --port 8000
```
Or double-click `start-backend.bat` after the first run. Check http://localhost:8000/api/health.

**Terminal 2: frontend**
```bat
cd medimate-iot\frontend
copy .env.example .env
npm install
npm run dev
```
Or double-click `start-frontend.bat`. Open **http://localhost:5173**.

PowerShell users: replace `copy` with `Copy-Item` and `.venv\Scripts\activate` with `.venv\Scripts\Activate.ps1`.

## If something goes wrong
- Banner says **BACKEND NOT RUNNING**: start Terminal 1 and wait for "Application startup complete".
- `pip` or `npm` not found: reopen the terminal after installing Python or Node.
- Port already in use: close the other program, or run uvicorn with `--port 8001` and set `VITE_API_PROXY_TARGET=http://localhost:8001` in `frontend\.env`.
- Delete `backend\medimate.db` to reset all data to the demo schedule.

## Configuration (backend/.env)
Copy `backend/.env.example` to `backend/.env`. Defaults are safe for the expo: simulation mode, demo data on, demo clock on.

## Deploy to Render
1. Push this project, including the root `render.yaml`, to a GitHub repository.
2. In the [Render Dashboard](https://dashboard.render.com), choose **New > Blueprint**, connect that repository, and deploy the blueprint.
3. Open https://medimate-web.onrender.com. The API health check is at https://medimate-api.onrender.com/api/health.

The blueprint creates a public static frontend and API using the free service plan. Free services can sleep when idle, and this prototype's SQLite data is not persistent across service restarts or redeploys. Use simulation mode only; this is not for managing real medication. If Render reports either service name is unavailable, update its `name` in `render.yaml` and the corresponding API/CORS URLs there before deploying.

## Demo data
The seeded medicines are **placeholders** ("Demo Medicine A/B/C") with placeholder instructions. MediMate does not recommend doses. Enter real instructions only from your own prescription, and never use this prototype for real medication.
