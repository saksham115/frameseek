# FrameSeek — In-App Purchases Guide

iOS subscription system using Apple StoreKit 2 via `react-native-iap`, with server-side receipt verification.

## Plans

| Plan | Storage | Searches | Retention | Monthly | Annual |
|------|---------|----------|-----------|---------|--------|
| Free | 5 GB | 20/month | 15 days | — | — |
| Pro | 20 GB | 100/month | 90 days | $6.99 | $55.99 |
| Pro Max | 50 GB | 500/month | 90 days | $14.99 | $119.99 |

## Product IDs

These must match exactly in App Store Connect, backend config, and mobile config.

| Product ID | Plan | Period |
|---|---|---|
| `frameseek_pro_monthly` | Pro | Monthly |
| `frameseek_pro_annual` | Pro | Annual |
| `frameseek_promax_monthly` | Pro Max | Monthly |
| `frameseek_promax_annual` | Pro Max | Annual |

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   iOS App    │────▶│  FastAPI Backend  │────▶│  Apple Server   │
│  StoreKit 2  │     │                  │     │  verifyReceipt  │
│              │     │  /verify-receipt  │     │                 │
└──────┬───────┘     └──────────────────┘     └─────────────────┘
       │                      ▲
       │                      │
       │              ┌───────┴────────┐
       │              │ Apple Server   │
       │              │ Notifications  │
       │              │ (webhooks v2)  │
       │              └────────────────┘
       │
  Purchase flow:
  1. App calls StoreKit → payment sheet
  2. User confirms → StoreKit returns receipt
  3. App sends receipt to backend /verify-receipt
  4. Backend verifies with Apple → activates plan
  5. Ongoing: Apple sends webhooks for renewals,
     cancellations, refunds, billing issues
```

## Key Files

### Backend
| File | Purpose |
|------|---------|
| `app/plan_config.py` | Plan definitions, product-to-plan mapping |
| `app/models/subscription.py` | Subscription DB model |
| `app/repositories/subscription_repo.py` | Subscription CRUD |
| `app/services/subscription_service.py` | Receipt verification, webhook handling, plan activation |
| `app/routers/subscriptions.py` | REST endpoints (`/status`, `/verify-receipt`, `/apple-notification`) |
| `app/workers/retention_cleanup.py` | Cron: expire subscriptions, delete old content |
| `app/schemas/subscription.py` | Pydantic response schemas |

### Mobile
| File | Purpose |
|------|---------|
| `src/store/slices/subscriptionSlice.ts` | Zustand store — IAP connection, purchase flow, listeners |
| `src/screens/settings/PaywallScreen.tsx` | Plan cards, billing toggle, purchase buttons |
| `src/screens/settings/SubscriptionManagementScreen.tsx` | Current plan details, manage/upgrade |
| `src/services/api/subscriptions.api.ts` | API calls to backend |
| `src/constants/config.ts` | Product ID constants |

---

## Phase 1: Local Development

No Apple Developer account required. Purchases are simulated.

### Backend Setup

1. Set in `backend/.env`:
   ```
   APPLE_IAP_ENVIRONMENT=local
   ```

2. Run migrations:
   ```bash
   cd backend
   source venv/bin/activate
   alembic upgrade head
   ```

### Testing via API (no device needed)

```bash
# Activate Pro Monthly
curl -X POST http://localhost:8000/api/v1/subscriptions/verify-receipt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"receipt_data": "frameseek_pro_monthly"}'

# Activate Pro Max Annual
curl -X POST http://localhost:8000/api/v1/subscriptions/verify-receipt \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"receipt_data": "frameseek_promax_annual"}'

# Check status
curl http://localhost:8000/api/v1/subscriptions/status \
  -H "Authorization: Bearer <token>"

