# Deployment Guide - Fulqrom Hub REST API

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Database Setup](#database-setup)
- [AWS S3 Configuration](#aws-s3-configuration)
- [Email Configuration](#email-configuration)
- [Deployment Platforms](#deployment-platforms)
- [Monitoring & Logs](#monitoring--logs)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **MongoDB**: Version 5.0 or higher (or MongoDB Atlas account)
- **Git**: For version control

### Required Accounts
- **MongoDB Atlas** (or self-hosted MongoDB)
- **AWS Account** (for S3 file storage)
- **SMTP Email Service** (optional: Zoho, SendGrid, AWS SES)

---

## Environment Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd fulqrom-hub/rest-api
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Server Configuration
NODE_ENV=production
PORT=30001

# Database
MONGODB_CONNECTION=mongodb+srv://username:password@cluster.mongodb.net/hub_fulqrom

# Client URL (Frontend)
CLIENT_URL=https://your-frontend-domain.com

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_DEFAULT_REGION=ap-southeast-2
AWS_BUCKET=your-s3-bucket-name
AWS_USE_PATH_STYLE_ENDPOINT=false
AWS_URL=https://your-bucket.s3.ap-southeast-2.amazonaws.com
FILESYSTEM_DISK=s3

# Email Configuration (SMTP)
MAIL_PROVIDER=smtp
MAIL_MAILER=smtp
MAIL_HOST=smtp.example.com
MAIL_PORT=465
MAIL_USERNAME=your_email@example.com
MAIL_PASSWORD=your_email_password
MAIL_ENCRYPTION=ssl
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME=Fulqrom Hub
```

---

## Local Development

### Start Development Server
```bash
npm run dev
```

The API will be available at `http://localhost:30001`

### Test API
```bash
curl http://localhost:30001/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2025-10-10T10:50:00.000Z",
  "service": "Fulqrom Hub API",
  "version": "1.0.0"
}
```

---

## Production Deployment

### 1. Build Preparation

Ensure all environment variables are set:
```bash
# Verify .env file
cat .env

# Test the application
npm start
```

### 2. Security Checklist

✅ Update `.env` with production credentials
✅ Verify `.gitignore` excludes `.env` file
✅ Enable HTTPS/SSL certificates
✅ Configure CORS for production domains only
✅ Set `NODE_ENV=production`
✅ Review and update `CLIENT_URL`

### 3. Database Migration

If you have migrations to run:
```bash
# No migrations in current setup - database auto-initializes
# Default role and demo user created on first start
```

---

## Database Setup

### MongoDB Atlas (Recommended)

1. **Create Cluster**
   - Go to [MongoDB Atlas](https://cloud.mongodb.com)
   - Create a new cluster (M0 Free tier or higher)
   - Choose region: `ap-southeast-2` (Sydney) for Australian data

2. **Configure Access**
   - Database Access → Add user with read/write permissions
   - Network Access → Add IP whitelist (0.0.0.0/0 for development, specific IPs for production)

3. **Get Connection String**
   - Connect → Drivers → Copy connection string
   - Update `MONGODB_CONNECTION` in `.env`

### Self-Hosted MongoDB

```bash
# Install MongoDB
# Ubuntu/Debian
sudo apt-get install mongodb

# macOS
brew install mongodb-community

# Start MongoDB
mongod --dbpath /path/to/data

# Connection string format
MONGODB_CONNECTION=mongodb://localhost:27017/hub_fulqrom
```

---

## AWS S3 Configuration

### 1. Create S3 Bucket

```bash
# Using AWS CLI
aws s3 mb s3://your-bucket-name --region ap-southeast-2

# Set bucket policy for private access
```

### 2. Create IAM User

1. Go to AWS IAM Console
2. Create new user: `fulqrom-hub-api`
3. Attach policy: `AmazonS3FullAccess` (or custom policy below)

**Custom S3 Policy (Recommended):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name/*",
        "arn:aws:s3:::your-bucket-name"
      ]
    }
  ]
}
```

3. Save Access Key ID and Secret Access Key
4. Update `.env` with credentials

---

## Email Configuration

### Option 1: SMTP (Zoho, Gmail, etc.)

```bash
MAIL_PROVIDER=smtp
MAIL_HOST=smtppro.zoho.com
MAIL_PORT=465
MAIL_USERNAME=your_email@domain.com
MAIL_PASSWORD=your_app_password
MAIL_ENCRYPTION=ssl
```

### Option 2: AWS SES

1. Verify domain in AWS SES
2. Move out of sandbox mode (if needed)
3. Configure:

```bash
MAIL_PROVIDER=ses
AWS_REGION=ap-southeast-2
```

### Option 3: SendGrid

```bash
MAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your_sendgrid_api_key
```

---

## Deployment Platforms

### AWS EC2

1. **Launch EC2 Instance**
   - AMI: Ubuntu 22.04 LTS
   - Instance Type: t3.small or higher
   - Security Group: Allow ports 22 (SSH), 80 (HTTP), 443 (HTTPS), 30001 (API)

2. **Install Node.js**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Deploy Application**
```bash
# Clone repository
git clone <repo-url>
cd fulqrom-hub/rest-api

# Install dependencies
npm install --production

# Install PM2
sudo npm install -g pm2

# Start application
pm2 start server.js --name fulqrom-api

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

4. **Configure Nginx (Reverse Proxy)**
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:30001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

5. **Setup SSL with Let's Encrypt**
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

### Heroku

1. **Create Heroku App**
```bash
heroku create fulqrom-hub-api
```

2. **Set Environment Variables**
```bash
heroku config:set NODE_ENV=production
heroku config:set MONGODB_CONNECTION=your_mongodb_uri
heroku config:set AWS_ACCESS_KEY_ID=your_key
# ... set all other env vars
```

3. **Deploy**
```bash
git push heroku main
```

### Google Cloud Run

1. **Create `Dockerfile`** (already configured)
2. **Build and Deploy**
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/fulqrom-api
gcloud run deploy fulqrom-api --image gcr.io/PROJECT_ID/fulqrom-api --platform managed
```

### Azure App Service

1. **Create Web App**
```bash
az webapp create --resource-group MyResourceGroup --plan MyPlan --name fulqrom-api --runtime "NODE|18-lts"
```

2. **Deploy**
```bash
az webapp deployment source config-local-git --name fulqrom-api --resource-group MyResourceGroup
git remote add azure <git-url>
git push azure main
```

---

## Monitoring & Logs

### PM2 Monitoring
```bash
# View logs
pm2 logs fulqrom-api

# Monitor CPU/Memory
pm2 monit

# Restart application
pm2 restart fulqrom-api

# Stop application
pm2 stop fulqrom-api
```

### Application Logs
- Error logs written to `console.error()`
- Production: Configure external logging (Papertrail, Loggly, CloudWatch)

### Health Check
```bash
# Automated health check
curl https://api.yourdomain.com/health
```

---

## Troubleshooting

### Database Connection Issues

**Problem:** Cannot connect to MongoDB

**Solution:**
```bash
# Check connection string
echo $MONGODB_CONNECTION

# Test MongoDB connection
mongo "mongodb+srv://username:password@cluster.mongodb.net/hub_fulqrom"

# Verify IP whitelist in MongoDB Atlas
# Network Access → Add current IP
```

### Port Already in Use

**Problem:** Port 30001 already in use

**Solution:**
```bash
# Find process using port
lsof -i :30001

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=30002
```

### File Upload Errors

**Problem:** S3 upload failing

**Solution:**
```bash
# Verify AWS credentials
aws s3 ls s3://your-bucket-name

# Check bucket permissions
# Ensure IAM user has PutObject permission

# Test AWS CLI
aws s3 cp test.txt s3://your-bucket-name/
```

### Email Not Sending

**Problem:** Emails not being sent

**Solution:**
```bash
# Check SMTP settings
# Verify credentials
# Check spam folder

# Test with console mode (development)
MAIL_PROVIDER=console npm start
```

---

## Production Checklist

Before going live:

- [ ] All environment variables configured
- [ ] Database connection tested
- [ ] S3 bucket configured and tested
- [ ] Email service tested
- [ ] HTTPS/SSL certificate installed
- [ ] CORS configured for production domain
- [ ] Firewall rules configured
- [ ] Backups configured for database
- [ ] Monitoring and logging setup
- [ ] Load testing completed
- [ ] Security audit completed
- [ ] API documentation shared with team
- [ ] .env file backed up securely (NOT in git)

---

## Backup & Recovery

### Database Backup (MongoDB)
```bash
# Backup
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/hub_fulqrom" --out=/backup/

# Restore
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net/hub_fulqrom" /backup/hub_fulqrom/
```

### Application Backup
```bash
# Backup application code
git push origin main

# Backup environment configuration (SECURE LOCATION ONLY)
# DO NOT commit .env to git
```

---

## Support

For issues or questions:
- Review [README.md](README.md) for API documentation
- Check [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for common problems
- Contact development team

---

**Version:** 1.0.0
**Last Updated:** October 2025
**Developed by Ravenlabs Team**
