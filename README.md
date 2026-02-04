# IPFS Supernode Monitoring Service

A lightweight Node.js service that runs **locally on the IPFS supernode** to provide real-time system metrics, IPFS repository statistics, and operational data that cannot be accessed remotely.

## Purpose

The main 3Speak Storage Admin tool connects remotely (MongoDB + HTTPS gateway), so it cannot access:
- Local file system (GC logs, repo sizes)
- System metrics (RAM, disk usage, uptime)
- Local IPFS daemon statistics
- Service status information

This monitoring service fills that gap by running on the supernode itself.

---

## ⚠️ CRITICAL: What We Monitor

### New Repository (SAFE TO MONITOR)
- **Path**: `/pool0/ipfs/.ipfs-new`
- **Daemon Port**: 5001 (API), 8081 (gateway)
- **Size**: ~1-2 GB (small, grows daily)
- **Operations**: ✅ ALL metrics safe
  - `du -sb` for size
  - `find` for block count
  - `ipfs pin ls` for pin count
  - `ipfs stats repo` for repo stats

### Old Repository (⚠️ DANGEROUS - LIMITED MONITORING ONLY)
- **Path**: `/pool0/ipfs/.ipfs`
- **Daemon Port**: 5002 (API), 8080 (gateway)
- **Size**: 81.6 TB (MASSIVE)
- **Operations**: 
  - ❌ **NEVER** run `du -sb` or `du -sh` on `/pool0/ipfs/.ipfs/blocks` (will spike RAM to 120GB+)
  - ❌ **NEVER** run `find` with full traversal (will hang for hours)
  - ✅ **SAFE**: `ipfs pin ls | wc -l` (count pins via daemon API)
  - ✅ **SAFE**: `ipfs stats repo` (daemon provides cached stats)
  - ✅ **SAFE**: Check if daemon is running via `ipfs id`

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Copy example config
cp .env.example .env

# Generate a secure secret key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Edit .env and set SECRET_KEY
nano .env
```

### 3. Build and Run

```bash
# Build TypeScript
npm run build

# Start service
npm start

# Or for development with auto-reload
npm run dev
```

### 4. Test Endpoint

```bash
# Health check (no auth)
curl http://localhost:3001/health

# Stats endpoint (with auth)
curl -H "Authorization: Bearer YOUR_SECRET_KEY" \
  http://localhost:3001/api/node-stats
```

---

## Project Structure

```
3speak-node-monitor/
├── package.json
├── tsconfig.json
├── .env.example
├── .env                    # SECRET_KEY configuration
├── README.md
├── src/
│   ├── index.ts           # Express server entry point
│   ├── config.ts          # Configuration and constants
│   ├── middleware/
│   │   └── auth.ts        # Header-based auth middleware
│   └── services/
│       ├── system.ts      # System metrics (RAM, disk, uptime)
│       ├── ipfs.ts        # IPFS daemon queries
│       └── gc-logs.ts     # Parse GC log files
└── dist/                  # Compiled JavaScript (generated)
```

---

## API Endpoint

### `GET /api/node-stats`

**Headers:**
```
Authorization: Bearer <SECRET_KEY>
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2026-02-04T17:45:00.000Z",
  "data": {
    "system": {
      "hostname": "ipfs-supernode-1",
      "uptime": 432000,
      "uptimeHuman": "5 days",
      "memory": {
        "totalGB": 128,
        "usedGB": 21,
        "freeGB": 107,
        "percentUsed": 16
      },
      "disk": {
        "path": "/pool0",
        "totalTB": 90,
        "usedTB": 81.6,
        "freeTB": 8.4,
        "percentUsed": 90
      },
      "loadAverage": [2.34, 2.56, 2.12]
    },
    "ipfs": {
      "newRepo": {
        "path": "/pool0/ipfs/.ipfs-new",
        "sizeGB": "1.2",
        "blockCount": 945,
        "pinCount": 68,
        "daemonRunning": true,
        "version": "0.38.1",
        "peerCount": 100
      },
      "oldRepo": {
        "path": "/pool0/ipfs/.ipfs",
        "sizeTB": "81.6",
        "blockCount": null,
        "pinCount": 381434,
        "daemonRunning": true,
        "version": "0.38.1",
        "peerCount": 100
      }
    },
    "gc": {
      "lastRun": "2026-02-04T03:00:00.000Z",
      "lastRunHuman": "14 hours ago",
      "blocksRemoved": 945,
      "durationSeconds": 134,
      "durationHuman": "2m 14s",
      "nextScheduled": "2026-02-05T03:00:00.000Z",
      "status": "success",
      "logPath": "/var/log/ipfs-gc-new.log"
    }
  }
}
```

---

## Configuration

All configuration is done via the `.env` file:

```bash
# Generate secret key
SECRET_KEY=your-secret-key-here

