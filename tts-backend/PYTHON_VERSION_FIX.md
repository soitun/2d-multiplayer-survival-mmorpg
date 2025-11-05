# Instructions for using Python 3.12 with Kokoro TTS

You have Python 3.13.1, but Kokoro requires Python 3.10-3.12.

## Solution: Install Python 3.12 and use it for this project

### Step 1: Download Python 3.12
1. Go to https://www.python.org/downloads/release/python-3120/
2. Download "Windows installer (64-bit)" for Python 3.12.0
3. Run the installer
4. **Important:** Check "Add Python 3.12 to PATH" during installation
5. You can keep Python 3.13 installed - they won't conflict

### Step 2: Create virtual environment with Python 3.12

**If Python 3.12 was added to PATH:**
```powershell
cd tts-backend
python3.12 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Or use py launcher (Windows):**
```powershell
cd tts-backend
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Step 3: Verify Python version in venv
```powershell
python --version
# Should show: Python 3.12.x
```

### Alternative: Use Docker (if you prefer)
If you don't want to install Python 3.12, you could use Docker, but that's more complex.

## Why Python 3.13 doesn't work
The kokoro package uses dependencies that haven't been updated for Python 3.13 yet. This is common with newer Python versions - packages need time to catch up.

