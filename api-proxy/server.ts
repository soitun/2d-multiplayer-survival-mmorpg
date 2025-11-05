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

// Load environment variables from project root (one level up)
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// Debug: Log where we're looking for .env
console.log(`[Proxy] Looking for .env at: ${envPath}`);
console.log(`[Proxy] .env file exists: ${fs.existsSync(envPath)}`);

const app = express();
const PORT = process.env.PROXY_PORT || 8002;

// Middleware
app.use(cors({
  origin: ['http://localhost:3008', 'http://localhost:5173'], // Your Vite dev server
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: 'audio/*', limit: '50mb' }));

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
  console.error(`   Checked path: ${envPath}`);
  console.error(`   Current working directory: ${process.cwd()}`);
  console.error(`   Available env vars: ${Object.keys(process.env).filter(k => k.includes('OPENAI')).join(', ') || 'none'}`);
  process.exit(1);
}

console.log('✅ API Proxy Server starting...');
console.log(`   OpenAI API Key: ${OPENAI_API_KEY ? 'Configured' : 'Missing'}`);
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
      formData.append('file', audioBuffer, {
        filename: req.body.filename || 'audio.webm',
        contentType: req.body.contentType || 'audio/webm'
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
      },
      body: formData,
    });

    const data = await response.json();
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

app.listen(PORT, () => {
  console.log(`🚀 Secure API Proxy Server running on http://localhost:${PORT}`);
  console.log(`   OpenAI Whisper: POST /api/whisper/transcribe`);
  console.log(`   OpenAI Chat: POST /api/openai/chat`);
});

