# Notification Reminder Testing Guide

Quick guide for testing document expiry and service report reminders.

## Manual Testing (One-Time Run)

### 1. Create Test Documents
```bash
cd rest-api
node scripts/createTestReminders.js
```

This creates 5 test documents:
- Certificate expiring in 30 days
- Compliance report expiring in 7 days
- Permit expiring in 1 day
- Weekly HVAC inspection (due in 5 days)
- Overdue safety report (3 days overdue)

### 2. Run Scheduler Manually
```bash
npm run check-reminders
```

Expected output:
```
Starting notification scheduler...
Checking for document expiry reminders...
✓ Sent 3 expiry reminder(s)
Checking for service report reminders...
✓ Sent 2 service report reminder(s)
✓ Total notifications sent: 5
```

### 3. Verify Notifications Created
```bash
node scripts/checkNotifications.js
```

Shows recent notifications with type, priority, and read status.

### 4. Test via API
```bash
# Get unread count
curl http://localhost:30001/api/notifications/unread-count

# Get all notifications
curl http://localhost:30001/api/notifications?limit=50
```

---

## Daemon Mode (Background Process)

Run scheduler as background process with daily cron:

```bash
npm run scheduler --daemon
```

Default: Runs daily at 9:00 AM. Edit `scripts/notificationScheduler.js` to change schedule:

```javascript
cron.schedule('0 9 * * *', async () => {  // 9:00 AM daily
  await runReminders();
});
```

### Cron Expression Examples
```
'0 9 * * *'      // Daily at 9:00 AM
'0 */6 * * *'    // Every 6 hours
'0 0 * * 1'      // Weekly on Monday at midnight
'0 8 * * 1-5'    // Weekdays at 8:00 AM
```

---

## Production Setup (System Cron)

### Option 1: PM2 (Recommended)
```bash
npm install -g pm2
pm2 start scripts/notificationScheduler.js --name reminder-scheduler -- --daemon
pm2 save
pm2 startup
```

### Option 2: System Crontab
```bash
crontab -e
```

Add line:
```
0 9 * * * cd /path/to/fulqrom-hub/rest-api && /usr/bin/node scripts/notificationScheduler.js >> /var/log/reminder-scheduler.log 2>&1
```

### Option 3: Docker/K8s CronJob
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: reminder-scheduler
spec:
  schedule: "0 9 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: scheduler
            image: your-api-image
            command: ["node", "scripts/notificationScheduler.js"]
```

---

## Troubleshooting

### No notifications sent
```bash
# Check documents exist with expiry dates
mongosh
use fulqrom_db
db.documents.find({ "metadata.expiry_date": { $exists: true } }).count()

# Check service reports
db.documents.find({ "metadata.review_date": { $exists: true } }).count()
```

### Email notifications failing
- Check `.env` has `SENDGRID_API_KEY` or email service configured
- Verify email templates exist in `utils/emailService.js`
- In-app notifications will still work even if emails fail

### Check scheduler logs
```bash
# If using PM2
pm2 logs reminder-scheduler

# If using system cron
tail -f /var/log/reminder-scheduler.log
```

---

## Clean Up Test Data

```bash
mongosh
use fulqrom_db

# Delete test documents
db.documents.deleteMany({ name: /^Test/ })

# Delete test notifications
db.notifications.deleteMany({ type: { $in: ['document_expiry_reminder', 'service_report_reminder'] } })
```
