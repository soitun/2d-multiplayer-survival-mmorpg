# Secure API Proxy Backend

A secure backend proxy for OpenAI API calls (Whisper and GPT-4o), keeping API keys server-side.

## Why This Exists

**Client-side API keys are exposed** in the browser bundle, meaning anyone can extract them. This backend proxy keeps your OpenAI API key secure on the server.

**Note:** Kokoro TTS runs locally and doesn't require an API key, so it doesn't need to go through this proxy.

## Setup

### 1. Install Dependencies

```bash
cd api-proxy
npm install
```

### 2. Create `.env` file in project root

```env
# Keep this SECRET - never commit to git
OPENAI_API_KEY=sk-your-openai-api-key-here

# Server port
PROXY_PORT=8002
```

### 3. Update Client Code

Update `whisperService.ts` and `openaiService.ts` to use the proxy instead of direct API calls.

### 4. Start the Proxy Server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

## Security Benefits

✅ OpenAI API key stays on the server  
✅ Can implement rate limiting  
✅ Can add authentication  
✅ Can monitor/log usage  
✅ Keys never exposed to browsers  

## Trade-offs

❌ Requires additional server  
❌ Slightly higher latency (proxy hop)  
❌ More complex setup  

## Usage

Once running, the client will automatically use the proxy endpoints instead of direct API calls.

**Note:** Kokoro TTS continues to run locally and doesn't need this proxy.

