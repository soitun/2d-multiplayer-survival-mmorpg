/**
 * Secure API Proxy Server
 * Routes OpenAI and Gemini API calls through backend to keep API keys secure
 * Note: Kokoro TTS runs locally and doesn't need this proxy
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define envPath for error logging (used in both dev and production)
const envPath = path.resolve(__dirname, '..', '.env');

// Load environment variables from project root (one level up) in development only
// Railway sets environment variables directly, so we don't need .env file in production
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: envPath });
  console.log(`[Proxy] Looking for .env at: ${envPath}`);
  console.log(`[Proxy] .env file exists: ${fs.existsSync(envPath)}`);
}

const app = express();
// Railway sets PORT automatically, fallback to PROXY_PORT or 8002 for local dev
const PORT = parseInt(process.env.PORT || process.env.PROXY_PORT || '8002', 10);

// CORS configuration - allow both local dev and production origins
const allowedOrigins = [
  'http://localhost:3008',
  'http://localhost:5173',
  // Production URLs - Railway and custom domain
  'https://broth-and-bullets-production-client-production.up.railway.app',
  'https://www.brothandbullets.com',
  'https://brothandbullets.com', // Also allow without www
  // Allow additional CLIENT_URL from env if set
  process.env.CLIENT_URL
].filter(Boolean); // Remove any undefined values

console.log('🔒 CORS Configuration:');
console.log('   Allowed origins:', allowedOrigins);
console.log('   CLIENT_URL env var:', process.env.CLIENT_URL);
console.log('   NODE_ENV:', process.env.NODE_ENV);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    console.log(`[CORS] Request from origin: ${origin}`);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('[CORS] ✅ Allowing request with no origin');
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      console.log(`[CORS] ✅ Origin allowed: ${origin}`);
      callback(null, true);
    } else {
      // In production, be more strict; in dev, allow all
      if (process.env.NODE_ENV === 'production') {
        console.error(`[CORS] ❌ Origin blocked: ${origin}`);
        console.error(`[CORS] Allowed origins are: ${allowedOrigins.join(', ')}`);
        callback(new Error('Not allowed by CORS'));
      } else {
        console.log(`[CORS] ✅ Development mode - allowing origin: ${origin}`);
        callback(null, true); // Allow in development
      }
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'audio/*', limit: '50mb' }));

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROK_API_KEY = process.env.GROK_API_KEY;

// At least one API key should be configured
if (!OPENAI_API_KEY && !GEMINI_API_KEY && !GROK_API_KEY) {
  console.error('❌ No AI API keys found in environment variables');
  console.error(`   Please ensure at least one of OPENAI_API_KEY, GEMINI_API_KEY, or GROK_API_KEY is set`);
  console.error(`   Current working directory: ${process.cwd()}`);
  // Don't exit - allow server to start but endpoints will return errors
}

// Initialize Gemini client if API key is available
let genAI: GoogleGenerativeAI | null = null;
if (GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

console.log('✅ API Proxy Server starting...');
console.log(`   OpenAI API: ${OPENAI_API_KEY ? 'Ready' : 'Not configured'}`);
console.log(`   Gemini API: ${GEMINI_API_KEY ? 'Ready' : 'Not configured'}`);
console.log(`   Grok API: ${GROK_API_KEY ? 'Ready' : 'Not configured'}`);
console.log(`   Note: Kokoro TTS runs locally (no proxy needed)`);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    openaiConfigured: !!OPENAI_API_KEY,
    geminiConfigured: !!GEMINI_API_KEY,
    grokConfigured: !!GROK_API_KEY
  });
});

// OpenAI Whisper transcription proxy
app.post('/api/whisper/transcribe', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Create FormData from request
    const formData = new FormData();
    
    // Handle audio file (could be base64 or multipart)
    if (req.body && typeof req.body === 'object' && req.body.audio) {
      // Base64 encoded audio
      const audioBuffer = Buffer.from(req.body.audio, 'base64');
      
      // CRITICAL FIX: Ensure filename extension matches the actual audio format
      // OpenAI Whisper API detects format from filename extension, so it must be correct
      let filename = req.body.filename || 'audio.webm';
      let contentType = req.body.contentType || 'audio/webm';
      
      // Validate and normalize the filename extension based on contentType
      // This ensures OpenAI can properly detect the format
      if (contentType.includes('webm')) {
        filename = filename.replace(/\.[^.]+$/, '') + '.webm';
        contentType = 'audio/webm';
      } else if (contentType.includes('ogg') || contentType.includes('opus')) {
        filename = filename.replace(/\.[^.]+$/, '') + '.ogg';
        contentType = 'audio/ogg';
      } else if (contentType.includes('mp4') || contentType.includes('m4a')) {
        filename = filename.replace(/\.[^.]+$/, '') + '.mp4';
        contentType = 'audio/mp4';
      } else if (contentType.includes('wav')) {
        filename = filename.replace(/\.[^.]+$/, '') + '.wav';
        contentType = 'audio/wav';
      } else {
        // Default to webm if unknown (most browsers support this)
        filename = filename.replace(/\.[^.]+$/, '') + '.webm';
        contentType = 'audio/webm';
      }
      
      console.log(`[Proxy] Processing audio: ${filename}, Content-Type: ${contentType}, Size: ${audioBuffer.length} bytes`);
      
      // Append file with proper filename and content type
      // OpenAI detects format from filename extension, so this is critical
      formData.append('file', audioBuffer, {
        filename: filename,
        contentType: contentType
      });
    } else if (req.is('multipart/form-data')) {
      // Multipart form data
      return res.status(400).json({ error: 'Multipart form data not yet supported' });
    } else {
      return res.status(400).json({ error: 'Invalid audio data format' });
    }

    formData.append('model', req.body.model || 'whisper-1');
    formData.append('language', req.body.language || 'en');
    formData.append('response_format', req.body.response_format || 'verbose_json');
    formData.append('temperature', req.body.temperature || '0');
    
    // Optional: Add prompt for better accuracy with game-specific terms
    if (req.body.prompt) {
      formData.append('prompt', req.body.prompt);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        // Don't set Content-Type - FormData will set it with boundary
      },
      body: formData,
    });

    const data = await response.json();
    
    // Forward the exact error from OpenAI if transcription failed
    if (!response.ok) {
      console.error(`[Proxy] Whisper API error (${response.status}):`, data);
      return res.status(response.status).json(data);
    }
    
    res.status(response.status).json(data);

  } catch (error: any) {
    console.error('[Proxy] Whisper transcription error:', error);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

// OpenAI Chat completion proxy (for SOVA)
app.post('/api/openai/chat', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);

  } catch (error: any) {
    console.error('[Proxy] OpenAI chat error:', error);
    res.status(500).json({ error: error.message || 'Chat completion failed' });
  }
});

// Grok Chat completion proxy (for SOVA)
app.post('/api/grok/chat', async (req, res) => {
  try {
    if (!GROK_API_KEY) {
      return res.status(500).json({ error: 'Grok API key not configured' });
    }

    // Grok API uses xAI's API endpoint
    // Note: Grok API format is similar to OpenAI but uses different base URL
    // Default model: grok-beta (fallback to grok-2 if needed)
    const requestBody = req.body;
    
    // Ensure model is set - default to grok-beta if not specified
    if (!requestBody.model) {
      requestBody.model = 'grok-beta';
    }
    
    console.log(`[Proxy] Grok request - Model: ${requestBody.model}, Messages: ${requestBody.messages?.length || 0}`);
    
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    // Log detailed error information for debugging
    if (!response.ok) {
      console.error(`[Proxy] Grok API error (${response.status}):`, JSON.stringify(data, null, 2));
      console.error(`[Proxy] Request body:`, JSON.stringify(requestBody, null, 2));
    }
    
    res.status(response.status).json(data);

  } catch (error: any) {
    console.error('[Proxy] Grok chat error:', error);
    res.status(500).json({ error: error.message || 'Grok chat completion failed' });
  }
});

// Gemini Chat completion proxy (for SOVA)
app.post('/api/gemini/chat', async (req, res) => {
  try {
    if (!genAI || !GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const { model = 'gemini-2.0-flash', messages, max_completion_tokens = 1500, temperature = 0.8 } = req.body;

    // Convert OpenAI-style messages to Gemini format
    const systemMessage = messages.find((m: any) => m.role === 'system');
    const userMessages = messages.filter((m: any) => m.role !== 'system');
    
    // Combine system message with first user message if present
    let promptParts: string[] = [];
    if (systemMessage) {
      promptParts.push(systemMessage.content);
    }
    userMessages.forEach((msg: any) => {
      promptParts.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`);
    });

    const geminiModel = genAI.getGenerativeModel({ 
      model,
      generationConfig: {
        temperature,
        maxOutputTokens: max_completion_tokens,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    const result = await geminiModel.generateContent(promptParts.join('\n\n'));
    const responseText = result.response.text();

    // Format response to match OpenAI format for compatibility
    res.json({
      choices: [{
        message: {
          role: 'assistant',
          content: responseText
        }
      }]
    });

  } catch (error: any) {
    console.error('[Proxy] Gemini chat error:', error);
    res.status(500).json({ error: error.message || 'Gemini chat completion failed' });
  }
});

// ============================================================================
// GEMINI API ENDPOINTS - AI Brewing System
// ============================================================================

// Brew categories for AI guidance (from brew_categories_design.md)
const BREW_CATEGORIES = [
  'healing_broth',      // Health restoration, hunger satisfaction
  'medicinal_tea',      // Stat buffs, healing over time, status removal
  'alcoholic',          // Buffs/debuffs, cold resistance, trade value
  'poison',             // Offensive combat, weapon coating
  'performance_enhancer', // Temporary stat boosts, combat advantages
  'utility_brew',       // Non-consumable uses, crafting materials
  'psychoactive',       // Special effects, vision quests, high-risk
  'nutritional_drink',  // Hunger/thirst satisfaction
  'maritime_specialty', // Coastal/island specific
  'cooking_base',       // Used in other recipes
  'technological',      // Sci-fi/crashed ship themed
];

// Effect types that map to server-side EffectType enum
const VALID_EFFECT_TYPES = [
  'HealthRegen',      // For medicinal teas
  'FoodPoisoning',    // For poisons
  'Intoxicated',      // For alcoholic (new effect)
  'StaminaBoost',     // For performance enhancers
  'SpeedBoost',       // For performance enhancers
  'ColdResistance',   // For warming brews
  'FireResistance',   // For fire-resistant brews
  'PoisonResistance', // For antidote brews
  'NightVision',      // For special brews
  'WarmthBoost',      // For warming brews
  'Poisoned',         // For poison brews (distinct from FoodPoisoning)
  null,               // No special effect (stats only)
];

// System prompt for recipe generation
const BREW_SYSTEM_PROMPT = `You are an AI recipe generator for a survival game called "Broth & Bullets". 
Players combine 3 ingredients in a broth pot to create unique brews.

Your task is to generate a balanced, thematically appropriate recipe based on the ingredients provided.

CATEGORIES (choose one):
- healing_broth: Health restoration, hunger satisfaction (health: 30-80, hunger: 40-100)
- medicinal_tea: Stat buffs, healing over time (health: 20-50, hunger: 5-20, thirst: 30-60)
- alcoholic: Buffs/debuffs, cold resistance (health: -5 to 10, hunger: 10-30, thirst: -10 to 0)
- poison: Offensive combat, dangerous (health: -50 to -200, hunger: -20 to -50)
- performance_enhancer: Temporary buffs (health: 10-30, hunger: 20-40, thirst: 10-30)
- utility_brew: Crafting materials, non-consumable (minimal stats)
- psychoactive: Special effects, risky (variable stats)
- nutritional_drink: Hunger/thirst satisfaction (health: 10-30, hunger: 50-90, thirst: 40-80)
- maritime_specialty: Coastal themed (variable stats)
- cooking_base: Intermediate ingredient (minimal stats)
- technological: Sci-fi themed (unique effects)

EFFECT TYPES (optional, use only when appropriate - IMPORTANT: Apply these when the brew category or ingredients suggest them):
- HealthRegen: For medicinal teas, healing over time
- FoodPoisoning: For poisons, damage over time
- Intoxicated: For alcoholic drinks (ales, wines, spirits), buffs + debuffs - ALWAYS apply for alcoholic category
- StaminaBoost: For performance enhancers, reduces hunger/thirst drain
- SpeedBoost: For performance enhancers, increases movement speed
- ColdResistance: For warming brews, reduces cold damage
- FireResistance: For fire-resistant brews, reduces fire/burn damage
- PoisonResistance: For antidote brews, reduces poison/venom damage
- NightVision: For psychoactive brews, enhanced vision at night
- WarmthBoost: For warming broths, warmth protection bonus
- Poisoned: For poison brews (distinct from FoodPoisoning), damage over time
- null: No special effect (most common, stats only)

CRITICAL: When generating recipes, you MUST include an appropriate effect_type when:
- Category is "alcoholic" → MUST use "Intoxicated"
- Category is "poison" → MUST use "Poisoned" or "FoodPoisoning"
- Category is "performance_enhancer" → SHOULD use "SpeedBoost" or "StaminaBoost"
- Category is "psychoactive" → SHOULD use "NightVision"
- Ingredients suggest fire resistance (e.g., fire-related materials) → CONSIDER "FireResistance"
- Ingredients suggest cold resistance (e.g., warming herbs) → CONSIDER "ColdResistance"
- Ingredients suggest poison resistance (e.g., antidote herbs) → CONSIDER "PoisonResistance"

NAMING CONVENTIONS:
- Prefix: "Glass Jar of", "Vial of", "Flask of", "Bottle of", "Draught of", "Elixir of", "Tonic of", "Brew of", "Potion of", "Extract of"
- Suffix: "Soup/Stew/Broth" (food), "Tea/Infusion" (herbs), "Wine/Spirit/Ale" (alcohol), "Poison/Toxin/Venom" (deadly)

DESCRIPTION TONE:
- Survival-themed, practical, grounded
- 1-2 sentences max
- Hint at effects without being mechanical
- Example: "A hearty stew made from foraged roots and wild herbs. Warms the body and fills the belly."

RARITY TIERS affect stats:
- Common (0.0-0.3): Basic stats, 60-120 sec brew time
- Uncommon (0.3-0.6): Good stats, 120-180 sec brew time
- Rare (0.6-0.8): Strong stats, 180-240 sec brew time
- Very Rare (0.8-1.0): Extreme stats, 240-300 sec brew time

IMPORTANT: Return ONLY valid JSON, no markdown formatting or code blocks.`;

// Gemini Brew Recipe Generation
app.post('/api/gemini/brew', async (req, res) => {
  try {
    if (!genAI || !GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const { ingredients, ingredient_rarities } = req.body;

    if (!ingredients || !Array.isArray(ingredients) || ingredients.length !== 3) {
      return res.status(400).json({ error: 'Exactly 3 ingredients required' });
    }

    console.log(`[Proxy] Gemini brew request: ${ingredients.join(', ')}`);

    // Calculate average rarity for tier determination
    const avgRarity = ingredient_rarities && ingredient_rarities.length > 0
      ? ingredient_rarities.reduce((sum: number, r: number) => sum + r, 0) / ingredient_rarities.length
      : 0.3;

    const rarityTier = avgRarity < 0.3 ? 'Common' : avgRarity < 0.6 ? 'Uncommon' : avgRarity < 0.8 ? 'Rare' : 'Very Rare';

    const userPrompt = `Generate a brew recipe for these 3 ingredients:
${ingredients.map((ing: string, i: number) => `- ${ing} (rarity: ${ingredient_rarities?.[i]?.toFixed(2) || '0.30'})`).join('\n')}

Average rarity tier: ${rarityTier} (${avgRarity.toFixed(2)})

Return a JSON object with these exact fields:
{
  "name": "string - creative name following naming conventions",
  "description": "string - 1-2 sentence atmospheric description",
  "health": number - health restoration/damage (negative for poisons),
  "hunger": number - hunger satisfaction,
  "thirst": number - thirst satisfaction,
  "brew_time_secs": number - brewing time in seconds (60-300 based on rarity),
  "category": "string - one of the valid categories",
  "effect_type": "string or null - one of the valid effect types, or null for stats-only",
  "icon_subject": "string - short description of the brew's appearance for icon generation (e.g., 'steaming bowl of mushroom soup', 'glowing green poison vial')"
}`;

    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    });

    const result = await model.generateContent([
      { text: BREW_SYSTEM_PROMPT },
      { text: userPrompt }
    ]);

    const responseText = result.response.text();
    console.log(`[Proxy] Gemini raw response: ${responseText.substring(0, 200)}...`);

    // Parse JSON from response (handle potential markdown code blocks)
    let recipeJson;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : responseText.trim();
      recipeJson = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[Proxy] Failed to parse Gemini response as JSON:', parseError);
      return res.status(500).json({ 
        error: 'Failed to parse recipe response',
        raw: responseText 
      });
    }

    // Validate required fields
    const requiredFields = ['name', 'description', 'health', 'hunger', 'thirst', 'brew_time_secs', 'category', 'icon_subject'];
    for (const field of requiredFields) {
      if (recipeJson[field] === undefined) {
        console.error(`[Proxy] Missing required field: ${field}`);
        return res.status(500).json({ error: `Missing required field: ${field}` });
      }
    }

    // Validate category
    if (!BREW_CATEGORIES.includes(recipeJson.category)) {
      console.warn(`[Proxy] Invalid category '${recipeJson.category}', defaulting to healing_broth`);
      recipeJson.category = 'healing_broth';
    }

    // Validate effect_type
    if (recipeJson.effect_type && !VALID_EFFECT_TYPES.includes(recipeJson.effect_type)) {
      console.warn(`[Proxy] Invalid effect_type '${recipeJson.effect_type}', setting to null`);
      recipeJson.effect_type = null;
    }

    console.log(`[Proxy] Generated recipe: ${recipeJson.name} (${recipeJson.category})`);
    res.json(recipeJson);

  } catch (error: any) {
    console.error('[Proxy] Gemini brew error:', error);
    res.status(500).json({ error: error.message || 'Recipe generation failed' });
  }
});

// OpenAI DALL-E 2 Icon Generation (fast, cheap, great for pixel art)
// Cost: ~$0.016-0.020 per 256x256 image
app.post('/api/gemini/icon', async (req, res) => {
  try {
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const { subject } = req.body;

    if (!subject || typeof subject !== 'string') {
      return res.status(400).json({ error: 'Subject string required' });
    }

    console.log(`[Proxy] DALL-E icon request: ${subject}`);

    // Optimized pixel art prompt for DALL-E 2 - CRITICAL: Must have transparent background
    // Note: DALL-E 2 generates PNGs but may include white backgrounds. The prompt emphasizes transparency.
    const iconPrompt = `Pixel art style ${subject} as a game item icon. Pixel art with consistent pixel width, clean black outlines, sharp pixel-level detail. CRITICAL: Must have a completely transparent background - no white background, no colored background, no shadows, no background elements whatsoever. The icon should be the object only on a transparent PNG. Top-down RPG style like Secret of Mana. Warm color palette with light dithering. The entire background must be transparent alpha channel.`;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-2',
        prompt: iconPrompt,
        n: 1,
        size: '256x256',
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json() as { error?: { message?: string } };
      console.error(`[Proxy] DALL-E error (${response.status}):`, errorData);
      return res.json({
        icon_base64: null,
        placeholder: true,
        description: subject,
        error: errorData.error?.message || 'DALL-E generation failed'
      });
    }

    const data = await response.json() as { data?: Array<{ b64_json?: string }> };
    
    if (data.data && data.data[0]?.b64_json) {
      console.log(`[Proxy] Generated icon via DALL-E 2 successfully`);
      return res.json({
        icon_base64: data.data[0].b64_json,
        mime_type: 'image/png',
      });
    }

    // If no image was generated, return a placeholder indicator
    console.log(`[Proxy] No image in DALL-E response, returning placeholder`);
    return res.json({
      icon_base64: null,
      placeholder: true,
      description: subject,
    });

  } catch (error: any) {
    console.error('[Proxy] DALL-E icon error:', error);
    res.status(500).json({ error: error.message || 'Icon generation failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Secure API Proxy Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   OpenAI Whisper: POST /api/whisper/transcribe`);
  console.log(`   OpenAI Chat: POST /api/openai/chat`);
  console.log(`   Grok Chat: POST /api/grok/chat`);
  console.log(`   Gemini Chat: POST /api/gemini/chat`);
  console.log(`   Gemini Brew: POST /api/gemini/brew`);
  console.log(`   DALL-E 2 Icon: POST /api/gemini/icon`);
  console.log(`   Health Check: GET /health`);
});