```

In local mode, `receipt_data` is the product ID directly — no Apple verification happens.

### Testing on iOS Simulator (with StoreKit config)

1. Open `ios/FrameSeek.xcworkspace` in Xcode
2. File → New → File → **StoreKit Configuration File** → name: `FrameSeekProducts`
3. Add subscription group "FrameSeek Premium" with all 4 products (IDs and prices from table above)
4. Product → Scheme → Edit Scheme → Run → Options → set StoreKit Configuration
5. Build & run from Xcode (Cmd+R)

> **Warning:** `npx expo prebuild --clean` deletes the entire `ios/` folder including your `.storekit` file. Back it up first, or avoid `--clean`.

### Xcode StoreKit Debug Tools

While the app runs in the simulator:
- **Debug → StoreKit → Manage Transactions** — view/delete purchases
- **Debug → StoreKit → Expire Subscriptions** — force expiry
- **Debug → StoreKit → Enable Billing Retry** — simulate payment failure
- **Debug → StoreKit → Subscription Renewal Rate** — adjust speed (1 month = 5 min by default)

---

## Phase 2: Sandbox Testing

Real Apple IAP on a physical device, but with sandbox (no real money charged).

### Prerequisites

- [ ] Apple Developer Program membership ($99/year)
- [ ] Agreed to **Paid Apps Agreement** in App Store Connect → Business (banking + tax info required)

### Checklist

#### App Store Connect

- [ ] Create app record with bundle ID `in.frameseek.app`
- [ ] Go to Monetization → Subscriptions
- [ ] Create subscription group: **FrameSeek Premium**
- [ ] Create 4 auto-renewable subscriptions (see Product IDs table above)
- [ ] For each subscription:
  - [ ] Set price
  - [ ] Add localization (display name + description)
  - [ ] Add a review screenshot (simulator screenshot of paywall is fine)
- [ ] Go to App Information → generate **App-Specific Shared Secret**
- [ ] Go to App Information → App Store Server Notifications:
  - [ ] Set sandbox URL: `https://<your-domain>/api/v1/subscriptions/apple-notification`
  - [ ] Set version: **V2**
- [ ] Go to Users and Access → Sandbox → create a **Sandbox Test Account**

#### Backend

- [ ] Set environment variables in `.env`:
  ```
  APPLE_SHARED_SECRET=<hex string from App Store Connect>
  APPLE_IAP_ENVIRONMENT=sandbox
  APPLE_BUNDLE_ID=in.frameseek.app
  ```
- [ ] Deploy backend so Apple can reach the notification webhook (needs HTTPS)
- [ ] Verify `/api/v1/subscriptions/status` returns correctly

#### iOS Device

- [ ] On test device: Settings → App Store → Sandbox Account → sign in with sandbox account
- [ ] Build app to device via Xcode (no StoreKit config needed — it uses real sandbox)
- [ ] Test purchase flow end-to-end
- [ ] Verify subscription activates in your backend
- [ ] Test restore purchases
- [ ] Wait for auto-renewal (sandbox renews fast — 1 month = 5 minutes)
- [ ] Cancel via sandbox account and verify downgrade

#### Sandbox Renewal Schedule

| Real Duration | Sandbox Duration |
|---|---|
| 1 week | 3 minutes |
| 1 month | 5 minutes |
| 2 months | 10 minutes |
| 3 months | 15 minutes |
| 6 months | 30 minutes |
| 1 year | 1 hour |

Subscriptions auto-renew up to 6 times in sandbox, then stop.

---

## Phase 3: Production Deployment

### Pre-Launch Checklist

#### Security

