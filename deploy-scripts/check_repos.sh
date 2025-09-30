#!/bin/bash
# === Safe Fulqrom Auto-Deploy Checker ===

# Enable strict error handling
set -euo pipefail

# Configuration
UI_DIR="/var/www/fulqrom-hub"
API_DIR="/var/www/fulqrom-hub-api"
DEPLOY_SCRIPT="/var/www/fulqrom-hub-api/deploy-scripts/deploy_fulqrom.sh"
STATE_FILE="/var/www/.deploy_state"
LOCK_FILE="/var/www/.deploy.lock"
LOG_FILE="/var/log/fulqrom-deploy.log"

# Logging function
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Cleanup function for lock file
cleanup() {
    rm -f "$LOCK_FILE"
}

# Check for concurrent runs
if [ -f "$LOCK_FILE" ]; then
    log_message "⚠️  Another deployment is in progress. Exiting."
    exit 0
fi

# Set lock and trap for cleanup
touch "$LOCK_FILE"
trap cleanup EXIT

# Verify directories exist
for dir in "$UI_DIR" "$API_DIR"; do
    if [ ! -d "$dir" ]; then
        log_message "❌ Directory $dir does not exist"
        exit 1
    fi
done

# Verify deploy script exists
if [ ! -f "$DEPLOY_SCRIPT" ]; then
    log_message "❌ Deploy script $DEPLOY_SCRIPT not found"
    exit 1
fi

# Initialize state file if missing
if [ ! -f "$STATE_FILE" ]; then
    log_message "Initializing deploy state..."
    echo "UI:" > "$STATE_FILE"
    echo "API:" >> "$STATE_FILE"
fi

# Read previous commit hashes
LAST_UI_HASH=$(grep "^UI:" "$STATE_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")
LAST_API_HASH=$(grep "^API:" "$STATE_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' ' || echo "")

# Get current remote hashes with timeout
CURRENT_UI_HASH=""
CURRENT_API_HASH=""

# Fetch UI hash with error handling
if timeout 30 git -C "$UI_DIR" ls-remote origin main > /tmp/ui_remote 2>/dev/null; then
    CURRENT_UI_HASH=$(awk '{print $1}' < /tmp/ui_remote)
else
    log_message "⚠️  Failed to fetch UI repository status"
    exit 1
fi

# Fetch API hash with error handling
if timeout 30 git -C "$API_DIR" ls-remote origin main > /tmp/api_remote 2>/dev/null; then
    CURRENT_API_HASH=$(awk '{print $1}' < /tmp/api_remote)
else
    log_message "⚠️  Failed to fetch API repository status"
    exit 1
fi

# Validate hash format (should be 40 char hex)
if ! [[ "$CURRENT_UI_HASH" =~ ^[a-f0-9]{40}$ ]]; then
    log_message "❌ Invalid UI hash format: $CURRENT_UI_HASH"
    exit 1
fi

if ! [[ "$CURRENT_API_HASH" =~ ^[a-f0-9]{40}$ ]]; then
    log_message "❌ Invalid API hash format: $CURRENT_API_HASH"
    exit 1
fi

# Determine if updates exist
UPDATE_NEEDED=false
CHANGES=""

if [ "$CURRENT_UI_HASH" != "$LAST_UI_HASH" ]; then
    UPDATE_NEEDED=true
    CHANGES="${CHANGES}UI "
fi

if [ "$CURRENT_API_HASH" != "$LAST_API_HASH" ]; then
    UPDATE_NEEDED=true
    CHANGES="${CHANGES}API "
fi

if [ "$UPDATE_NEEDED" = true ]; then
    log_message "🔄 Changes detected in: $CHANGES"
    log_message "   UI:  ${LAST_UI_HASH:0:8} → ${CURRENT_UI_HASH:0:8}"
    log_message "   API: ${LAST_API_HASH:0:8} → ${CURRENT_API_HASH:0:8}"

    # Run deployment with timeout (10 minutes max)
    if timeout 600 bash "$DEPLOY_SCRIPT" 2>&1 | tee -a "$LOG_FILE"; then
        log_message "✅ Deployment succeeded. Recording new hashes..."

        # Atomic state update
        cat > "$STATE_FILE.tmp" << EOF
UI:$CURRENT_UI_HASH
API:$CURRENT_API_HASH
EOF
        mv -f "$STATE_FILE.tmp" "$STATE_FILE"

        log_message "📝 State file updated successfully"
    else
        EXIT_CODE=$?
        log_message "❌ Deployment failed with exit code $EXIT_CODE. Keeping old state to retry next run."

        # Optional: Send alert (uncomment and configure as needed)
        # echo "Fulqrom deployment failed at $(date)" | mail -s "Deployment Failure" admin@example.com

        exit 1
    fi
else
    log_message "✅ No changes detected (UI: ${CURRENT_UI_HASH:0:8}, API: ${CURRENT_API_HASH:0:8})"
fi

# Cleanup old logs (keep last 30 days)
find "$(dirname "$LOG_FILE")" -name "$(basename "$LOG_FILE")*" -mtime +30 -delete 2>/dev/null || true