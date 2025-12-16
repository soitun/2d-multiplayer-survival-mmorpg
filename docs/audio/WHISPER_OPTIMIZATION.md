# Whisper Model Optimization

## Current Setup
- **Model**: `whisper-1` (currently the only model available via OpenAI API)
- **Language**: English (`en`)
- **Temperature**: `0` (deterministic, consistent output)
- **Response Format**: `verbose_json` (detailed metadata)

## Model Status

**OpenAI API currently only exposes `whisper-1`** as the model name, but OpenAI continuously improves it under the hood. There's no newer model name available yet.

## Optimization Options

### 1. **Prompt Parameter** (Best for accuracy improvement)
Add a prompt with game-specific terms to guide Whisper:

```typescript
prompt: 'SOVA operative agent survival crafting building inventory items weapons tools resources'
```

This helps Whisper recognize game-specific vocabulary like:
- "SOVA", "operative", "agent"
- Game items: "weapons", "tools", "resources"
- Actions: "crafting", "building", "inventory"

**Benefits:**
- ✅ Better accuracy for game-specific terms
- ✅ Improved recognition of technical jargon
- ✅ Reduced errors with proper nouns

### 2. **Temperature** (Already optimized)
Currently set to `0` for consistency.

### 3. **Language** (Already optimized)
Set to `en` for English-only input.

## Implementation

The code now supports adding a `prompt` parameter. You can enable it by uncommenting the prompt in `whisperService.ts`:

```typescript
prompt: 'SOVA operative agent survival crafting building inventory items weapons tools resources'
```

## Alternative Models (If Needed)

If you need better accuracy or features, consider:
- **Deepgram** - Often faster and more accurate
- **AssemblyAI** - Better for real-time streaming
- **Google Speech-to-Text** - Good multilingual support

But for now, `whisper-1` with optimized parameters is excellent!

