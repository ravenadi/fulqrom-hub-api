#!/bin/bash
# === Fulqrom Hub UI + API Deployment Script (Staging/Production) ===

# --- Configurable Paths ---
UI_DIR="/var/www/fulqrom-hub"
API_DIR="/var/www/fulqrom-hub-api"

# --- URLs ---
UI_URL="https://hub.ravenlabs.biz"
API_URL="https://api.hub.ravenlabs.biz"

# --- Function to update a project ---
update_project() {
    local DIR=$1
    local BUILD=$2   # "yes" or "no"

    echo "----------------------------------"
    echo "➡️  Updating project at: $DIR"
    echo "----------------------------------"

    cd "$DIR" || { echo "❌ Directory $DIR not found"; exit 1; }

    echo "🔄 Pulling latest code..."
    git pull

    echo "📦 Checking for dependency changes..."
    if git diff --name-only HEAD@{1} | grep -E 'package(-lock)?\.json' >/dev/null; then
        echo "⬇️  Installing dependencies..."
        npm install
    else
        echo "✅ No dependency changes. Skipping npm install."
    fi

    if [ "$BUILD" == "yes" ]; then
        echo "🏗️  Building production files..."
        npm run build
    fi
}

# --- Update & Build UI (React frontend) ---
update_project "$UI_DIR" "yes"

# --- Update API (no build step for backend) ---
update_project "$API_DIR" "no"

echo "🔄 Restarting API service..."
sudo systemctl restart fulqrom-hub-api

echo "✅ Deployment complete. Nginx will serve the new UI build."