- [ ] **Implement JWS signature verification** on `/apple-notification` endpoint
  - Decode the `signedPayload` using Apple's root certificate
  - Reject requests with invalid signatures
  - This prevents spoofed webhook calls (renewals, refunds, etc.)
  - Reference: [Apple JWS docs](https://developer.apple.com/documentation/appstoreservernotifications/responding_to_app_store_server_notifications)
- [ ] Verify `APPLE_IAP_ENVIRONMENT` is set to `production`

#### App Store Connect

- [ ] Set production notification URL: `https://api.frameseek.com/api/v1/subscriptions/apple-notification`
- [ ] Verify all 4 subscription products are in **"Ready to Submit"** status
- [ ] Ensure subscription group ranking is correct (Pro Max above Pro — higher tier first)

#### Backend

- [ ] Set production environment variables:
  ```
  APPLE_SHARED_SECRET=<same shared secret>
  APPLE_IAP_ENVIRONMENT=production
  APPLE_BUNDLE_ID=in.frameseek.app
  ```
- [ ] Verify cron jobs are running:
  - `retention_cleanup_task` — daily at 3 AM UTC
  - `subscription_expiry_task` — every 6 hours
- [ ] Monitor logs for receipt verification failures
- [ ] Set up alerts for webhook processing errors

#### App Review

- [ ] Subscription terms visible before purchase (paywall screen)
- [ ] Restore Purchases button accessible (required by Apple)
- [ ] Link to Terms of Service
- [ ] Link to Privacy Policy (must mention subscription data)
- [ ] No references to pricing in screenshots (Apple may reject — prices vary by region)
- [ ] Subscription management links to App Store settings (the "Manage in App Store" button)

#### Edge Cases to Verify

- [ ] Purchase → receipt verification → plan activation
- [ ] Subscription renewal (via webhook)
- [ ] Voluntary cancellation → access until period ends → downgrade
- [ ] Billing retry / grace period → user keeps access during retry
- [ ] Refund (via webhook) → immediate downgrade
- [ ] Upgrade from Pro to Pro Max (mid-cycle)
- [ ] Downgrade from Pro Max to Pro (takes effect at renewal)
- [ ] Restore purchases on a new device
- [ ] Expired subscription → cron job downgrades to Free
- [ ] User with storage over new limit after downgrade (should block new uploads, not delete)

---

## Backend Deployment

The backend has 3 processes that need to run: the **API server**, the **ARQ worker** (background jobs), and the infrastructure services (**PostgreSQL**, **Redis**, **Qdrant**).

### Option A: VPS / VM (e.g. DigitalOcean, Hetzner, AWS EC2)

Simplest approach — run everything on one machine.

#### 1. Server Setup

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3.12 python3.12-venv ffmpeg nginx certbot python3-certbot-nginx

# Clone repo
git clone <your-repo> /opt/frameseek
cd /opt/frameseek/backend
```

#### 2. Infrastructure (Docker)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Start PostgreSQL, Redis, Qdrant
cd /opt/frameseek/backend
docker compose up -d
```

#### 3. Python Environment

```bash
cd /opt/frameseek/backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### 4. Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with production values:

```env
# Database (use Docker internal or managed DB)
DATABASE_URL=postgresql+asyncpg://frameseek:STRONG_PASSWORD@localhost:5432/frameseek

# Redis
REDIS_URL=redis://localhost:6379

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# JWT — generate a random secret
JWT_SECRET_KEY=<run: openssl rand -hex 32>

# Google Cloud
GCP_PROJECT_ID=your-project-id
GCP_SERVICE_ACCOUNT_PATH=/opt/frameseek/service-account.json
GCS_BUCKET_NAME=frameseek-storage

# Google OAuth
GOOGLE_CLIENT_ID=<your-web-client-id>
GOOGLE_IOS_CLIENT_ID=<your-ios-client-id>

# Apple IAP
APPLE_SHARED_SECRET=<from App Store Connect>
APPLE_IAP_ENVIRONMENT=production
APPLE_BUNDLE_ID=in.frameseek.app

# Server
HOST=0.0.0.0
PORT=8000
DEBUG=false
```

#### 5. Run Migrations

```bash
source venv/bin/activate
alembic upgrade head
```

#### 6. PM2 Process Manager

PM2 manages both the API server and worker — auto-restart, log aggregation, and startup on boot.

```bash
# Install PM2 globally
npm install -g pm2

# Start both processes
cd /opt/frameseek/backend
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs (all processes)
pm2 logs

# View logs for a specific process
pm2 logs frameseek-api
pm2 logs frameseek-worker

# Auto-start on server reboot
pm2 startup
pm2 save
```

Common PM2 commands:

```bash
pm2 restart all              # Restart everything
pm2 restart frameseek-api    # Restart just the API
pm2 stop frameseek-worker    # Stop the worker
pm2 monit                    # Live CPU/memory dashboard
pm2 flush                    # Clear all logs
```

#### 7. Nginx Reverse Proxy + SSL

```bash
sudo nano /etc/nginx/sites-available/frameseek
```

```nginx
server {
    server_name api.frameseek.com;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (job progress)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/frameseek /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# SSL certificate
sudo certbot --nginx -d api.frameseek.com
```

### Option B: Docker Compose (Full Stack)

If you prefer containerizing the backend too, create `Dockerfile`:

```dockerfile
FROM python:3.12-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
```

Add to `docker-compose.yml`:

```yaml
  api:
    build: .
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./storage:/app/storage

  worker:
    build: .
    command: arq app.workers.worker.WorkerSettings
    env_file: .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./storage:/app/storage
```

Then: `docker compose up -d`

### Option C: Cloud Run / Railway / Render

These platforms support Docker or Python buildpacks. Key considerations:

- **Two services needed**: API server + ARQ worker (separate processes)
- **Persistent storage**: Use GCS (not local disk) since containers are ephemeral
- **Managed databases**: Use managed PostgreSQL (e.g. Supabase, Neon, Cloud SQL) and managed Redis (e.g. Upstash, Redis Cloud)
- **Qdrant**: Use Qdrant Cloud (free tier: 1GB) or self-host on a VM

Environment variables are set via the platform's dashboard instead of `.env`.

### Deployment Checklist

#### Infrastructure
- [ ] PostgreSQL running and accessible
- [ ] Redis running and accessible
- [ ] Qdrant running and accessible
- [ ] GCS bucket created and service account has access
- [ ] Domain DNS pointing to server (`api.frameseek.com`)
- [ ] SSL certificate configured

#### Backend
- [ ] Python 3.12+ installed
- [ ] `ffmpeg` installed (required for frame extraction and whisper)
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] `.env` configured with all production values
- [ ] `JWT_SECRET_KEY` is a strong random value (not the default)
- [ ] `DEBUG=false`
- [ ] Migrations applied (`alembic upgrade head`)
- [ ] API server running (uvicorn with multiple workers)
- [ ] ARQ worker running (handles video processing + cron jobs)
- [ ] Nginx proxying to port 8000 with SSL
- [ ] `client_max_body_size` set to at least 500M (for video uploads)

#### Verify

```bash
# Health check
curl https://api.frameseek.com/docs

# Check API responds
curl https://api.frameseek.com/api/v1/auth/me \
  -H "Authorization: Bearer <token>"

# Check subscription endpoint
curl https://api.frameseek.com/api/v1/subscriptions/status \
  -H "Authorization: Bearer <token>"

# Check webhook is reachable (Apple will POST here)
curl -X POST https://api.frameseek.com/api/v1/subscriptions/apple-notification \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Updating / Deploying New Versions

```bash
cd /opt/frameseek
git pull

# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
pm2 restart all
```

---

## Troubleshooting

### "Unavailable" on Paywall

Products array is empty. Possible causes:
- StoreKit config not set in Xcode scheme (local dev)
- Product IDs don't match between config and App Store Connect (sandbox)
- Paid Apps Agreement not signed in App Store Connect
- Products not in "Ready to Submit" or "Approved" status

### Receipt Verification Fails

- Check `APPLE_SHARED_SECRET` matches App Store Connect
- Check `APPLE_IAP_ENVIRONMENT` — sandbox receipts fail on production endpoint and vice versa
- Backend automatically falls back to sandbox if production returns status 21007

### Webhook Not Received

- Notification URL must be HTTPS with valid certificate
- Check App Store Connect → App Store Server Notifications for delivery status
- Ensure V2 is selected (not V1)

### Subscription Not Activating

- Check backend logs for receipt verification response
- Verify product IDs in `PRODUCT_PLAN_MAP` match exactly
- Ensure `finishTransaction` is called after processing (handled by purchaseUpdatedListener)
