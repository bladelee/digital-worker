#!/bin/bash
# Build the Mattermost plugin using Docker with Go proxy

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ID="com.openclaw.bot-channel-forwarder"
PLUGIN_VERSION="1.0.0"

echo "Building Mattermost plugin using Docker..."

# Build using golang container with GOPROXY set to direct (fetch from source)
docker run --rm \
    -v "$SCRIPT_DIR:/app" \
    -w /app \
    -e GOPROXY=https://goproxy.cn,https://proxy.golang.org,direct \
    golang:1.24 \
    bash -c "
        set -e
        cd /app
        
        # Remove old module files
        rm -f go.mod go.sum
        
        # Initialize new module
        go mod init github.com/openclaw/mattermost-channel-forwarder
        
        # Get mattermost public package with specific version
        go get github.com/mattermost/mattermost/server/public@v0.2.1
        go mod tidy
        
        # Create output directory
        mkdir -p server/dist
        
        # Build for Linux AMD64
        CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags='-s -w' -o server/dist/plugin-linux-amd64 .
        
        echo 'Build complete!'
    "

# Create distribution package
echo "Creating distribution package..."
cd "$SCRIPT_DIR"
tar -czf ${PLUGIN_ID}-${PLUGIN_VERSION}.tar.gz manifest.json server/

echo ""
echo "Build successful!"
echo "Plugin package: ${PLUGIN_ID}-${PLUGIN_VERSION}.tar.gz"
echo ""
echo "To install:"
echo "1. Upload to Mattermost: System Console > Plugins > Plugin Management > Upload Plugin"
echo "2. Or use API: curl -X POST -H 'Authorization: Bearer <token>' -F 'plugin=@${PLUGIN_ID}-${PLUGIN_VERSION}.tar.gz' http://localhost:8065/api/v4/plugins"
