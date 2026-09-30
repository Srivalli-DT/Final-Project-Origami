@echo off
REM Starts CreaseLens locally: backend on http://localhost:8000, frontend on http://localhost:5173
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
  echo Creating Python virtual environment...
  python -m venv backend\.venv
  backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
)
if not exist "frontend\node_modules" (
  echo Installing frontend packages...
  call npm --prefix frontend install
)
if not exist "frontend\.env.local" (
  echo VITE_API_URL=/> frontend\.env.local
)

start "CreaseLens backend" cmd /k "cd /d backend && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
start "CreaseLens frontend" cmd /k "npm --prefix frontend run dev"

echo Waiting for the servers to start...
timeout /t 6 /nobreak >nul
start http://localhost:5173
echo CreaseLens is running. Close the two server windows to stop it.
