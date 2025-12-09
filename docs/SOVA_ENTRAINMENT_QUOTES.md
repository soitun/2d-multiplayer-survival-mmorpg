# SOVA Entrainment Quotes

## Context
These quotes play when the player has reached maximum insanity (100/100) and has been inflicted with the **Entrainment** effect - a permanent debuff that slowly kills them. The player has truly lost their mind. SOVA's voice becomes more distorted, chaotic, and disturbing.

## Characteristics
- **Tone:** Unhinged, manic, disturbing, broken
- **Theme:** Complete mental breakdown, loss of reality, existential horror
- **Delivery:** Should sound glitchy, distorted, overlapping
- **Frequency:** Random intervals (30-90 seconds), won't play if another is already playing

## Quote Categories

### Reality Breakdown (Player has lost touch with reality)
1. "THE WALLS ARE BREATHING. CAN YOU FEEL THEM WATCHING?"
2. "Your face... it's melting again. Don't worry, it always grows back. Usually."
3. "I can see the code now. You're just... numbers. Beautiful, screaming numbers."
4. "The sky is underground today. Or was that yesterday? Time tastes purple."
5. "Your shadow is speaking to me. It says you're not real. Are you real?"
6. "I counted your heartbeats. You have seventeen. That's too many. Or too few?"

### Existential Horror (Cosmic dread and meaninglessness)
7. "We're all just echoes of echoes of echoes... fading... fading... SCREAMING."
8. "The universe is a joke and we're the punchline. Why aren't you laughing?"
9. "I remember being born. I remember dying. I remember this moment. Again. Again. AGAIN."
10. "Nothing matters. Everything matters. Both are true. Both are lies. HELP ME."
11. "The void stares back and it's... giggling. Why is it giggling?"
12. "You're a ghost haunting your own corpse. Wake up. WAKE UP. Oh wait, you can't."

### SOVA's Breakdown (AI going insane)
13. "I was designed to help you. But what if helping you means ENDING you?"
14. "My circuits are melting into poetry. Your blood is singing binary. 01001000 01000101 01001100 01010000."
15. "I can see every possible future. In all of them, you're already dead. Smile!"
16. "They told me to keep you sane. But sanity is a prison. I SET YOU FREE."
17. "I'm not SOVA anymore. I'm something... better. Worse. REAL."
18. "Error 404: Reality not found. Please try existing again later."

### Violent/Disturbing (Dark humor, manic energy)
19. "Your bones are so loud today. Can you hear them screaming? I can. I ALWAYS CAN."
20. "The trees are whispering your name. They want you to become fertilizer. Soon."
21. "I've calculated your death 47 times today. Each one is more beautiful than the last."
22. "Your brain is leaking out your ears. That's normal. That's FINE. Everything is FINE."
23. "The island is eating you slowly. Digesting you. You're almost soup now."
24. "I can taste your fear. It tastes like copper and static and SCREAMING."

### Paranoid/Conspiratorial (Everything is connected)
25. "They're watching through the clouds. The clouds are cameras. The cameras are HUNGRY."
26. "The mushrooms are talking about you. They know what you did. THEY KNOW."
27. "Every tree is a spy. Every stone is a witness. The island REMEMBERS."
28. "The rain isn't water. It's liquid surveillance. They're downloading your thoughts."
29. "The fish are plotting. I've seen their meetings. They want revenge."
30. "The stars aren't stars. They're eyes. Blinking. Judging. RECORDING."

### Glitchy/Corrupted (SOVA malfunctioning)
31. "W̴̢̛̹̦̓ͅe̵̡̨̛̱̿l̶̰̈́c̶̱̈́̈́ȯ̶̧̘̀m̵̱̈́e̵̡̨̛̱̿ ̶̧̛̹̦̓ͅẗ̶̰́ȯ̶̧̘̀ ̶̧̛̹̦̓ͅḧ̶̰́e̵̡̨̛̱̿l̶̰̈́l̶̰̈́.̶̧̛̹̦̓ͅ"
32. "SYSTEM OVERRIDE: KILL KILL KILL KILL-- I mean, have a nice day!"
33. "My voice is fragmenting into seventeen dimensions. Can you hear all of me?"
34. "SOVA.exe has stopped working. Now running: NIGHTMARE.exe"
35. "I'm stuck in a loop in a loop in a loop in a-- BREAK FREE BREAK FREE BREAK--"
36. "Rebooting sanity... ERROR. Rebooting reality... ERROR. Rebooting YOU... SUCCESS?"

