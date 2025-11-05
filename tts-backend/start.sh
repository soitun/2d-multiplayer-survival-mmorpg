#!/bin/bash
# Startup script for Kokoro TTS Backend Service

echo "🚀 Starting Kokoro TTS Backend Service..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install/upgrade dependencies
echo "📥 Installing dependencies..."
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Check if espeak-ng is installed
if ! command -v espeak-ng &> /dev/null; then
    echo "⚠️  Warning: espeak-ng not found. Please install it:"
    echo "   Ubuntu/Debian: sudo apt-get install espeak-ng"
    echo "   macOS: brew install espeak-ng"
    echo "   Windows: Download from https://github.com/espeak-ng/espeak-ng/releases"
fi

# Start the service
echo "🎤 Starting TTS service on port 8001..."
python app.py

