# PM2 Deployment Guide

## Installation

Install PM2 globally on your server:

```bash
npm install -g pm2
```

If you encounter permission errors:

```bash
sudo npm install -g pm2
```

Verify installation:

```bash
pm2 --version
```

## Starting the Application

### Development Mode (with auto-reload)
```bash
pm2 start npm --name "fulqrom-api" --watch -- run dev
```

### Production Mode
```bash
pm2 start npm --name "fulqrom-api" -- start
```

### Direct File Start
```bash
pm2 start server.js --name "fulqrom-api" --watch
```

## Process Management

### View Running Processes
```bash
pm2 list
```

### View Logs
```bash
pm2 logs fulqrom-api
pm2 logs          # All processes
```

### Restart Application
```bash
pm2 restart fulqrom-api
```

### Stop Application
```bash
pm2 stop fulqrom-api
```

### Delete Process
```bash
pm2 delete fulqrom-api
```

### Stop All Processes
```bash
pm2 stop all
pm2 delete all
```

## Configuration Options

### Ignore Files from Watch
```bash
pm2 start server.js --name "fulqrom-api" --watch --ignore-watch="node_modules logs *.log"
```

### Set Environment Variables
```bash
pm2 start server.js --name "fulqrom-api" --env production
```

## Auto-Start on Server Reboot

Generate startup script:

```bash
pm2 startup
```

Save current process list:

```bash
pm2 save
```

## Monitoring

### Real-time Monitoring
```bash
pm2 monit
```

### Process Information
```bash
pm2 show fulqrom-api
```

## Updating PM2

```bash
pm2 update
```

## Troubleshooting

### Kill PM2 Daemon
```bash
pm2 kill
```

### Check System Processes
```bash
ps aux | grep node
```

### Check Port Usage
```bash
sudo netstat -tulpn | grep :3000
sudo lsof -i :3000
```