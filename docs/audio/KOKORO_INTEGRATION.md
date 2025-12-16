# Kokoro TTS Integration Guide

This guide explains how to set up and use Kokoro TTS for voice synthesis in your game, including both local development and production deployment.

## Architecture

The integration consists of:
1. **Python Backend Service** (`tts-backend/`) - FastAPI service running Kokoro TTS model
2. **TypeScript Client Service** (`client/src/services/kokoroService.ts`) - Client wrapper for Kokoro API
3. **VoiceInterface Integration** - Auto-detects and uses Kokoro when available
4. **Warmup Audio** - Plays diegetic audio when TTS service is cold (first request)

## Quick Start (Local Development)

### 1. Set Up Python Backend

**Windows (PowerShell):**
```powershell
# Navigate to backend directory
cd tts-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# If you get an execution policy error, run this first:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install dependencies
pip install -r requirements.txt

# Install system dependencies (see tts-backend/README.md)

# Run the service
python app.py
```

**Windows (Command Prompt):**
```cmd
cd tts-backend
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
python app.py
```

**Linux/macOS:**
```bash
cd tts-backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

The service will start on `http://localhost:8001` by default.

### 2. Configure Frontend

Add to your `.env` file (or create one in project root):

```env
# TTS Provider: 'kokoro' | 'auto' (default: kokoro)
VITE_TTS_PROVIDER=kokoro

# Kokoro backend URL (default: http://localhost:8001)
VITE_KOKORO_BASE_URL=http://localhost:8001
```

### 3. Start Your Application

```bash
npm run dev
```

---

## Production Deployment (Railway)

### Step 1: Deploy TTS Backend to Railway

