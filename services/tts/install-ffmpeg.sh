#!/bin/bash
set -euo pipefail

# Create necessary directories
mkdir -p /tmp/audio-processing
chmod 777 /tmp/audio-processing

  echo "Installing audio processing tools..."
  sudo apt-get update -qq
  
  # Install required packages
  sudo apt-get install -y --no-install-recommends \
    ffmpeg \
    libmp3lame0 \
    libopus0 \
    libvorbisenc2 \
    libfdk-aac2 \
    sox \
    libsox-fmt-mp3
  
  # Verify installations
  echo "Verifying installed versions:"
  ffmpeg -version | head -n 1
  ffprobe -version | head -n 1
  sox --version

  # Clean up to reduce image size
  sudo apt-get clean
  sudo rm -rf /var/lib/apt/lists/*

# Create symbolic links for consistent paths
ln -sf $(which ffmpeg) /usr/local/bin/ffmpeg
ln -sf $(which ffprobe) /usr/local/bin/ffprobe
ln -sf $(which sox) /usr/local/bin/sox

# Verify all tools are available
echo "Final tool verification:"
command -v ffmpeg
command -v ffprobe
command -v sox

echo "Audio processing environment ready"
