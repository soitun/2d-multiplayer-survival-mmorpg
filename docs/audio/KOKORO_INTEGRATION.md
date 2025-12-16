# Kokoro TTS Integration Guide

This guide explains how to set up and use Kokoro TTS as an alternative to ElevenLabs in your voice interface system.

## Architecture

The integration consists of:
1. **Python Backend Service** (`tts-backend/`) - FastAPI service running Kokoro TTS model
2. **TypeScript Client Service** (`client/src/services/kokoroService.ts`) - Client wrapper for Kokoro API
3. **VoiceInterface Integration** - Auto-detects and uses Kokoro when available

## Quick Start

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

Add to your `.env` file (or create one):

```env
# TTS Provider: 'elevenlabs' | 'kokoro' | 'auto' (default: auto-detect)
VITE_TTS_PROVIDER=auto

# Kokoro backend URL (default: http://localhost:8001)
VITE_KOKORO_BASE_URL=http://localhost:8001
```

### 3. Start Your Application

```bash
npm run dev
```

The voice interface will automatically detect Kokoro if available, or fall back to ElevenLabs.

## How It Works

### Provider Selection

The system uses three modes:

1. **`auto`** (default): Automatically detects if Kokoro service is available
   - Checks `/health` endpoint
   - Uses Kokoro if available, otherwise falls back to ElevenLabs

2. **`kokoro`**: Forces use of Kokoro TTS
   - Will fail if service is not available

3. **`elevenlabs`**: Forces use of ElevenLabs
   - Ignores Kokoro service even if available

### Voice Mapping

Kokoro uses different voice IDs than ElevenLabs. The service maps:
- `'sova'` → `'af_heart'` (default female voice)
- `'default'` → `'af_heart'`
- Other voices available via `voiceStyle` parameter

See `kokoroService.ts` for full voice mapping, or call `/voices` endpoint for available voices.

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
Health check endpoint.

### `GET /voices`
List available voices.

## Performance

Kokoro TTS is designed to be:
- **Cost-effective**: Self-hosted, no API costs
- **Fast**: Lower latency than cloud APIs
- **High-quality**: Comparable to larger models

Typical latency: 200-500ms for short phrases, 500-1500ms for longer texts.

## Troubleshooting

### Kokoro service not detected

1. Check that Python backend is running:
   ```bash
   curl http://localhost:8001/health
   ```

2. Check CORS settings in `tts-backend/app.py` if accessing from different origin

3. Verify environment variable:
   ```bash
   echo $VITE_KOKORO_BASE_URL  # Should be http://localhost:8001
   ```

### Audio quality issues

- Kokoro outputs at 24kHz sample rate (ElevenLabs uses 44.1kHz)
- Adjust voice selection for better quality
- Check backend logs for errors

### First request is slow

- First request loads the model into memory (can take 10-30 seconds)
- Subsequent requests are much faster
- Consider keeping backend running during development

## Production Deployment

### Backend Deployment

Options:
1. **Docker**: Create Dockerfile for containerized deployment
2. **Cloud**: Deploy to cloud services (Railway, Render, etc.)
3. **Local**: Run as systemd service on Linux

### Security Considerations

1. **CORS**: Update `allow_origins` in `app.py` to your production domain
2. **Rate Limiting**: Add rate limiting middleware
3. **Authentication**: Add API key authentication if needed
4. **Resource Limits**: Set text length limits (currently 5000 chars)

## Comparison: Kokoro vs ElevenLabs

| Feature | Kokoro | ElevenLabs |
|---------|--------|-------------|
| **Cost** | Free (self-hosted) | Paid API |
| **Latency** | 200-1500ms | 300-2000ms |
| **Quality** | High | Very High |
| **Voices** | 54 voices | Hundreds |
| **Setup** | Requires Python backend | API key only |
| **Privacy** | Fully local | Cloud-based |

## Next Steps

- [ ] Add Docker support for easy deployment
- [ ] Implement voice caching for repeated phrases
- [ ] Add streaming support for long texts
- [ ] Create voice selection UI
- [ ] Add performance monitoring dashboard

## References

- [Kokoro Model Card](https://huggingface.co/hexgrad/Kokoro-82M)
- [Kokoro GitHub](https://github.com/hexgrad/kokoro)
- [Kokoro Voices List](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)