1. **Create New Railway Project:**
   - Go to [Railway Dashboard](https://railway.app/dashboard)
   - Click **"New Project"** → **"Deploy from GitHub repo"**
   - Select your repository

2. **Configure Service Settings:**
   - Click on the deployed service
   - Go to **Settings** tab
   - Set **Root Directory** to: `tts-backend`
   - Railway will auto-detect the Dockerfile

3. **Generate Public Domain:**
   - Go to **Settings** → **Networking** → **Public Networking**
   - Click **"Generate Domain"**
   - Note down the URL (e.g., `https://your-tts-backend.up.railway.app`)

### Step 2: Configure CORS for Production

The `tts-backend/app.py` already includes CORS configuration for production domains:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.brothandbullets.com",
        "https://brothandbullets.com",
        "http://localhost:5173",  # Local dev
        "http://localhost:8001",
        "http://localhost:8002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**If using a different domain,** update `allow_origins` in `tts-backend/app.py` before deploying.

### Step 3: Configure Client Environment Variables

In your **client** Railway service (or Vercel), set:

| Variable | Value |
|----------|-------|
| `VITE_KOKORO_BASE_URL` | `https://your-tts-backend.up.railway.app` |
| `VITE_TTS_PROVIDER` | `kokoro` |

**⚠️ Important:** Include `https://` prefix in the URL!

### Step 4: Redeploy Client

After setting environment variables, trigger a new deployment of your client to apply the changes.

---

## Cold Start Handling (Warmup Audio)

### The Problem

Railway and other serverless platforms may "sleep" services after inactivity. The first TTS request after sleep can take 30-90 seconds while:
- The container starts
- Python loads
- The Kokoro model downloads/loads into memory

### The Solution

The system includes automatic cold start handling:

1. **Client-Side Warmup (on page load):**
   - `App.tsx` calls `kokoroService.warmUpService()` on mount
   - This pings the `/health` endpoint to wake up the service

2. **Diegetic Warmup Audio:**
   - When TTS service is cold (first request), SOVA plays a pre-recorded message:
   - `public/sounds/sova_thinking.mp3` - *"Systems are still booting up, pilot. Go stretch your legs - I'll be ready in a moment."*
   - This plays immediately while the actual TTS request processes in the background

### External Monitoring (Recommended)

To prevent cold starts entirely, set up **free external monitoring**:

1. **UptimeRobot (Free):**
   - Go to [uptimerobot.com](https://uptimerobot.com/)
   - Create free account
   - Add new monitor:
     - **Monitor Type:** HTTP(s)
     - **URL:** `https://your-tts-backend.up.railway.app/health`
     - **Monitoring Interval:** 5 minutes
   - This keeps the service warm by pinging it every 5 minutes

2. **Alternative: Cron-job.org (Free):**
   - Similar setup at [cron-job.org](https://cron-job.org/)

---

## API Endpoints

### `POST /synthesize`
Synthesize speech from text.

**Request:**
```json
{
  "text": "Hello, this is a test.",
  "voice": "af_heart",
  "lang_code": "a"
}
```

**Response:** WAV audio file (24kHz)

### `GET /health`
Health check endpoint. Returns `{"status": "healthy"}` when service is ready.

### `GET /voices`
List available voices.

---

## Voice Mapping

Kokoro uses different voice IDs than other TTS providers. The service maps:
- `'sova'` → `'af_heart'` (default female voice for SOVA)
- `'default'` → `'af_heart'`
- Other voices available via `voiceStyle` parameter

See `kokoroService.ts` for full voice mapping, or call `/voices` endpoint for available voices.

---

## Performance

### Typical Latency

| Scenario | Latency |
|----------|---------|
| Warm service, short text | 200-500ms |
| Warm service, long text | 500-1500ms |
| Cold start (first request) | 30-90 seconds |

### Resource Requirements

⚠️ **Important:** Kokoro TTS requires:
- **Memory:** At least 1GB RAM (2GB recommended)
- **CPU:** Model inference is CPU-bound
- **Disk:** ~500MB for model weights (downloaded on first run)

Railway's **free tier may not have sufficient resources**. Consider:
- Using a paid Railway plan ($5/month Developer tier minimum)
- Using external monitoring to keep service warm

---

## Troubleshooting

### Service not responding

1. **Check service is running:**
   ```bash
   curl https://your-tts-backend.up.railway.app/health
   ```

2. **Check Railway logs** for errors (model loading, memory issues)

3. **Verify environment variables** are set correctly

### CORS errors

1. **Check `allow_origins`** in `tts-backend/app.py` includes your domain
2. **Ensure `https://` prefix** in `VITE_KOKORO_BASE_URL`
3. **Redeploy both services** after CORS changes

### 405 Method Not Allowed

This usually means the service is not fully initialized or the URL is incorrect:
- Wait for Railway logs to show "Application startup complete"
- Verify the URL includes the correct port (Railway auto-assigns)

### Audio quality issues

- Kokoro outputs at 24kHz sample rate
- Adjust voice selection for better quality
- Check backend logs for errors

### First request is slow

This is expected behavior (cold start). Solutions:
1. Let the warmup audio play while waiting
2. Set up UptimeRobot to keep service warm
3. Wait for service to fully initialize (check `/health` endpoint)

---

## Comparison: Local vs Production

| Feature | Local Development | Production (Railway) |
|---------|-------------------|----------------------|
| **URL** | `http://localhost:8001` | `https://your-app.up.railway.app` |
| **CORS** | Localhost origins | Production domain in `allow_origins` |
| **Cold Starts** | Rare (service stays running) | Common without monitoring |
| **Cost** | Free | Railway Developer tier (~$5/month) |

---

## Files Reference

| File | Purpose |
|------|---------|
| `tts-backend/app.py` | FastAPI server with Kokoro TTS |
| `tts-backend/Dockerfile` | Docker container for Railway deployment |
| `tts-backend/requirements.txt` | Python dependencies |
| `client/src/services/kokoroService.ts` | Client-side TTS service wrapper |
| `client/src/components/VoiceInterface.tsx` | Voice interface with warmup audio |
| `public/sounds/sova_thinking.mp3` | Warmup audio for cold starts |

---

## References

- [Kokoro Model Card](https://huggingface.co/hexgrad/Kokoro-82M)
- [Kokoro GitHub](https://github.com/hexgrad/kokoro)
- [Kokoro Voices List](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
- [Railway Documentation](https://docs.railway.app/)