# Server port
PORT=3001

# IPFS Repositories
IPFS_NEW_PATH=/pool0/ipfs/.ipfs-new
IPFS_OLD_PATH=/pool0/ipfs/.ipfs

# Monitoring paths
GC_LOG_PATH=/var/log/ipfs-gc-new.log
DISK_MOUNT=/pool0

# Feature flags
MONITOR_NEW_REPO_SIZE=true
MONITOR_NEW_REPO_BLOCKS=true
MONITOR_NEW_REPO_PINS=true
MONITOR_OLD_REPO_SIZE=false        # ⚠️ DANGEROUS - NEVER ENABLE
MONITOR_OLD_REPO_BLOCKS=false       # ⚠️ DANGEROUS - NEVER ENABLE
MONITOR_OLD_REPO_PINS=true          # ✅ SAFE - via daemon API only
```

---

## Production Deployment

### Option 1: systemd Service

Create `/etc/systemd/system/node-monitor.service`:

```ini
[Unit]
Description=3Speak Node Monitor Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/3speak-node-monitor
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable node-monitor
sudo systemctl start node-monitor
sudo systemctl status node-monitor
```

### Option 2: PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start service
pm2 start dist/index.js --name node-monitor

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

---

## Nginx Configuration

Add to your nginx config (e.g., `/etc/nginx/sites-enabled/ipfs-3speak`):

```nginx
# Node monitoring service (internal only)
location /api/node-stats {
    proxy_pass http://127.0.0.1:3001/api/node-stats;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Authorization $http_authorization;
    
    # Optional: Rate limiting
    limit_req zone=monitor burst=5;
    
    # Optional: Restrict to specific IPs
    # allow 192.168.1.0/24;
    # allow YOUR_ADMIN_IP;
    # deny all;
}
```

Reload nginx:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Security

1. **Secret Key**: 
   - Use strong random key (32+ bytes)
   - Never commit `.env` to git
   - Rotate periodically

2. **Network Exposure**:
   - Service listens on `127.0.0.1:3001` only
   - Only accessible via nginx proxy
   - Nginx can add IP restrictions

3. **File Permissions**:
   - `.env` should be 600 (owner read/write only)
   - Service may need root for system metrics

4. **⚠️ Old Repo Protection**:
   - Feature flags prevent dangerous operations on old repo
   - Code explicitly checks `isNewRepo` flag
   - Never modify these flags without understanding RAM implications

---

## Monitoring & Logs

### Check Service Status:
```bash
# systemd
sudo systemctl status node-monitor
sudo journalctl -u node-monitor -f

# PM2
pm2 status
pm2 logs node-monitor
```

### Update Service:
```bash
cd /opt/3speak-node-monitor
git pull
npm install
npm run build
sudo systemctl restart node-monitor  # or: pm2 restart node-monitor
```

---

## Troubleshooting

### Service won't start
- Check `.env` file exists and has `SECRET_KEY`
- Verify paths in `.env` exist on filesystem
- Check logs: `journalctl -u node-monitor -n 50`

### Stats endpoint returns errors
- Ensure IPFS daemons are running
- Check IPFS paths are correct
- Verify disk mount point exists
- Review service logs for specific errors

### High memory usage
- **CRITICAL**: Ensure `MONITOR_OLD_REPO_SIZE=false` and `MONITOR_OLD_REPO_BLOCKS=false`
- Check if `du` or `find` commands are running on old repo

---

## Integration with Admin Dashboard

In your admin dashboard `.env`:

```bash
NODE_MONITOR_URL=https://ipfs.3speak.tv/api/node-stats
NODE_MONITOR_SECRET=<paste-secret-key-here>
```

Fetch from dashboard:

```typescript
const response = await fetch(process.env.NODE_MONITOR_URL!, {
  headers: {
    'Authorization': `Bearer ${process.env.NODE_MONITOR_SECRET}`
  }
});

const data = await response.json();
```

---

## License

ISC

---

## Support

For issues or questions, contact the 3Speak infrastructure team.
