@echo off
echo 🚀 Starting NoCodeTest locally...

echo 📦 Starting Backend Server (Port 5000)...
start cmd /k "cd server && npm start"

echo 🖥️ Starting Frontend App (Port 3000)...
start cmd /k "cd client && npm start"

echo.
echo ✅ Setup initiated!
echo 1. Wait a few seconds for the servers to load.
echo 2. Open your browser to http://localhost:3000
echo 3. Run your test and watch the real Chrome browser open!
echo.
pause
