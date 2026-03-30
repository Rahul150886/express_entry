#!/bin/bash

# Express Entry - Railway Deployment Script
# This script automates the entire deployment process

set -e

echo "🚀 Express Entry - Railway Deployment"
echo "======================================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found!"
    echo "Installing Railway CLI..."
    npm install -g @railway/cli
fi

echo "✅ Railway CLI found"
echo ""

# Check if user is logged in
echo "🔐 Checking Railway login..."
if ! railway whoami &> /dev/null; then
    echo "⚠️  Not logged in. Opening login page..."
    railway login
fi

echo "✅ You are logged in"
echo ""

# Initialize Railway project
echo "📦 Initializing Railway project..."
if [ ! -f "railway.json" ]; then
    railway init
else
    echo "✅ railway.json already exists"
fi

echo ""
echo "🗄️  Adding PostgreSQL database..."
read -p "Add PostgreSQL? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway add
fi

echo ""
echo "📍 Adding Redis cache..."
read -p "Add Redis? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    railway add
fi

echo ""
echo "🚢 Deploying to Railway..."
railway up

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Your deployment details:"
railway status

echo ""
echo "🌐 Opening Railway dashboard..."
railway open

echo ""
echo "✨ All done! Your app is now live!"
echo ""
echo "📝 Next steps:"
echo "1. Set environment variables in Railway dashboard"
echo "2. Run database migrations: railway shell"
echo "3. Visit your frontend URL to see the app"
echo "4. Check logs: railway logs"
echo ""
