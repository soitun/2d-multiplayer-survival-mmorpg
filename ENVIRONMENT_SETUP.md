# 🔧 Environment Variables Setup

This guide explains how to configure environment variables for the game's AI systems.

## 📋 Required Environment Variables

### Server-Side (API Proxy - Secure)
The API proxy handles OpenAI API calls securely, keeping keys server-side:

```bash
# .env file in project root
OPENAI_API_KEY=sk-your-openai-api-key-here
PROXY_PORT=8002
```

### Client-Side Variables (Vite)
These variables are used by the React client application:

```bash
# .env file in project root or client/.env
VITE_API_PROXY_URL=http://localhost:8002
VITE_KOKORO_BASE_URL=http://localhost:8001
```

**Note:** 
- **OpenAI API key** is used for GPT-4o (AI personality) and Whisper (speech-to-text) - handled by secure proxy
- **Kokoro TTS** runs locally - no API key needed!
- **No ElevenLabs** - we use Kokoro for text-to-speech

## 🚀 Setup Methods

### Method 1: Environment Files (Recommended)

#### For Server (API Proxy)
1. Create `.env` file in **project root**:
```bash
# .env (project root)
OPENAI_API_KEY=sk-your-actual-openai-api-key-here
PROXY_PORT=8002
```

#### For Client (No API Keys Needed!)
1. Create `.env` file in **project root**:
```bash
# .env (project root)
VITE_API_PROXY_URL=http://localhost:8002
VITE_KOKORO_BASE_URL=http://localhost:8001
```

**Important:** All API keys stay on the server - never exposed to the browser!

### Method 2: System Environment Variables (Not Recommended)
Use `.env` files instead for better security and portability.

## 🔑 Getting API Keys

### OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up/login and navigate to [API Keys](https://platform.openai.com/api-keys)
3. Click "Create new secret key"
4. Copy the key (starts with `sk-...`)
5. Add to `.env` file in project root

### Kokoro TTS (No API Key Needed!)
Kokoro runs locally on your machine - just start the backend:
```bash
cd tts-backend
python app.py
```

## 🛡️ Security Best Practices

### ✅ Current Setup (Secure):
- ✅ API keys stored server-side only
- ✅ Proxy server handles all OpenAI API calls
- ✅ Client never exposes API keys
- ✅ Kokoro runs locally (no keys needed)
- ✅ `.env` files in `.gitignore`

### ✅ Do:
- Use environment variables for all API keys
- Add `.env` files to `.gitignore`
- Use different keys for development/production
- Set billing limits on API accounts
- Regularly rotate API keys

### ❌ Don't:
- Commit API keys to version control
- Share API keys in chat/email
- Use production keys in development
- Hardcode keys in source code
- Expose API keys in client-side code

## 📁 File Structure

```
project-root/
├── .env                    # Server-side API keys (secure!)
├── .gitignore              # Should include .env files
├── api-proxy/
│   └── server.ts           # Secure proxy server
├── tts-backend/
│   └── app.py              # Kokoro TTS backend (local)
└── client/
    └── src/
        └── services/
            ├── openaiService.ts      # Uses proxy (no keys!)
            ├── whisperService.ts    # Uses proxy (no keys!)
            └── kokoroService.ts      # Local TTS (no keys!)
```

## 🧪 Testing Configuration

### 1. Start the Secure Proxy Server
```bash
cd api-proxy
npm install
npm start
# Should see: "🚀 Secure API Proxy Server running on http://localhost:8002"
```

### 2. Start Kokoro TTS Backend
```bash
cd tts-backend
python app.py
# Should see: "Application startup complete" and "Uvicorn running on http://127.0.0.1:8001"
```

### 3. Start the Game Client
```bash
npm run dev
```

### 4. Test Voice Interface
1. Press and hold `V` key
2. Speak: "Hello SOVA"
3. Release `V` key
4. Should transcribe and respond!

## 🐛 Troubleshooting

### "API key not found" Errors
- Check `.env` file is in **project root** (not client/)
- Verify variable name is `OPENAI_API_KEY` (no `VITE_` prefix)
- Restart proxy server after adding variables
- Check proxy server logs for path it's checking

### "Proxy connection failed"
- Ensure proxy server is running: `cd api-proxy && npm start`
- Check `VITE_API_PROXY_URL` matches proxy port (default: 8002)
- Test proxy health: `curl http://localhost:8002/health`

### "Kokoro service not available"
- Ensure Kokoro backend is running: `cd tts-backend && python app.py`
- Check `VITE_KOKORO_BASE_URL` matches Kokoro port (default: 8001)
- Test Kokoro health: `curl http://localhost:8001/health`

### Variables Not Loading
- Ensure `.env` files are in correct directories
- Check `.gitignore` isn't excluding `.env` files locally
- Verify environment variable syntax (no spaces around `=`)
- Restart development servers after changes

## 📚 Related Documentation

- [SECURE_API_SETUP.md](./SECURE_API_SETUP.md) - Secure proxy setup guide
- [KOKORO_INTEGRATION.md](./KOKORO_INTEGRATION.md) - Kokoro TTS setup
- [OPENAI_SETUP.md](./OPENAI_SETUP.md) - OpenAI configuration details
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

## 🎯 Quick Reference

| Variable | Location | Purpose | Example |
|----------|----------|---------|---------|
| `OPENAI_API_KEY` | `.env` (root) | OpenAI API access (server-side) | `sk-abc123...` |
| `PROXY_PORT` | `.env` (root) | Proxy server port | `8002` |
| `VITE_API_PROXY_URL` | `.env` (root) | Proxy server URL | `http://localhost:8002` |
| `VITE_KOKORO_BASE_URL` | `.env` (root) | Kokoro backend URL | `http://localhost:8001` |

## 🎯 What Each Service Does

### OpenAI GPT-4o (Via Proxy)
- **Purpose**: Generates intelligent SOVA responses based on game context
- **Usage**: Text chat and voice responses
- **Security**: API key stays on server, never exposed to browser
- **Fallback**: Predefined tactical responses if API unavailable

### OpenAI Whisper (Via Proxy)
- **Purpose**: Converts speech to text for voice commands
- **Usage**: Hold V key to record voice, release to process
- **Security**: API key stays on server, never exposed to browser
- **Features**: High-quality transcription with optimized settings

### Kokoro TTS (Local)
- **Purpose**: Converts SOVA text responses to high-quality voice audio
- **Usage**: Automatic voice playback for SOVA responses
- **Security**: Runs locally - no API keys needed!
- **Features**: Fast, cost-free, privacy-focused voice synthesis

Your AI system is now configured for secure, production-ready API key management! 🎖️ 