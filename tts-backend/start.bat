@echo off
REM Startup script for Kokoro TTS Backend Service (Windows)

echo 🚀 Starting Kokoro TTS Backend Service...

REM Check if virtual environment exists
if not exist "venv" (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo 🔧 Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/upgrade dependencies
echo 📥 Installing dependencies...
python -m pip install -q --upgrade pip
pip install -q -r requirements.txt

REM Check if espeak-ng is installed (basic check)
where espeak-ng >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Warning: espeak-ng not found. Please install it:
    echo    Download from https://github.com/espeak-ng/espeak-ng/releases
    echo    Or use: choco install espeak-ng
)

REM Start the service
echo 🎤 Starting TTS service on port 8001...
python app.py

pause

