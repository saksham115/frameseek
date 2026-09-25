# FrameSeek — Deploy & Test

Two tracks: a **local dev loop** for fast iteration, and a **full Azure deploy**.

> One thing that can't be faked locally: the AI steps (frame embeddings + Whisper
> transcription) call Azure AI Vision and Azure OpenAI. There's no local emulator for
> those, so full video processing needs real Azure AI endpoints (reachable from your
> machine via `az login`). The API and web UI run locally. Google login needs a web
> OAuth client id/secret. Payments default to disabled; enabling billing needs Stripe
> test keys and `PAYMENTS_ENABLED=true`. Production uses Azure Blob and Azure
> PostgreSQL; local development uses Azurite and Postgres.

## Current workstation

FrameSeek uses Postgres on **55435**, the API on **8001**, and the web app on **8080**
to avoid other projects already using 5432 and 8000. The ignored `backend/.env`
contains the matching database URL, `POSTGRES_PORT=55435`, and OAuth callback
`http://localhost:8001/api/v1/auth/google/callback`.

```bash
cd backend
source venv/bin/activate
docker compose up -d --wait
python -m scripts.init_local_storage
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

In another terminal, from the repository root:

```bash
cd web
API_PROXY_TARGET=http://127.0.0.1:8001 bun run dev -- --strictPort
```

Open [FrameSeek](http://localhost:8080) or [API docs](http://localhost:8001/docs).
Use `localhost` consistently for the browser and OAuth callback so cookies match.
The local API health check is `curl http://localhost:8001/health`.
Google login is configured locally and its callback/session flow has been verified.
On another machine, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and register
the callback on the OAuth web client. Azure transcription and visual search have
passed a live synthetic-video test locally. Payments are disabled; Stripe test keys
are not configured. Original video playback works even if AI processing fails.

The dedicated `frameseek_test` database is initialized. Run
`venv/bin/python -m pytest -q` from `backend/` to test against it; this suite
drops/recreates its tables. Tests include actual pgvector SQL, cookie-session
rotation/revocation, queue visibility, and the payments flag. Automated tests mock
Azure AI and Stripe; the separate manual Azure test used live services.

---

## A. Local dev loop

### 1. Infrastructure (Postgres+pgvector, Azurite, host Redis)

```bash
cd backend
docker compose up -d

# Create the Blob containers in Azurite (well-known dev connection string)
AZURITE="DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
for c in videos frames clips; do
  az storage container create --name $c --connection-string "$AZURITE"
done
```

Redis runs on the host at port 6379 (`redis-cli ping` should return `PONG`).
If needed, install/start it with `brew install redis` and `brew services start redis`.
After configuring `.env` and installing backend dependencies below, run
`python -m scripts.init_local_storage` to configure CORS for direct browser uploads.

### 2. Google OAuth (one-time)

In Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID → Web
application**. Add authorized redirect URI: `http://localhost:8000/api/v1/auth/google/callback`.
Copy the client id + secret.

### 3. Backend config

```bash
cd backend
cp .env.example .env
```

Fill in `.env`:
```
JWT_SECRET_KEY=<openssl rand -hex 32>
GOOGLE_CLIENT_ID=<from step 2>
GOOGLE_CLIENT_SECRET=<from step 2>
AZURE_STORAGE_CONNECTION_STRING=<the AZURITE string from step 1>
# Point these at REAL Azure AI (from the Phase-0 deploy outputs). Leave blank to skip processing.
AZURE_VISION_ENDPOINT=https://cv-frameseek-xxxx.cognitiveservices.azure.com/
AZURE_OPENAI_ENDPOINT=https://oai-frameseek-xxxx.openai.azure.com/
# SERVICE_BUS_FQDN empty → jobs run inline (no queue needed locally)
DEBUG=true
COOKIE_SECURE=false
```

`az login` so `DefaultAzureCredential` can reach the Azure AI endpoints with your user
identity (you need the **Cognitive Services User** role on those resources).

### 4. Run it

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head          # creates schema + pgvector table
uvicorn app.main:app --reload # http://localhost:8000

