# Notification Scheduler - Document Expiry & Service Report Reminders

This document explains how to set up and use the notification scheduler for automated document expiry reminders and service report reminders.

## Overview

The notification scheduler automatically checks for:
1. **Document Expiry Reminders** - Sends notifications 30, 7, and 1 day before a document expires
2. **Service Report Reminders** - Sends notifications when service reports are due based on their frequency (weekly, monthly, quarterly, annual)

## Components

### 1. ReminderService (`services/reminderService.js`)
Contains the business logic for:
- Checking document expiry dates
- Calculating next service dates based on frequency
- Sending notifications to relevant users

### 2. NotificationScheduler (`scripts/notificationScheduler.js`)
Scheduler script that can run in two modes:
- **One-time mode**: Runs checks once and exits
- **Daemon mode**: Runs continuously with scheduled checks (requires node-cron)

## Installation

1. Install node-cron dependency:
```bash
cd rest-api
npm install node-cron
```

## Usage

### Option 1: One-Time Manual Run

Run the reminder checks once:
```bash
npm run check-reminders
```

Or directly:
```bash
node scripts/notificationScheduler.js
```

### Option 2: Daemon Mode (Continuous Running)

Run the scheduler continuously with automatic daily checks at 9:00 AM:
```bash
npm run scheduler
```

Or directly:
```bash
node scripts/notificationScheduler.js --daemon
```

The scheduler will:
- Run checks immediately on startup
- Schedule daily checks at 9:00 AM
- Keep running until you stop it (Ctrl+C)

### Option 3: System Cron Job

For production, you can set up a system cron job to run the checks daily:

1. Edit your crontab:
```bash
crontab -e
```

2. Add this line to run daily at 9:00 AM:
```
0 9 * * * cd /path/to/fulqrom-hub/rest-api && node scripts/notificationScheduler.js
```

## Document Expiry Reminders

### How It Works

1. The scheduler queries all documents with `metadata.expiry_date` set
2. For each target date (30, 7, 1 days before expiry):
   - Finds documents expiring on that date
   - Sends notifications to document creator and approvers
   - Sets priority based on urgency (urgent for 1 day, high for 7 days, medium for 30 days)

### Recipients

Notifications are sent to:
- Document creator (`created_by`)
- All approvers in `approval_config.approvers`
- Legacy `approved_by` field

### Example Notification

**30 days before expiry:**
```
Title: Document Expiring in 30 Days
Message: Document "Safety Certificate ABC123" will expire on 2025-11-17. Please review and renew if necessary.
Priority: medium
```

## Service Report Reminders

### How It Works

1. The scheduler queries all documents where:
   - Category contains "report" (case-insensitive)
   - `metadata.frequency` is set (weekly, monthly, quarterly, annual)

2. For each service report:
   - Calculates next service date based on `metadata.review_date` and `metadata.frequency`
   - Checks if due within 7 days or overdue
   - Sends notifications with appropriate priority

### Auto-Population of review_date

When creating or updating a document:
- If category contains "report"
- And `metadata.review_date` is not set
- The system automatically sets it to today's date

This ensures service report reminders work correctly.

### Frequency Types

- **weekly**: Reminder every 7 days
- **monthly**: Reminder every month
- **quarterly**: Reminder every 3 months
- **annual**: Reminder every year

### Example Notification

**Overdue service report:**
```
Title: Service Report Overdue
Message: Service report "Monthly HVAC Inspection" is 3 days overdue. Please complete and submit immediately.
Priority: urgent
```

**Due in 5 days:**
```
Title: Service Report Due in 5 Days
Message: Service report "Quarterly Fire Safety Check" is due on 2025-10-23. Please prepare and submit on time.
Priority: high
```

## Output

The scheduler provides detailed console output:

```
================================================================================
Starting reminder checks at 2025-10-18T09:00:00.000Z
================================================================================

--- Checking Document Expiry Reminders ---
Found 3 documents expiring in 30 days
Found 1 documents expiring in 7 days
Found 0 documents expiring in 1 days
✓ Expiry reminders: 4 sent, 0 failed
Documents with expiry reminders:
  - Safety Certificate ABC123 (expires in 30 days, 2 recipients)
  - Compliance Report XYZ789 (expires in 7 days, 3 recipients)

--- Checking Service Report Reminders ---
Found 12 service reports to check
✓ Service report reminders: 5 sent, 0 failed
Service reports with reminders:
  - Monthly HVAC Inspection (monthly, due in 2 days, 2 recipients)
  - Quarterly Fire Safety (quarterly, due in -3 days, 3 recipients)

================================================================================
Reminder checks completed successfully
================================================================================
```

## Monitoring

### Logs

All reminder activities are logged to the console. In production, redirect output to a log file:

```bash
node scripts/notificationScheduler.js >> logs/scheduler.log 2>&1
```

### Database Queries

The scheduler queries are optimized with indexes on:
- `metadata.expiry_date`
- `category`
- `metadata.frequency`

## Testing

### Test Expiry Reminders

1. Create a test document with an expiry date 30 days from now
2. Run the scheduler:
```bash
npm run check-reminders
```
3. Check that a notification was created and email sent

### Test Service Report Reminders

1. Create a test document with:
   - Category containing "report"
   - `metadata.review_date` set to 5 days ago
   - `metadata.frequency` set to "weekly"
2. Run the scheduler:
```bash
npm run check-reminders
```
3. Check that a notification was created (service is overdue)

## Troubleshooting

### No reminders being sent

Check that:
1. Documents have `metadata.expiry_date` or `metadata.frequency` set
2. Database connection is working
3. notificationService is properly configured
4. Email service is configured (check .env)

### Scheduler not running

Check that:
1. node-cron is installed: `npm list node-cron`
2. No syntax errors: `node -c scripts/notificationScheduler.js`
3. MongoDB connection string is correct in .env

### Duplicate notifications

The scheduler sends notifications for the exact date match, so running it multiple times per day might create duplicates. Set up to run once daily at a specific time.

## Future Enhancements

Potential improvements:
- Track sent reminders in database to prevent duplicates
- Configurable reminder intervals (not just 30, 7, 1 days)
- Email digest option (group reminders in one email)
- Escalation for overdue reports
- Custom notification templates per document type
