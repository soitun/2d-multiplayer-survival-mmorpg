# SOVA Insanity Quotes for ElevenLabs Voice Generation

## Overview
These quotes are designed to be **diagetically relevant** - they describe the player's current mental state rather than indicating direction of change. This means they work whether insanity is increasing (0→25%) or decreasing (50%→25%), avoiding the "reverse recording" effect.

## SOVA's Speaking Style
- Professional, tactical, military-focused
- Concise (under 2 sentences)
- Slightly robotic but with subtle personality
- Shows concern for the operative's wellbeing
- Technical/medical terminology appropriate for an AI assistant

---

## 25% Threshold (First Warning - 3 variations)

**sova_insanity_25_1.mp3**
> "Detecting minor neural fluctuations. Recommend monitoring your cognitive load, operative."

**sova_insanity_25_2.mp3**
> "Neural patterns showing slight irregularities. Your mental state requires attention."

**sova_insanity_25_3.mp3**
> "I'm reading some unusual activity in your neural pathways. Stay alert, operative."

---

## 50% Threshold (Moderate Warning - 3 variations)

**sova_insanity_50_1.mp3**
> "Significant neural disruption detected. Your cognitive functions are being compromised."

**sova_insanity_50_2.mp3**
> "Operative, I'm seeing concerning patterns in your neural readings. You need to rest."

**sova_insanity_50_3.mp3**
> "Warning: Your mental state is deteriorating. I recommend immediate rest and recovery."

---

## 75% Threshold (Severe Warning - 3 variations)

**sova_insanity_75_1.mp3**
> "Critical neural degradation detected. Your mind is fracturing, operative. Seek safety immediately."

**sova_insanity_75_2.mp3**
> "Operative, your neural pathways are severely compromised. I'm losing coherence in your readings."

**sova_insanity_75_3.mp3**
> "This is serious. Your cognitive functions are failing. You're not thinking clearly anymore."

---

## 90% Threshold (Critical Warning - 3 variations)

**sova_insanity_90_1.mp3**
> "Operative, your mind is breaking apart. I can barely maintain neural synchronization. Get help."

**sova_insanity_90_2.mp3**
> "Critical failure imminent. Your neural patterns are collapsing. I'm... I'm losing you."

**sova_insanity_90_3.mp3**
> "The shards are consuming you. Your thoughts are no longer your own. Please, operative, stop."

---

## 100% Threshold (Maximum - Entrainment - 3 variations)

**sova_insanity_100_1.mp3**
> "Neural entrainment complete. I can no longer distinguish your thoughts from the shard's data streams. You're gone."

**sova_insanity_100_2.mp3**
> "Operative... I'm sorry. The entrainment is irreversible. Your consciousness has been overwritten."

**sova_insanity_100_3.mp3**
> "Connection lost. The operative I knew is no longer present. Only the shard's echo remains."

---

## Design Philosophy

### Why These Work Bidirectionally:
1. **State-based, not progression-based**: Each quote describes the current mental state, not whether it's improving or worsening
2. **Contextual observations**: SOVA is reporting what she's detecting right now, which makes sense regardless of direction
3. **Medical/tactical framing**: Using technical language ("neural patterns", "cognitive functions") makes it feel like real-time monitoring
4. **Emotional progression**: The quotes get more desperate/concerned as insanity increases, but this works both ways - if you're at 50% and drop to 25%, hearing "minor neural fluctuations" makes sense as an improvement

### Example Scenarios:
- **0% → 25%**: "Detecting minor neural fluctuations" - SOVA notices something new
- **50% → 25%**: "Detecting minor neural fluctuations" - SOVA reports improvement (still accurate, just less severe)
- **75% → 50%**: "Significant neural disruption detected" - Still accurate, just less critical than before

The key is that SOVA is always reporting the **current state**, not the **change**. This makes the quotes feel natural regardless of direction.

---

## Voice Generation Notes

- **Tone**: Professional but increasingly concerned as insanity rises
- **Pacing**: Slightly slower and more deliberate at higher thresholds
- **Emotion**: Subtle worry at 25-50%, growing alarm at 75-90%, resignation/grief at 100%
- **Volume**: Normal at lower thresholds, slightly quieter/more strained at higher thresholds (as if SOVA herself is being affected)

