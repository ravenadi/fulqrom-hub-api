#!/bin/bash
# === Safe Fulqrom Auto-Deploy Checker ===

UI_DIR="/var/www/fulqrom-hub"
API_DIR="/var/www/fulqrom-hub-api"
DEPLOY_SCRIPT="/var/www/fulqrom-hub-api/deploy-scripts/deploy_fulqrom.sh"

STATE_FILE="/var/www/.deploy_state"

# Initialize state file if missing
if [ ! -f "$STATE_FILE" ]; then
    echo "Initializing deploy state..."
    echo "UI:" > "$STATE_FILE"
    echo "API:" >> "$STATE_FILE"
fi

# Read previous commit hashes
LAST_UI_HASH=$(grep "^UI:" "$STATE_FILE" | cut -d':' -f2)
LAST_API_HASH=$(grep "^API:" "$STATE_FILE" | cut -d':' -f2)

# Get current remote hashes (no local pull)
CURRENT_UI_HASH=$(git -C "$UI_DIR" ls-remote origin main | awk '{print $1}')
CURRENT_API_HASH=$(git -C "$API_DIR" ls-remote origin main | awk '{print $1}')

# Determine if updates exist
UPDATE_NEEDED=false
if [ "$CURRENT_UI_HASH" != "$LAST_UI_HASH" ] || [ "$CURRENT_API_HASH" != "$LAST_API_HASH" ]; then
    UPDATE_NEEDED=true
fi

if [ "$UPDATE_NEEDED" = true ]; then
    echo "🔄 Changes detected at $(date). Starting deployment..."
    if bash "$DEPLOY_SCRIPT"; then
        echo "✅ Deployment succeeded. Recording new hashes..."
        echo "UI:$CURRENT_UI_HASH" > "$STATE_FILE.tmp"
        echo "API:$CURRENT_API_HASH" >> "$STATE_FILE.tmp"
        mv "$STATE_FILE.tmp" "$STATE_FILE"
    else
        echo "❌ Deployment failed. Keeping old state to retry next run."
    fi
else
    echo "✅ No changes detected at $(date)"
fi
