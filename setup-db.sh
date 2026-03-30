#!/bin/bash
# Database setup and test script

echo "🗄️  Express Entry Database Setup"
echo "=================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set!"
    echo ""
    echo "To set it locally for testing:"
    echo "  export DATABASE_URL='postgresql://postgres:password@localhost:5432/express_entry'"
    echo ""
    echo "To set it on Railway:"
    echo "  1. Go to Railway Dashboard"
    echo "  2. Create PostgreSQL service"
    echo "  3. Copy DATABASE_URL from PostgreSQL variables"
    echo "  4. Add it to Backend service variables"
    exit 1
fi

echo "✅ DATABASE_URL is set"
echo "   URL: ${DATABASE_URL:0:50}..."
echo ""

# Try to connect
echo "🔗 Testing database connection..."
python3 << EOF
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
import sys

async def test_connection():
    try:
        engine = create_async_engine("$DATABASE_URL", echo=False)
        async with engine.begin() as conn:
            result = await conn.execute("SELECT 1")
            print("✅ Database connection successful!")
            return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False
    finally:
        await engine.dispose()

success = asyncio.run(test_connection())
sys.exit(0 if success else 1)
EOF

if [ $? -ne 0 ]; then
    echo ""
    echo "Connection test failed. Check your DATABASE_URL."
    exit 1
fi

echo ""
echo "🚀 Running database migrations..."
cd backend
alembic upgrade head

if [ $? -eq 0 ]; then
    echo "✅ Database tables created!"
else
    echo "⚠️  Migration issue - check logs above"
fi

echo ""
echo "✅ Database setup complete!"
echo ""
echo "Next: Deploy to Railway with DATABASE_URL set"
