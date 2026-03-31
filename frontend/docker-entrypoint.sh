#!/bin/sh

# BACKEND_URL must be set — it's the public URL of the FastAPI backend service
# Example: https://your-backend.up.railway.app
if [ -z "$BACKEND_URL" ]; then
  echo "ERROR: BACKEND_URL environment variable is not set!"
  echo "Set it in Railway: railway variables set BACKEND_URL=https://your-backend.up.railway.app"
  exit 1
fi

# Railway injects $PORT — nginx MUST listen on it (not hardcoded 80)
LISTEN_PORT="${PORT:-80}"

# Extract hostname from BACKEND_URL for the Host header
BACKEND_HOST=$(echo "$BACKEND_URL" | sed 's|https\?://||' | sed 's|/.*||')

echo "Starting nginx on port $LISTEN_PORT → backend: $BACKEND_URL (host: $BACKEND_HOST)"

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen ${LISTEN_PORT};
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy API requests to FastAPI backend
    location /api/ {
        proxy_pass ${BACKEND_URL};
        proxy_ssl_server_name on;
        proxy_ssl_protocols TLSv1.2 TLSv1.3;
        proxy_set_header Host ${BACKEND_HOST};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_connect_timeout 30s;
        proxy_read_timeout 60s;
    }

    # Proxy WebSocket
    location /ws/ {
        proxy_pass ${BACKEND_URL};
        proxy_ssl_server_name on;
        proxy_ssl_protocols TLSv1.2 TLSv1.3;
        proxy_set_header Host ${BACKEND_HOST};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_read_timeout 86400;
    }

    # SPA routing — always serve index.html for client routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

# Start nginx
exec nginx -g "daemon off;"
