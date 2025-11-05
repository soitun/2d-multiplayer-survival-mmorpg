# Kokoro TTS Backend Service

Python FastAPI service for text-to-speech synthesis using Kokoro-82M model.

## Prerequisites

- **Python 3.10 - 3.12** (Python 3.13 is not yet supported by kokoro package)
- **espeak-ng** system dependency (for phoneme conversion)

### Check Your Python Version

```powershell
# Windows PowerShell
python --version

# Should show Python 3.10.x, 3.11.x, or 3.12.x
# If you have Python 3.13, you'll need to install Python 3.12 instead
```

If you have Python 3.13, you can:
1. **Install Python 3.12** alongside Python 3.13
2. **Use pyenv** (Windows) or **pyenv-win** to manage multiple Python versions
3. **Create virtual environment with Python 3.12:**
   ```powershell
   # If Python 3.12 is installed as python3.12 or py -3.12
   py -3.12 -m venv venv
   # or
   python3.12 -m venv venv
   ```

## Setup

### 1. Install Python Dependencies

**Windows (PowerShell):**
```powershell
# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# If you get an execution policy error, run this first:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install dependencies
pip install -r requirements.txt
```

**Windows (Command Prompt):**
```cmd
# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate.bat

# Install dependencies
pip install -r requirements.txt
```

**Linux/macOS:**
```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. System Dependencies

**Linux/macOS:**
```bash
sudo apt-get install espeak-ng  # Ubuntu/Debian
# or
brew install espeak-ng  # macOS
```

**Windows:**
- Download espeak-ng from: https://github.com/espeak-ng/espeak-ng/releases
- Add to PATH or install via chocolatey: `choco install espeak-ng`

### 3. Run the Service

```bash
python app.py
```

Or with uvicorn directly:
```bash
uvicorn app:app --host 0.0.0.0 --port 8001
```

The service will be available at `http://localhost:8001`

## API Endpoints

### POST /synthesize
Synthesize speech from text.

**Request:**
```json
{
  "text": "Hello, this is a test.",
  "voice": "af_heart",
  "lang_code": "a"
}
```

**Response:**
- WAV audio file (24kHz sample rate)
- Content-Type: `audio/wav`

### GET /voices
List available voices.

### GET /health
Health check endpoint.

## Environment Variables

- `PORT`: Server port (default: 8001)

## Notes

- First request may take longer as the model loads
- Audio is generated at 24kHz sample rate
- Supports up to 5000 characters per request
- See Kokoro documentation for full voice list: https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md

