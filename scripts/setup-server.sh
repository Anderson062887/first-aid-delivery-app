#!/bin/bash
# One-time setup script for Digital Ocean droplet
# Run this once when setting up the production server

set -e

echo "==> Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> Installing PM2 globally..."
sudo npm install -g pm2

echo "==> Setting up PM2 startup..."
pm2 startup systemd -u $USER --hp $HOME
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME

echo "==> Creating app directory..."
sudo mkdir -p /var/www/ic
sudo chown -R $USER:$USER /var/www/ic

echo "==> Creating log directory..."
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2

echo "==> Cloning repository..."
cd /var/www
git clone git@github.com:YOUR_USERNAME/ic.git

echo "==> Installing server dependencies..."
cd ic/server
npm ci --production

echo ""
echo "=========================================="
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "1. Create /var/www/ic/server/.env with:"
echo "   NODE_ENV=production"
echo "   PORT=4000"
echo "   MONGODB_URI=your-mongodb-connection-string"
echo "   JWT_SECRET=your-secure-random-string"
echo ""
echo "2. Start the server:"
echo "   cd /var/www/ic/server"
echo "   pm2 start ecosystem.config.cjs"
echo "   pm2 save"
echo ""
echo "3. Configure Nginx (if not already done)"
echo "=========================================="