# in another terminal
cd web
bun install
bun run dev                   # http://localhost:8080  (proxies /api → :8000)
```

Open http://localhost:8080 → "Continue with Google" → upload a video → watch it process →
search. (If AI endpoints are blank, upload/finalize works but processing fails at the
embedding step.)

### 5. Stripe (optional, local)

Leave `PAYMENTS_ENABLED=false` to hide billing in the web app and block Stripe calls.
Checkout, portal, and webhook routes return HTTP 503 while disabled; webhook events
are not acknowledged, so Stripe can retry them. This flag does not cancel existing
Stripe subscriptions or change plan quotas. Production startup does not require
Stripe keys while payments are disabled.

When ready to test payments:

```bash
stripe login
stripe listen --forward-to localhost:8000/api/v1/subscriptions/webhook
# put the printed whsec_... into STRIPE_WEBHOOK_SECRET, and your sk_test_... into STRIPE_SECRET_KEY
# create test products/prices, set STRIPE_PRICE_PRO_MONTHLY=price_... etc.
# set PAYMENTS_ENABLED=true in backend/.env and restart the API
```

### 6. Tests

```bash
cd backend
createdb frameseek_test  # or: psql -c "CREATE DATABASE frameseek_test;"
pytest -q
```

---

## B. Azure production

Production uses resource group `frameseek-prod` in Central India. The web app has
public HTTPS ingress; the API and PostgreSQL are private to the Container Apps
network. Blob containers are private and use short-lived user-delegation SAS URLs.
The existing East US Vision and South India Whisper resources are reused.
Payments remain disabled. Local development data is not copied to production.

App: https://frameseek-web.wittysmoke-b6d8c05c.centralindia.azurecontainerapps.io

### Provisioning

`infra/production.bicep` creates PostgreSQL 16 with pgvector, Blob, Azure Managed
Redis (Balanced B0), Service Bus, Key Vault, ACR, networking and the Container Apps
environment. `infra/production-apps.bicep` deploys the web/API, event worker and a
manual migration job. `infra/main.bicep` is the older, unused scaffold.

Initial deployment inputs are in ignored `infra/.deployment/` on the setup machine.
The foundation parameter file includes the database password and must stay private.
The app parameter file contains nonsecret resource configuration and an image tag.
Do not recreate or rotate the database password inadvertently on repeat deployments.

```bash
az deployment group create -g frameseek-prod -n foundation \
  -f infra/production.bicep -p @infra/.deployment/foundation.parameters.json
az acr build -r acrfsg7unyr2nlrdvk -t frameseek-api:<tag> ./backend
az acr build -r acrfsg7unyr2nlrdvk -t frameseek-web:<tag> ./web
# Create/update the migration job first; it retains VNet access and managed identity.
az deployment group create -g frameseek-prod -n migration-setup \
  -f infra/production-apps.bicep -p @infra/.deployment/apps.parameters.json \
  -p imageTag=<tag> deployServices=false
az containerapp job start -g frameseek-prod -n frameseek-migrate
# Check the execution reaches Succeeded before rolling the running application.
az containerapp job execution list -g frameseek-prod -n frameseek-migrate -o table
az deployment group create -g frameseek-prod -n applications \
  -f infra/production-apps.bicep -p @infra/.deployment/apps.parameters.json -p imageTag=<tag>
```

The workload identity needs `Cognitive Services User` on `frameseek-cv-us` in resource
group `frameseek` and `Cognitive Services OpenAI User` on
`saksham115-9666-resource` in `kaapi-new`. Those resource-scoped assignments were
created separately because the AI resources already existed.

### Secrets and configuration

Azure Key Vault `kv-fs-g7unyr2nlrdvk` holds:

| Key Vault name | Application setting |
| --- | --- |
| `postgres-connection-string` | `DATABASE_URL` |
| `redis-connection-string` | `REDIS_URL` |
| `jwt-secret` | `JWT_SECRET_KEY` |
| `google-oauth-client-secret` | `GOOGLE_CLIENT_SECRET` |

The API and jobs read these using their managed identity. AI and Blob also use
managed identity, so no Azure API/storage keys are embedded in the application.
After rotating a secret, restart the API revision; new job executions load the new
value automatically. Optional local input `backend/.env.production` is git-ignored
and is not packaged in either Docker image.

`production-apps.bicep` holds nonsecret environment settings: endpoints, Google
client ID, callback URL, `DATABASE_SSL=true`, secure cookies and payments disabled.
Blob CORS permits only the production web origin. The web nginx proxy forwards
`/api/` to the private API, so browser cookies stay on one HTTPS origin.

Google OAuth redirect URI:
`https://frameseek-web.wittysmoke-b6d8c05c.centralindia.azurecontainerapps.io/api/v1/auth/google/callback`

### Validation and subsequent releases

Health: `https://frameseek-web.wittysmoke-b6d8c05c.centralindia.azurecontainerapps.io/health`.
A manual job can run `python -m app.deployment_check` using the same environment and
identity as the migration job. It creates a disposable account, uploads the bundled
synthetic clip, waits for the actual queue worker, checks Whisper, visual search,
signed frames and range playback, then removes its test data. A timed-out job keeps
its own records for diagnosis. This does not replace a real Google browser login.

Pushes run tests; deployment remains manual. The GitHub workflow requires an Azure
OIDC identity and repository variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID`, `ACR_NAME`, `RESOURCE_GROUP`, `API_APP`, `WORKER_JOB`,
`WEB_APP`, and `MIGRATION_JOB`. It waits for successful migrations before rollout.
OIDC setup is separate from this initial CLI deployment.
