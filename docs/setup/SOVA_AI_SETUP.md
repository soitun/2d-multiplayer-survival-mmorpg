# 🤖 SOVA AI Setup Guide

This guide explains how to set up AI provider integration (OpenAI, Grok, or Gemini) to give SOVA an intelligent personality.

## 🔑 Getting Your AI Provider API Key

SOVA supports multiple AI providers. Choose the one that best fits your needs:

### Option 1: Grok (xAI) - Recommended (Default)
1. **Sign up for xAI:**
   - Go to [https://console.x.ai/](https://console.x.ai/)
   - Create an account or sign in

2. **Generate API Key:**
   - Navigate to API Keys section
   - Create a new API key
   - Copy the key (starts with `xai-...`)

3. **Add to `.env`:**
   ```bash
   GROK_API_KEY=xai-your-key-here
   VITE_AI_PROVIDER=grok
   ```

### Option 2: OpenAI GPT-4o
1. **Sign up for OpenAI:**
   - Go to [https://platform.openai.com/](https://platform.openai.com/)
   - Create an account or sign in

2. **Generate API Key:**
   - Navigate to [API Keys](https://platform.openai.com/api-keys)
   - Click "Create new secret key"
   - Copy the key (starts with `sk-...`)

3. **Add Billing Information:**
   - Go to [Billing](https://platform.openai.com/account/billing)
   - Add a payment method
   - Set usage limits if desired

4. **Add to `.env`:**
   ```bash
   OPENAI_API_KEY=sk-your-key-here
   VITE_AI_PROVIDER=openai
   ```

### Option 3: Gemini (Google)
1. **Sign up for Google AI Studio:**
   - Go to [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
   - Sign in with your Google account

2. **Generate API Key:**
   - Click "Create API Key"
   - Copy the key

3. **Add to `.env`:**
   ```bash
   GEMINI_API_KEY=your-key-here
   VITE_AI_PROVIDER=gemini
   ```

**Important Notes:**
- You only need **one** provider for SOVA responses. Set `VITE_AI_PROVIDER` to your chosen provider (`grok`, `openai`, or `gemini`).
- **Whisper (speech-to-text) always uses OpenAI** regardless of `VITE_AI_PROVIDER` setting.
- **Mixed Providers**: You can use OpenAI for Whisper while using Grok/Gemini for SOVA responses! Just ensure you have `OPENAI_API_KEY` set (for Whisper) and your chosen provider key set (for SOVA).

## ⚙️ Configuration

### **Step 1: Add API Key to Server `.env`**
Create a `.env` file in the **project root** (not client/):
```bash
# .env (project root)
# Add at least one AI provider key:
OPENAI_API_KEY=sk-your-actual-api-key-here
# OR
GROK_API_KEY=xai-your-actual-api-key-here
# OR
GEMINI_API_KEY=your-actual-api-key-here
PROXY_PORT=8002
```

### **Step 2: Select Provider in Client `.env`**
Add to `.env` file in **project root**:
```bash
# .env (project root)
VITE_API_PROXY_URL=http://localhost:8002
VITE_AI_PROVIDER=grok    # Options: 'openai', 'grok', 'gemini' (default: 'grok')
```

**Important:** 
- API keys are stored **server-side only** (in `.env` at project root)
- The client only specifies which provider to use via `VITE_AI_PROVIDER`
- Never expose API keys in client-side code!

## 🎮 SOVA's Personality Features

### 🎯 **Core Personality:**
- **Professional & Tactical:** Military-focused AI assistant
- **Helpful:** Provides game tips and survival advice
- **Concise:** Keeps responses under 2 sentences
- **Loyal:** Addresses players as "Operative" or "Agent"

### 🎪 **Easter Eggs & Special Responses:**

**Ask about SOVA's name:**
- *"What does SOVA stand for?"*
- *"What's your name mean?"*
- **Response:** *"SOVA stands for Sentient Ocular Virtual Assistant, Operative."*

**Ask for help:**
- *"Can you help me?"*
- *"Give me some tips"*
- **Response:** *"Priority one: secure shelter and water. Gather wood and stone for basic tools, Agent."*

**Greetings:**
- *"Hello SOVA"*
- *"Hi there"*
- **Response:** *"Tactical systems online, Operative. How can I assist your mission?"*

**Game-specific questions:**
- *"What should I do at night?"*
- *"I need food"*
- *"How do I fight?"*

### 🎯 **Game Knowledge:**
- 2D multiplayer survival mechanics
- Resource gathering (wood, stone, food, water)
- Day/night cycle dangers
- Crafting and building systems
- Tactical survival advice

## 🔧 Fallback System

If the AI provider is unavailable or not configured:
- SOVA automatically uses predefined responses
- Still includes easter eggs and basic game tips
- No interruption to gameplay experience

## 💰 Cost Considerations

**Provider Pricing Comparison:**

**Grok Beta (Default):**
- Fast and cost-effective
- Great for tactical responses
- Check [xAI pricing](https://x.ai/pricing) for current rates

**OpenAI GPT-4o:**
- Input: ~$5 per 1M tokens
- Output: ~$15 per 1M tokens
- Average SOVA response: ~100-200 tokens
- **Estimated cost:** $0.002-0.003 per response
- Set billing limits in OpenAI dashboard

**Gemini 2.0 Flash:**
- Fast and efficient
- Competitive pricing
- Check [Google AI pricing](https://ai.google.dev/pricing) for current rates

**Usage Tips:**
- Set billing limits in provider dashboard
- Monitor usage regularly
- Switch providers easily via `VITE_AI_PROVIDER` if needed

## 🛠️ Customization

### **Switch AI Providers:**
Change `VITE_AI_PROVIDER` in your `.env` file:
```bash
VITE_AI_PROVIDER=grok     # Use Grok (default)
VITE_AI_PROVIDER=openai   # Use OpenAI GPT-4o
VITE_AI_PROVIDER=gemini   # Use Gemini 2.0 Flash
```

### **Modify SOVA's Personality:**
Edit the system prompt in `openaiService.ts` → `buildSOVASystemPrompt()`

### **Add More Easter Eggs:**
Update the fallback responses in `getFallbackResponse()`

### **Change Response Length:**
Adjust `max_completion_tokens` in the AI service (currently 1500)

### **Adjust Personality:**
Modify `temperature` (0.8 = balanced, 0.3 = more focused, 1.0 = more creative)

## 🧪 Testing

1. **Start your proxy server:** 
   ```bash
   cd api-proxy
   npm start
   ```

2. **Launch your game:** 
   ```bash
   npm run dev
   ```

3. **Test SOVA responses:**
   - *"Hello SOVA"*
   - *"What does your name stand for?"*
   - *"Give me some survival tips"*
   - *"What should I do at night?"*

4. **Verify Provider:**
   - Check browser console for `[AI Service] 🤖 Using provider: grok` (or your selected provider)

## 🐛 Troubleshooting

### **"API error: 401"**
- Check your API key is correct for the selected provider
- Ensure billing is set up in provider account
- Verify the correct key is in `.env` (e.g., `GROK_API_KEY` if using Grok)

### **"API error: 429"**
- You've hit rate limits for the selected provider
- Wait a moment and try again
- Consider switching providers via `VITE_AI_PROVIDER`
- Consider upgrading your provider plan

### **No AI responses, only fallbacks**
- Check browser console for errors
- Verify API key is configured for the selected provider
- Check provider account has available credits
- Verify `VITE_AI_PROVIDER` matches the provider key you've configured

### **Responses are too long/short**
- Adjust `max_tokens` in `openaiService.ts`
- Modify the system prompt instructions

## 🚀 Ready to Go!

Once configured, SOVA will:
- ✅ Respond intelligently to player messages
- ✅ Provide contextual game advice
- ✅ Show personality and humor
- ✅ Include lore-based easter eggs
- ✅ Fall back gracefully if AI is unavailable

Your tactical AI assistant is ready for deployment, Operative! 🎖️

