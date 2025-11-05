# Secure API Setup Guide

## 🛡️ Security Options

You have **two options** for handling your OpenAI API key:

### Option 1: Direct API (Development Only) ⚠️
**Warning:** API key is exposed in browser bundle!

```env
# .env file
VITE_OPENAI_API_KEY=sk-your-openai-api-key-here
VITE_USE_API_PROXY=false
```

**Pros:**
- ✅ Simple setup
- ✅ No extra server needed
- ✅ Lower latency

**Cons:**
- ❌ API key visible in browser
- ❌ Anyone can extract and use your key
- ❌ Not secure for production

### Option 2: Secure Proxy (Recommended for Production) ✅
**API key stays on server - never exposed to browser!**

```env
# .env file (project root)
OPENAI_API_KEY=sk-your-openai-api-key-here
PROXY_PORT=8002

# Client .env (or root .env)
VITE_USE_API_PROXY=true
VITE_API_PROXY_URL=http://localhost:8002
```

**Pros:**
- ✅ API key never exposed to browser
- ✅ Can add rate limiting
- ✅ Can add authentication
- ✅ Production-ready security

**Cons:**
- ❌ Requires running proxy server
- ❌ Slightly higher latency

## 🚀 Quick Setup (Secure Proxy)

### 1. Install Proxy Dependencies

```bash
cd api-proxy
npm install
```

### 2. Create `.env` in Project Root

```env
# Server-side (never exposed to browser)
OPENAI_API_KEY=sk-your-openai-api-key-here
PROXY_PORT=8002
```

### 3. Update Client `.env`

```env
# Client-side (no API key needed!)
VITE_USE_API_PROXY=true
VITE_API_PROXY_URL=http://localhost:8002
```

### 4. Start the Proxy Server

```bash
cd api-proxy
npm start
# Should see: "🚀 Secure API Proxy Server running on http://localhost:8002"
```

### 5. Start Your Game

```bash
npm run dev
```

## 🧪 Testing

1. **Test proxy health:**
   ```bash
   curl http://localhost:8002/health
   ```
   Should return: `{"status":"healthy","openaiConfigured":true}`

2. **Press V in game** - should work without exposing API key!

## 📝 Summary

| Mode | API Key Location | Security | Use Case |
|------|-----------------|----------|----------|
| Direct API | Browser bundle | ⚠️ Low | Development only |
| Proxy | Server only | ✅ High | Production |

## 🔒 Recommendation

**For Development:** Use direct API (quick setup)  
**For Production:** Use proxy (secure)

The code automatically switches based on `VITE_USE_API_PROXY` environment variable!

