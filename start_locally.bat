@echo off
setlocal

echo 🚀 Initializing UI Automation Tool (Local Mode)...
echo.

:: Check for Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Error: Node.js is not installed. Please install it from https://nodejs.org/
    pause
    exit /b 1
)

:: Server Setup
echo 📦 Checking Server dependencies...
if not exist "server\node_modules" (
    echo ⏬ Installing server dependencies (this may take a minute)...
    cd server && npm install && cd ..
)

:: Client Setup
echo 📦 Checking Client dependencies...
if not exist "client\node_modules" (
    echo ⏬ Installing client dependencies (this may take a minute)...
    cd client && npm install && cd ..
)

:: Start Backend
echo 🔥 Starting Backend Server (Port 5000)...
start cmd /k "cd server && npm start"

:: Start Frontend
echo 🖥️ Starting Frontend App (Port 3000)...
echo 💡 Once the browser opens, click 'Run Test' to see the automation window!
start cmd /k "cd client && npm run dev"

echo.
echo ✅ Setup initiated!
echo 1. Wait a few seconds for the servers to load.
echo 2. Open your browser to http://localhost:3000 (if it doesn't open automatically)
echo 3. Run your test and watch the real Chrome browser open!
echo.
pause
