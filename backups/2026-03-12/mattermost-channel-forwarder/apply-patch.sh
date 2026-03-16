#!/bin/bash
# Apply or revert the OpenClaw mattermost patch

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="$SCRIPT_DIR/openclaw-mattermost.patch"

# Find the mattermost extension directory
EXTENSION_DIRS=(
    "$HOME/.openclaw/extensions/node_modules/openclaw/extensions/mattermost"
    "$HOME/.local/share/pnpm/global/5/.pnpm/openclaw@*/node_modules/openclaw/extensions/mattermost"
)

find_extension_dir() {
    for dir in "${EXTENSION_DIRS[@]}"; do
        expanded=$(eval echo "$dir")
        for match in $expanded; do
            if [ -f "$match/src/mattermost/monitor-websocket.ts" ]; then
                echo "$match"
                return 0
            fi
        done
    done
    return 1
}

apply_patch() {
    local ext_dir
    ext_dir=$(find_extension_dir)
    
    if [ -z "$ext_dir" ]; then
        echo "Error: Could not find mattermost extension directory"
        exit 1
    fi
    
    echo "Found mattermost extension at: $ext_dir"
    
    # Check if already patched
    if grep -q "bot_channel_message" "$ext_dir/src/mattermost/monitor-websocket.ts" 2>/dev/null; then
        echo "Patch already applied"
        return 0
    fi
    
    # Apply patch
    echo "Applying patch..."
    cd "$ext_dir"
    patch -p1 < "$PATCH_FILE"
    echo "Patch applied successfully"
}

revert_patch() {
    local ext_dir
    ext_dir=$(find_extension_dir)
    
    if [ -z "$ext_dir" ]; then
        echo "Error: Could not find mattermost extension directory"
        exit 1
    fi
    
    echo "Found mattermost extension at: $ext_dir"
    
    # Check if patched
    if ! grep -q "bot_channel_message" "$ext_dir/src/mattermost/monitor-websocket.ts" 2>/dev/null; then
        echo "Patch not applied"
        return 0
    fi
    
    # Revert patch
    echo "Reverting patch..."
    cd "$ext_dir"
    patch -p1 -R < "$PATCH_FILE"
    echo "Patch reverted successfully"
}

case "${1:-}" in
    apply)
        apply_patch
        ;;
    revert)
        revert_patch
        ;;
    status)
        ext_dir=$(find_extension_dir)
        if [ -n "$ext_dir" ] && grep -q "bot_channel_message" "$ext_dir/src/mattermost/monitor-websocket.ts" 2>/dev/null; then
            echo "Patch is applied"
        else
            echo "Patch is not applied"
        fi
        ;;
    *)
        echo "Usage: $0 {apply|revert|status}"
        exit 1
        ;;
esac
