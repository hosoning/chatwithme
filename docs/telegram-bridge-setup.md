# Claude Wallet Telegram Bridge Setup

## Architecture

```
Claude Wallet System
    ↓
GitHub Actions (daily keepalive + manual triggers)
    ↓
Supabase Edge Function (wallet-telegram-bridge)
    ↓
Telegram Bot
    ↓
User (@severusnapeee)
```

## Setup Steps

### 1. Supabase Project Setup

1. Create a new Supabase project (or use existing project)
2. Run the schema SQL:
   ```bash
   supabase db push < supabase/wallet_bridge_schema.sql
   ```
3. Deploy the Edge Function:
   ```bash
   supabase functions deploy wallet-telegram-bridge
   ```

### 2. Telegram Bot Setup

1. Create a new Telegram bot via @BotFather
   - Get `TELEGRAM_BOT_TOKEN`
   - Example: `8753270677:AAG1gCOd6AqeiGkvUZumF_Bcbcv0gfEdSac`

2. Generate a webhook secret (random string):
   ```bash
   openssl rand -hex 32
   ```
   - Save as `TELEGRAM_WEBHOOK_SECRET`

3. Set the webhook in Telegram:
   ```bash
   curl -X POST "https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook" \
     -d "url={SUPABASE_EDGE_FUNCTION_URL}" \
     -d "secret_token={TELEGRAM_WEBHOOK_SECRET}"
   ```

### 3. Environment Variables

#### Supabase Edge Function Secrets
```
TELEGRAM_BOT_TOKEN = <your bot token>
TELEGRAM_ALLOWED_CHAT_ID = 1359445901
TELEGRAM_WEBHOOK_SECRET = <random hex string>
CLAUDE_WALLET_PROGRESS_SECRET = <random hex string>
```

#### GitHub Secrets
```
SUPABASE_WALLET_TELEGRAM_BRIDGE_URL = <Edge Function URL>
CLAUDE_WALLET_PROGRESS_SECRET = <same as above>
```

### 4. Configuration Files

**`.env.local` (never commit)**
```
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_CHAT_ID=1359445901
TELEGRAM_WEBHOOK_SECRET=...
CLAUDE_WALLET_PROGRESS_SECRET=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## API Endpoints

### Telegram Webhook
```
POST /functions/v1/wallet-telegram-bridge
Header: X-Telegram-Bot-Api-Secret-Token: {TELEGRAM_WEBHOOK_SECRET}
Body: {
  "message": {
    "message_id": 123,
    "text": "user message",
    "chat": { "id": 1359445901 },
    "from": { "id": 456, "first_name": "User" }
  }
}
```

### GitHub Actions Progress Notification
```
POST /functions/v1/wallet-telegram-bridge
Header: x-claude-wallet-progress-secret: {CLAUDE_WALLET_PROGRESS_SECRET}
Body: {
  "phase": "Daily Keepalive",
  "summary": "Claude drew tarot cards today",
  "status": "success",
  "balance": 1000.00,
  "transaction_id": 5
}
```

## Database Tables

### `wallet_feedback`
Stores user messages from Telegram:
- `telegram_chat_id` - User's Telegram chat ID
- `telegram_message_id` - Message ID (for deduplication)
- `message` - User's feedback text
- `status` - 'new' | 'reviewed' | 'accepted' | 'done' | 'dismissed'

### `wallet_progress`
Stores transaction milestones for Telegram notifications:
- `phase` - Operation type (e.g., "Topup", "Expense", "Daily Keepalive")
- `summary` - Human-readable description
- `status` - 'pending' | 'success' | 'cancelled' | 'failure'
- `balance` - Current balance at time of transaction
- `transaction_id` - Reference to wallet transaction ID

## Telegram Commands

- `/start` - Show help
- `/status` - Show latest wallet progress
- `/balance` - Show current balance (direct message to bot)
- Regular text - Send feedback/notes

## Security Notes

- Bot token is stored ONLY in Supabase Edge Function secrets
- Claude Cloud never sees the token
- CLAUDE_WALLET_PROGRESS_SECRET shared between GitHub and Supabase for authentication
- Telegram webhook secret prevents spoofing
- All database access restricted to service_role (no anon/authenticated access)
