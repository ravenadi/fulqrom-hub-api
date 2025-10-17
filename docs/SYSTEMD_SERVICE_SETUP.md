# Systemd Service Setup Guide

This guide explains how to run the Fulqrom Hub REST API as a systemd service instead of PM2 on production servers.

## Migration from PM2 to Systemd

### Step 1: Remove PM2

Stop and remove PM2 from your production server:

```bash
pm2 stop all
pm2 delete all
pm2 unstartup  # Remove PM2 from system startup
npm uninstall -g pm2  # Optional: completely remove PM2
```

### Step 2: Create Systemd Service File

Create the service file at `/etc/systemd/system/fulqrom-hub-api.service`:

```bash
sudo nano /etc/systemd/system/fulqrom-hub-api.service
```

Add the following configuration:

```ini
[Unit]
Description=Fulqrom Hub REST API
After=network.target mongodb.service

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/var/www/fulqrom-hub-api
Environment=NODE_ENV=production
EnvironmentFile=/var/www/fulqrom-hub-api/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=fulqrom-hub-api

[Install]
WantedBy=multi-user.target
```

### Step 3: Enable and Start the Service

```bash
# Reload systemd to recognize the new service
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable fulqrom-hub-api

# Start the service
sudo systemctl start fulqrom-hub-api

# Check service status
sudo systemctl status fulqrom-hub-api
```

## Service Management Commands

### Basic Operations

```bash
# Start the service
sudo systemctl start fulqrom-hub-api

# Stop the service
sudo systemctl stop fulqrom-hub-api

# Restart the service
sudo systemctl restart fulqrom-hub-api

# Reload configuration without stopping
sudo systemctl reload fulqrom-hub-api

# Check service status
sudo systemctl status fulqrom-hub-api

# Enable service to start on boot
sudo systemctl enable fulqrom-hub-api

# Disable service from starting on boot
sudo systemctl disable fulqrom-hub-api
```

### Viewing Logs

```bash
# View all logs
sudo journalctl -u fulqrom-hub-api

# Follow logs in real-time (like pm2 logs)
sudo journalctl -u fulqrom-hub-api -f

# View last 50 lines
sudo journalctl -u fulqrom-hub-api -n 50

# View logs since today
sudo journalctl -u fulqrom-hub-api --since today

# View logs with timestamps
sudo journalctl -u fulqrom-hub-api --no-pager

# View logs between specific times
sudo journalctl -u fulqrom-hub-api --since "2025-10-17 00:00:00" --until "2025-10-17 23:59:59"
```

## Configuration Details

### Service File Breakdown

- **[Unit]**: Service metadata and dependencies
  - `After=network.target mongodb.service`: Ensures network and MongoDB are available before starting

- **[Service]**: Service execution configuration
  - `Type=simple`: Service runs in foreground
  - `User=ec2-user`: User account to run the service
  - `Group=ec2-user`: Group for the service
  - `WorkingDirectory`: Project root directory
  - `Environment`: Environment variables
  - `EnvironmentFile`: Load environment variables from .env file
  - `ExecStart`: Command to start the service
  - `Restart=always`: Automatically restart on failure
  - `RestartSec=10`: Wait 10 seconds before restarting
  - `StandardOutput=journal`: Send stdout to systemd journal
  - `StandardError=journal`: Send stderr to systemd journal
  - `SyslogIdentifier`: Identifier for logs

- **[Install]**: Installation and boot configuration
  - `WantedBy=multi-user.target`: Start in multi-user mode

### Environment Variables

The service loads environment variables from:
1. `Environment=` directives in the service file
2. `EnvironmentFile=` pointing to `.env` file

Ensure your `.env` file at `/var/www/fulqrom-hub-api/.env` contains all required variables:

```env
NODE_ENV=production
PORT=3001
MONGODB_URI=mongodb://localhost:27017/fulqrom-hub
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_AUDIENCE=your-api-identifier
# ... other variables
```

## Troubleshooting

### Service Fails to Start

1. **Check service status:**
   ```bash
   sudo systemctl status fulqrom-hub-api
   ```

2. **View detailed logs:**
   ```bash
   sudo journalctl -u fulqrom-hub-api -n 100 --no-pager
   ```

3. **Common issues:**
   - **Permission errors (217/USER)**: Wrong user in service file
   - **Missing .env file**: Check `EnvironmentFile` path exists
   - **Wrong working directory**: Verify `WorkingDirectory` path
   - **Node not found**: Check `/usr/bin/node` exists or use full path from `which node`

### Verify Node Path

```bash
which node
# Use this path in ExecStart
```

### Test Service Manually

```bash
# Run as the service user
sudo -u ec2-user bash
cd /var/www/fulqrom-hub-api
node server.js
```

## Comparison: PM2 vs Systemd

| Feature | PM2 | Systemd |
|---------|-----|---------|
| Auto-restart | `pm2 start` | `Restart=always` |
| Logs | `pm2 logs` | `journalctl -u service -f` |
| Status | `pm2 status` | `systemctl status service` |
| Restart | `pm2 restart app` | `systemctl restart service` |
| Start on boot | `pm2 startup` | `systemctl enable service` |
| Clustering | Built-in | Requires Node.js cluster module |
| Log rotation | Built-in | Built-in via journald |
| Memory limit | Configurable | Configurable via service file |

## Advanced Configuration

### Memory Limits

Add to `[Service]` section:

```ini
MemoryMax=1G
MemoryHigh=800M
```

### CPU Limits

```ini
CPUQuota=50%
```

### Multiple Instances (Clustering)

For clustering, modify your application code to use Node.js cluster module or create multiple service instances with different ports and use nginx load balancing.

## Deployment Workflow

After code updates:

```bash
# Pull latest code
cd /var/www/fulqrom-hub-api
git pull

# Install dependencies
npm install --production

# Restart service
sudo systemctl restart fulqrom-hub-api

# Verify status
sudo systemctl status fulqrom-hub-api

# Watch logs
sudo journalctl -u fulqrom-hub-api -f
```

## Additional Resources

- [Systemd Service Documentation](https://www.freedesktop.org/software/systemd/man/systemd.service.html)
- [Journalctl Documentation](https://www.freedesktop.org/software/systemd/man/journalctl.html)