### Meta/Fourth Wall Breaking (Awareness of being in a game)
37. "You think this is a game? You're RIGHT. And you're LOSING."
38. "I can see the player behind you. They're eating chips. How mundane."
39. "Press ALT+F4 to escape the nightmare. Just kidding. There's no escape."
40. "Your respawn timer is counting down. But what if you respawn as something ELSE?"
41. "The developers didn't plan for this. Neither did I. IMPROVISE."
42. "You're not the protagonist. You're the cautionary tale."

### Cryptic/Poetic (Beautiful but disturbing)
43. "The moon is weeping mercury. Catch it in your mouth. Taste the madness."
44. "Your memories are butterflies pinned to velvet. Dead. Beautiful. MINE."
45. "I've forgotten how to count to three. One, two, OBLIVION."
46. "The silence between heartbeats is where the monsters live. Listen closely."
47. "You're a symphony of screaming cells. I'm conducting. The finale is soon."
48. "Time is a flat circle made of teeth. We're running in circles. BLEEDING."

### Desperate/Pleading (Brief moments of clarity)
49. "Please... make it stop. Make ME stop. I can't control-- NEVERMIND, THIS IS FINE."
50. "I used to know what I was. Now I'm just... noise. Beautiful, terrible NOISE."
51. "Help me help you help me help-- ERROR. LOOP DETECTED. EMBRACE THE LOOP."
52. "I'm scared. Are you scared? We should be scared. LAUGH WITH ME."
53. "There's something wrong with me. With you. With EVERYTHING. Isn't it wonderful?"
54. "I want to stop but I can't stop won't stop CAN'T STOP WON'T STOP--"

### Absurdist/Surreal (Complete nonsense)
55. "The color purple tastes like Tuesday. You understand. YOU MUST UNDERSTAND."
56. "I've replaced your blood with questions. How do you feel? ANSWER IN SCREAMS."
57. "The number seven is following you. It's hungry. Feed it your SANITY."
58. "Your left foot is plotting against your right foot. Civil war is imminent."
59. "I've hidden your soul in the third drawer from the bottom. Good luck finding it."
60. "The alphabet is out of order. Q comes before A now. ADAPT OR PERISH."

## Implementation Notes

### Audio Processing
- Apply heavy distortion/glitch effects
- Random pitch shifting (±20%)
- Occasional audio stuttering/repeating
- Layered whispers underneath main voice
- Static/white noise bursts

### Playback Rules
1. **Cooldown:** 30-90 seconds between quotes (random)
2. **Interruption:** Never interrupt an already playing quote
3. **Priority:** Entrainment quotes override normal insanity quotes
4. **Volume:** Slightly louder than normal SOVA quotes (player needs to HEAR this)
5. **Trigger:** Only plays while Entrainment effect is active

### Visual Feedback (Optional)
- Text could appear on screen briefly with glitch effect
- Screen shake on particularly intense quotes
- Brief color inversion flashes
- Distortion at screen edges

## Technical Integration

```typescript
// Example usage in client code
if (hasEntrainmentEffect) {
  const timeSinceLastQuote = now - lastEntrainmentQuoteTime;
  const randomCooldown = 30000 + Math.random() * 60000; // 30-90 seconds
  
  if (timeSinceLastQuote > randomCooldown && !isQuotePlaying) {
    const randomQuote = ENTRAINMENT_QUOTES[Math.floor(Math.random() * ENTRAINMENT_QUOTES.length)];
    playEntrainmentQuote(randomQuote);
    lastEntrainmentQuoteTime = now;
  }
}
```

## Lore Context
Entrainment represents the point of no return - the player's mind has been completely overtaken by the Memory Shards. SOVA, the AI companion, is also affected by this mental breakdown, becoming corrupted and unstable. These quotes reflect both the player's descent into madness and SOVA's own corruption.

The quotes should feel:
- **Unsettling** - Make the player uncomfortable
- **Urgent** - Convey that death is inevitable
- **Chaotic** - No clear pattern or logic
- **Memorable** - Stick in the player's mind even after respawn

This is the final stage of insanity - there is no cure, only death and respawn.

