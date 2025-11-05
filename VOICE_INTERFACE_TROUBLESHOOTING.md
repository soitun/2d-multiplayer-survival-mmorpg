# Troubleshooting Voice Interface Issues

## Common Issues and Solutions

### Issue: Microphone Not Detecting Speech

#### 1. Check Browser Console
Open your browser's Developer Tools (F12) and check the Console tab for error messages. Look for:
- `[Whisper]` - Recording service logs
- `[VoiceInterface]` - Voice interface logs
- Any red error messages

#### 2. Microphone Permissions

**Chrome/Edge:**
1. Click the lock icon (🔒) or info icon (ⓘ) in the address bar
2. Find "Microphone" in the permissions list
3. Set to "Allow" (not "Block" or "Ask")

**Firefox:**
1. Click the lock icon in the address bar
2. Click "More Information"
3. Go to "Permissions" tab
4. Set Microphone to "Allow"

**Safari:**
1. Safari → Settings → Websites → Microphone
2. Set your site to "Allow"

#### 3. Check Microphone Hardware
- Ensure microphone is connected and working
- Test in another app (e.g., Windows Voice Recorder)
- Check Windows Sound Settings → Input devices

#### 4. Browser-Specific Issues

**Chrome/Edge:**
- Works best with HTTPS (localhost is OK)
- May need to allow microphone access in Windows Privacy Settings

**Firefox:**
- May require explicit permission prompt
- Check `about:preferences#privacy` → Permissions → Microphone

#### 5. Common Error Messages

**"Microphone permission denied"**
- Solution: Allow microphone access in browser settings (see above)

**"No microphone found"**
- Solution: Connect a microphone and refresh the page

**"Microphone is already in use"**
- Solution: Close other apps using the microphone (Zoom, Discord, etc.)

**"Voice recording not supported in this browser"**
- Solution: Use a modern browser (Chrome, Firefox, Edge)

**"OpenAI API key not configured"**
- Solution: Add `OPENAI_API_KEY` to your `.env` file

#### 6. Test Microphone Access

Open browser console and run:
```javascript
navigator.mediaDevices.getUserMedia({ audio: true })
  .then(stream => {
    console.log('✅ Microphone access granted');
    stream.getTracks().forEach(track => track.stop());
  })
  .catch(err => {
    console.error('❌ Microphone access failed:', err);
  });
```

#### 7. Check Network Tab
- Ensure Whisper API calls are being made
- Check if API key is valid (should return 200, not 401/403)

#### 8. Debug Steps

1. **Check if recording starts:**
   - Look for `[VoiceInterface] ✅ Recording started successfully` in console
   - Voice interface should show "LISTENING..." status

2. **Check if audio is captured:**
   - Look for `[Whisper] Audio track info:` in console
   - Should show microphone label and settings

3. **Check if transcription is attempted:**
   - Look for `[Whisper] 🎙️ Starting transcription` in console
   - Check Network tab for API call to OpenAI

4. **Check API response:**
   - Look for `[Whisper] ⚡ Whisper response received` in console
   - Check if transcription text appears

### Still Not Working?

1. **Clear browser cache** and reload
2. **Try a different browser** (Chrome, Firefox, Edge)
3. **Check firewall/antivirus** - may be blocking microphone access
4. **Restart browser** completely
5. **Check Windows Privacy Settings:**
   - Windows Settings → Privacy → Microphone
   - Ensure "Allow apps to access your microphone" is ON

### Testing Checklist

- [ ] Browser console shows no errors
- [ ] Microphone permission is granted
- [ ] Microphone works in other apps
- [ ] `OPENAI_API_KEY` is set in `.env`
- [ ] Voice interface shows "LISTENING..." when V key is held
- [ ] Console shows `[Whisper] ✅ Recording started successfully`
- [ ] Network tab shows API call to OpenAI when releasing V key

