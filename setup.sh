#!/bin/bash

# Linux Web Crawler Setup Script
# For Debian/Ubuntu systems

set -e

echo "🕷️  Linux Web Crawler Setup Script"
echo "=================================="
echo ""

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo "❌ This script should not be run as root"
   exit 1
fi

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js (if not present)
if ! command -v node &> /dev/null; then
    echo "📥 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
else
    echo "✅ Node.js already installed: $(node --version)"
fi

# Install system dependencies
echo "🔧 Installing system dependencies..."
sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    python3 \
    python3-pip

# Install Puppeteer dependencies
echo "🎭 Installing Puppeteer dependencies..."
sudo apt install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

# Create project structure
echo "📁 Creating project structure..."
mkdir -p logs data screenshots

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Make scripts executable
chmod +x src/index.js
chmod +x src/test-crawler.js
chmod +x src/scheduler.js

# Create environment file
echo "⚙️  Creating environment configuration..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from template"
else
    echo "⚠️  .env file already exists, skipping creation"
fi

# Create systemd service (optional)
echo "🔧 Creating systemd service..."
cat > linux-web-crawler.service << EOF
[Unit]
Description=Linux Web Crawler Scheduler
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node src/scheduler.js start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Test installation
echo "🧪 Testing installation..."
node src/test-crawler.js run

# Create cron setup helper
echo "⏰ Creating cron setup helper..."
cat > setup-cron.sh << 'EOF'
#!/bin/bash

# Cron setup helper for Linux Web Crawler

echo "Setting up cron jobs for web crawler..."

# Create cron job for daily crawling
(crontab -l 2>/dev/null; echo "0 9 * * * cd $(pwd) && node src/index.js crawl -u 'https://example.com' >> logs/cron.log 2>&1") | crontab -

# Create cron job for weekly report
(crontab -l 2>/dev/null; echo "0 10 * * 1 cd $(pwd) && node src/index.js crawl -u 'https://example.com' --method puppeteer --screenshots >> logs/weekly.log 2>&1") | crontab -

# Create cron job for log cleanup (keep 30 days)
(crontab -l 2>/dev/null; echo "0 2 * * * find $(pwd)/logs -name '*.log' -mtime +30 -delete") | crontab -

echo "✅ Cron jobs added!"
echo "Current crontab:"
crontab -l
EOF

chmod +x setup-cron.sh

# Create monitoring script
echo "📊 Creating monitoring script..."
cat > monitor.sh << 'EOF'
#!/bin/bash

# Monitoring script for Linux Web Crawler

echo "🕷️  Linux Web Crawler Monitor"
echo "==============================="
echo ""

# Check if Node.js is running
if pgrep -f "node.*src/index.js" > /dev/null; then
    echo "✅ Crawler is running"
else
    echo "❌ Crawler is not running"
fi

# Check disk usage
echo ""
echo "💾 Disk Usage:"
df -h $(pwd) | tail -1

# Check log file sizes
echo ""
echo "📄 Log Files:"
ls -lh logs/ 2>/dev/null || echo "No logs directory found"

# Check recent activity
echo ""
echo "📊 Recent Activity:"
if [ -f logs/crawler.log ]; then
    echo "Last 5 log entries:"
    tail -5 logs/crawler.log
else
    echo "No crawler log found"
fi

# Check data files
echo ""
echo "📁 Data Files:"
ls -lh data/ 2>/dev/null | tail -5 || echo "No data directory found"

# Check system resources
echo ""
echo "🔧 System Resources:"
echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"
echo "Memory Usage: $(free -h | grep Mem | awk '{printf "%.1f%%", $3/$2 * 100.0}')"
EOF

chmod +x monitor.sh

# Create uninstall script
echo "🗑️  Creating uninstall script..."
cat > uninstall.sh << 'EOF'
#!/bin/bash

echo "🗑️  Uninstalling Linux Web Crawler..."

# Remove cron jobs
crontab -l | grep -v "linux-web-crawler" | crontab -
echo "✅ Removed cron jobs"

# Stop any running processes
pkill -f "node.*src/index.js" || true
pkill -f "node.*src/scheduler.js" || true
echo "✅ Stopped running processes"

# Remove systemd service
sudo systemctl stop linux-web-crawler.service 2>/dev/null || true
sudo systemctl disable linux-web-crawler.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/linux-web-crawler.service
echo "✅ Removed systemd service"

# Clean up logs and data (optional)
read -p "Delete all logs and data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf logs/ data/ screenshots/
    echo "✅ Removed logs and data"
fi

echo "✅ Uninstallation complete!"
EOF

chmod +x uninstall.sh

# Create example usage script
echo "📝 Creating example usage script..."
cat > examples.sh << 'EOF'
#!/bin/bash

echo "🕷️  Linux Web Crawler Examples"
echo "=============================="
echo ""

echo "1. Basic crawling:"
echo "   node src/index.js crawl -u 'https://example.com'"
echo ""

echo "2. Deep crawling with custom settings:"
echo "   node src/index.js crawl -u 'https://example.com' --depth 3 --max-pages 50"
echo ""

echo "3. Crawl with screenshots:"
echo "   node src/index.js crawl -u 'https://example.com' --method puppeteer --screenshots"
echo ""

echo "4. Test all methods:"
echo "   node src/test-crawler.js run"
echo ""

echo "5. Start scheduler:"
echo "   node src/scheduler.js start"
echo ""

echo "6. Monitor system:"
echo "   ./monitor.sh"
echo ""

echo "7. View logs:"
echo "   tail -f logs/crawler.log"
echo ""

echo "For more examples, see README.md"
EOF

chmod +x examples.sh

# Final setup verification
echo "🔍 Verifying setup..."
node --version
npm --version

# Test basic functionality
echo "🧪 Testing basic functionality..."
node src/test-crawler.js run

# Create git repository if not exists
if [ ! -d .git ]; then
    git init
    echo "node_modules/" > .gitignore
    echo "logs/" >> .gitignore
    echo "data/" >> .gitignore
    echo "screenshots/" >> .gitignore
    echo ".env" >> .gitignore
    echo "✅ Git repository initialized"
fi

echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "📚 Quick Start:"
echo "1. Run tests: ./examples.sh"
echo "2. Start crawling: node src/index.js crawl -u 'https://example.com'"
echo "3. View logs: tail -f logs/crawler.log"
echo "4. Monitor system: ./monitor.sh"
echo "5. Setup cron: ./setup-cron.sh"
echo ""
echo "📖 For detailed instructions, see README.md"
echo "🎥 Record your setup process for the Loom video!"
echo ""

# Save setup log
echo "Setup completed at $(date)" > logs/setup.log
echo "Node.js version: $(node --version)" >> logs/setup.log
echo "System: $(uname -a)" >> logs/setup.log