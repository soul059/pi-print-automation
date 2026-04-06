# Telegram Notifications Setup Guide

This guide walks you through setting up Telegram notifications for the Pi Print system. Once configured, you'll receive real-time alerts for printer issues, stuck jobs, and system events.

## Features

The Telegram integration sends alerts for:

- 🔴 **Paper Empty** - Printer is out of paper
- 🟠 **Paper Jam** - Paper stuck in printer
- 🟡 **Paper Low** - Paper running low (< 10%)
- 📭 **Cover Open** - Printer cover/door is open
- ⏱️ **Stuck Jobs** - Jobs taking longer than 5 minutes
- ⏸️ **Queue Paused/Resumed** - Print queue state changes
- ❌ **Job Failed** - Print job permanently failed
- 💰 **High-Value Refund** - Refunds over ₹100
- 🔧 **Critical Supply** - Ink/toner critically low
- 🔄 **Server Recovered** - Server restarted with pending jobs
- 📊 **Daily Summary** - Daily print statistics

## Setup Steps

### Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a chat and send `/newbot`
3. Follow the prompts:
   - Enter a **name** for your bot (e.g., "DDU Print Alerts")
   - Enter a **username** for your bot (must end in `bot`, e.g., `ddu_print_bot`)
4. BotFather will reply with your **Bot Token** - save this! It looks like:
   ```
   7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Step 2: Get Your Chat ID

You need a Chat ID to tell the bot where to send messages. You can use a personal chat or a group.

#### Option A: Personal Chat (Admin Only)

1. Search for your bot by username and start a chat
2. Send any message to your bot (e.g., "hello")
3. Visit this URL in your browser (replace `YOUR_BOT_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
4. Look for `"chat":{"id":` in the response - that number is your Chat ID
   ```json
   "chat": {
     "id": 123456789,
     "first_name": "Your Name",
     ...
   }
   ```

#### Option B: Group Chat (Multiple Admins)

1. Create a new Telegram group
2. Add your bot to the group
3. Send a message in the group
4. Visit the getUpdates URL (same as above)
5. Look for the group's Chat ID (group IDs are negative, e.g., `-987654321`)

> **Tip**: For group chats, make sure the bot has permission to read messages. You may need to disable privacy mode via BotFather: `/setprivacy` → select your bot → `Disable`

### Step 3: Configure Environment Variables

Add these to your `.env` file in the `pi-server` directory:

```env
# Telegram Notifications
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=123456789
```

For group chats, include the negative sign:
```env
TELEGRAM_CHAT_ID=-987654321
```

### Step 4: Test the Configuration

1. Restart the server:
   ```bash
   pnpm dev
   ```

2. Use the admin API to send a test message:
   ```bash
   curl -X POST http://localhost:3001/api/admin/telegram/test \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -H "Content-Type: application/json"
   ```

3. Or use the admin dashboard's Telegram test button

You should receive a test message in Telegram!

## Alert Cooldowns

To prevent notification spam, alerts have cooldown periods:

| Alert Type | Cooldown |
|------------|----------|
| Paper Empty | 5 minutes |
| Paper Jam | 1 minute |
| Paper Low | 5 minutes |
| Cover Open | 5 minutes |
| Stuck Job | 5 minutes |
| Queue Paused | 5 minutes |
| Job Failed | No cooldown |
| High-Value Refund | No cooldown |

Cooldowns reset when the issue is resolved.

## Troubleshooting

### Not receiving messages?

1. **Check bot token**: Ensure there are no extra spaces in `.env`
2. **Check chat ID**: Verify the ID is correct (negative for groups)
3. **Bot not in chat**: Make sure you've started a conversation with the bot or added it to the group
4. **Privacy mode**: For groups, disable privacy mode via BotFather

### Test via curl

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id": "<YOUR_CHAT_ID>", "text": "Test message"}'
```

### Check bot info

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe"
```

## Security Notes

- Never commit your `.env` file to version control
- Use environment variables or secrets management in production
- Consider creating a dedicated Telegram group for alerts (easier to add/remove admins)

## Example Alerts

Here's what the alerts look like:

```
🔴 PAPER EMPTY

Printer: HP_LaserJet_Pro
Status: No paper in tray

Action: Please load paper and acknowledge via admin panel.
Jobs in queue: 3
```

```
⏸️ QUEUE PAUSED

Reason: Paper empty - load paper
Pending jobs: 5

Resume via: Admin Dashboard → Queue Controls
```

```
📊 DAILY SUMMARY

Date: 2024-01-15
Jobs Completed: 47
Pages Printed: 312
Revenue: ₹1,248
Failed Jobs: 2
```
