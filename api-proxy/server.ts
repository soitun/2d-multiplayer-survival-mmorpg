/**
 * Secure API Proxy Server
 * Routes OpenAI API calls through backend to keep API keys secure
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
  // Add your production client URL here (e.g., Railway client URL)
  process.env.CLIENT_URL || 'https://broth-and-bullets-client-production.up.railway.app'
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

if (!OPENAI_API_KEY) {
  console.error('❌ OpenAI API key not found in environment variables');
  console.error(`   Current working directory: ${process.cwd()}`);
  console.error(`   Please ensure OPENAI_API_KEY is set in Railway environment variables`);
  process.exit(1);
}

console.log('✅ API Proxy Server starting...');
console.log(`   OpenAI API: ${OPENAI_API_KEY ? 'Ready' : 'Not configured'}`);
console.log(`   Note: Kokoro TTS runs locally (no proxy needed)`);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    openaiConfigured: !!OPENAI_API_KEY
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Secure API Proxy Server running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   OpenAI Whisper: POST /api/whisper/transcribe`);
  console.log(`   OpenAI Chat: POST /api/openai/chat`);
  console.log(`   Health Check: GET /health`);
});

