#!/bin/bash
# Frontend Deployment Script
# Supports Railway, Render, and Vercel

set -e

FRONTEND_DIR="/Users/dhruv.rajput/Downloads/express_entry/frontend"
PROJECT_DIR="/Users/dhruv.rajput/Downloads/express_entry"

echo "🚀 Express Entry Frontend Deployment"
echo "===================================="
echo ""

# Determine deployment target
if [ -z "$1" ]; then
    echo "Usage: $0 [railway|render|vercel|local]"
    echo ""
    echo "Examples:"
    echo "  $0 railway  - Deploy to Railway"
    echo "  $0 render   - Deploy to Render"
    echo "  $0 vercel   - Deploy to Vercel"
    echo "  $0 local    - Build and preview locally"
    exit 1
fi

TARGET=$1

# Build frontend
echo "📦 Building frontend..."
cd "$FRONTEND_DIR"
npm install
npm run build

if [ "$TARGET" == "local" ]; then
    echo "✅ Build complete! Running preview..."
    npm run preview
    exit 0
fi

if [ "$TARGET" == "railway" ]; then
    echo "🚄 Deploying to Railway..."
    cd "$PROJECT_DIR"
    
    # Check if we want multi-service or just frontend
    echo "Deploy to:"
    echo "1. Same Railway project (both backend + frontend)"
    echo "2. Separate Railway frontend service"
    read -p "Choose (1 or 2): " choice
    
    if [ "$choice" == "1" ]; then
        echo "Using multi-service configuration..."
        cp railway.json.multi-service railway.json
        railway up --detach
        echo "✅ Deployment initiated (multi-service)"
    else
        echo "Deploying frontend service only..."
        cd "$FRONTEND_DIR"
        railway up --detach
        echo "✅ Frontend deployed to Railway"
    fi
    
    echo ""
    echo "To check deployment status:"
    echo "  railway status"
    echo "  railway logs --service frontend"
    
fi

if [ "$TARGET" == "render" ]; then
    echo "🎨 Deploying to Render..."
    
    # Check if render CLI is installed
    if ! command -v render &> /dev/null; then
        echo "❌ Render CLI not found. Install it first:"
        echo "  npm install -g render-cli"
        exit 1
    fi
    
    cd "$FRONTEND_DIR"
    render deploy
    echo "✅ Frontend deployed to Render"
    
fi

if [ "$TARGET" == "vercel" ]; then
    echo "⚡ Deploying to Vercel..."
    
    # Check if vercel CLI is installed
    if ! command -v vercel &> /dev/null; then
        echo "❌ Vercel CLI not found. Install it first:"
        echo "  npm install -g vercel"
        exit 1
    fi
    
    cd "$FRONTEND_DIR"
    vercel --prod
    echo "✅ Frontend deployed to Vercel"
    
    echo ""
    echo "🔗 To set environment variables in Vercel:"
    echo "  1. Go to: https://vercel.com/dashboard"
    echo "  2. Select your project"
    echo "  3. Settings → Environment Variables"
    echo "  4. Add: VITE_API_URL = https://express-entry-production.up.railway.app"
    echo "  5. Redeploy"
    
fi

echo ""
echo "✨ Deployment script complete!"
echo ""
echo "🔗 Backend URL: https://express-entry-production.up.railway.app"
echo ""
echo "Next steps:"
echo "1. Verify frontend deployed successfully"
echo "2. Check environment variables are set correctly"
echo "3. Test API connectivity from frontend"
echo "4. Monitor logs for errors"
