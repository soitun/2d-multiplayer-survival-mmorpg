# Environment Variables Setup

## Required for Voice Interface

### 1. OpenAI API Key (Required)
Used for:
- **Whisper**: Speech-to-text transcription
- **GPT-4o**: SOVA AI personality responses

```env
# In your .env file (project root)
VITE_OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 2. Kokoro TTS Backend (Required)
Kokoro runs locally - no API key needed! Just ensure the backend is running.

The Kokoro backend URL is configured in `kokoroService.ts`:
- Default: `http://localhost:8001`
- Can be overridden with: `VITE_KOKORO_BASE_URL=http://localhost:8001`

## Quick Setup

1. **Create `.env` file in project root:**
   ```env
   VITE_OPENAI_API_KEY=sk-your-actual-openai-api-key-here
   ```

2. **Start Kokoro backend:**
   ```bash
   cd tts-backend
   python app.py
   # Should start on http://localhost:8001
   ```

3. **Restart your dev server:**
   ```bash
   npm run dev
   ```

4. **Test the voice interface:**
   - Press and hold `V` to speak
   - Release to process

## Getting Your OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up/login and navigate to [API Keys](https://platform.openai.com/api-keys)
3. Click "Create new secret key"
4. Copy the key (starts with `sk-...`)
5. Add to `.env` file

## Security Notes

- ✅ `.env` files are in `.gitignore` - safe from commits
- ✅ Kokoro runs locally - no API keys needed
- ⚠️ OpenAI API key is exposed in browser bundle (for development only)
- 💡 For production, consider using the `api-proxy/` backend to keep keys server-side

## Troubleshooting

### "API key not configured"
- Check `.env` file exists in project root (not `client/` folder)
- Ensure variable name is `VITE_OPENAI_API_KEY` (with `VITE_` prefix)
- Restart dev server after adding/updating `.env`

### "Kokoro service not available"
- Ensure Kokoro backend is running: `cd tts-backend && python app.py`
- Check it's accessible at `http://localhost:8001`
- Check browser console for connection errors

