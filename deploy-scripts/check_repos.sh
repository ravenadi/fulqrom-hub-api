#!/bin/bash
# === Check if Fulqrom repos have new commits ===
UI_DIR="/var/www/fulqrom-hub"
API_DIR="/var/www/fulqrom-hub-api"
DEPLOY_SCRIPT="/var/www/fulqrom-hub-api/deploy-scripts/check_repos.sh"

# Track last deployed commit hashes
STATE_FILE="/var/www/.deploy_state"

# Initialize state file if missing
if [ ! -f "$STATE_FILE" ]; then
    echo "Initializing deploy state..."
    echo "UI:" > $STATE_FILE
    echo "API:" >> $STATE_FILE
fi

# Read previous commit hashes
LAST_UI_HASH=$(grep "^UI:" $STATE_FILE | cut -d':' -f2)
LAST_API_HASH=$(grep "^API:" $STATE_FILE | cut -d':' -f2)

# Get current remote hashes without pulling
CURRENT_UI_HASH=$(git -C $UI_DIR ls-remote origin main | awk '{print $1}')
CURRENT_API_HASH=$(git -C $API_DIR ls-remote origin main | awk '{print $1}')

# Compare and deploy if needed
if [ "$CURRENT_UI_HASH" != "$LAST_UI_HASH" ] || [ "$CURRENT_API_HASH" != "$LAST_API_HASH" ]; then
    echo "🔄 Changes detected. Running deployment..."
    bash $DEPLOY_SCRIPT
    echo "UI:$CURRENT_UI_HASH" > $STATE_FILE
    echo "API:$CURRENT_API_HASH" >> $STATE_FILE
else
    echo "✅ No changes detected at $(date)"
fi
