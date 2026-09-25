# FrameSeek — Deploy & Test

Two tracks: a **local dev loop** for fast iteration, and a **full Azure deploy**.

> One thing that can't be faked locally: the AI steps (frame embeddings + Whisper
> transcription) call Azure AI Vision and Azure OpenAI. There's no local emulator for
> those, so full video processing needs real Azure AI endpoints (reachable from your
> machine via `az login`). The API and web UI run locally. Google login needs a web
> OAuth client id/secret. Payments default to disabled; enabling billing needs Stripe
> test keys and `PAYMENTS_ENABLED=true`. R2 and Supabase are
> planned hosted replacements; local development currently uses Azurite and Postgres.

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

## B. Azure deploy

### 1. Prerequisites

```bash
az login
az account set --subscription <sub-id>
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.ServiceBus
# Request Azure OpenAI + AI Vision access on the subscription if not already granted.
```

Verify model region availability first (see `infra/README.md` — the Whisper/AI-Vision check).

### 2. Provision infrastructure

```bash
az group create -n rg-frameseek-prod -l westeurope
az deployment group create -g rg-frameseek-prod \
  -f infra/main.bicep -p @infra/main.parameters.json \
  -p postgresAdminPassword="$(openssl rand -base64 24)"
```

Grab the outputs (`az deployment group show -g rg-frameseek-prod -n main --query properties.outputs`).

### 3. Migrations + Key Vault secrets

```bash
# Enable pgvector + run migrations (psql to the flexible server, then):
alembic upgrade head

KV=<keyVaultName from outputs>
az keyvault secret set --vault-name $KV -n jwt-secret --value "$(openssl rand -hex 32)"
az keyvault secret set --vault-name $KV -n postgres-connection-string \
  --value "postgresql+asyncpg://fsadmin:<pw>@<postgresFqdn>/frameseek"
az keyvault secret set --vault-name $KV -n google-oauth-client-secret --value "<...>"
az keyvault secret set --vault-name $KV -n stripe-secret-key --value "sk_live_..."
az keyvault secret set --vault-name $KV -n stripe-webhook-secret --value "whsec_..."
```

### 4. App environment variables

Secrets load from Key Vault automatically (config reads `AZURE_KEY_VAULT_URI`). Set the
remaining **non-secret** config on the API app and worker job — these aren't in the Bicep
by default:

```bash
RG=rg-frameseek-prod
az containerapp update -n <API_APP> -g $RG --set-env-vars \
  DEBUG=false COOKIE_SECURE=true \
  FRONTEND_URL=https://app.frameseek.in \
  CORS_ORIGINS=https://app.frameseek.in \
  GOOGLE_CLIENT_ID=<...> \
  GOOGLE_OAUTH_REDIRECT_URI=https://api.frameseek.in/api/v1/auth/google/callback \
  AZURE_STORAGE_ACCOUNT_URL=<blobEndpoint> \
  AZURE_VISION_ENDPOINT=<visionEndpoint> \
  AZURE_OPENAI_ENDPOINT=<openAiEndpoint> \
  STRIPE_PRICE_PRO_MONTHLY=price_... STRIPE_PRICE_PRO_MAX_MONTHLY=price_...
```

Add the same AI/storage/service-bus env vars to the worker job (`az containerapp job update`).

### 5. Build & deploy (CI)

Set these GitHub repo **variables** before requesting a deployment:
`AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID, ACR_NAME, RESOURCE_GROUP,
API_APP, WORKER_JOB, WEB_APP` (OIDC federated credential on the app registration).

Pushes and pull requests run backend tests (with PostgreSQL/pgvector and Redis) and
the web build/type check. Azure deployment is a separate manual workflow dispatch
with `deploy` selected. The Azure scaffold still needs deployment validation,
web Container App provisioning, and migration-job identity/configuration before
it is ready to use. Its deployment steps build images in ACR, start the migration
job, and roll the Container Apps. Manual image-build commands are:

```bash
az acr build -r <ACR_NAME> -t frameseek-api:latest ./backend
az acr build -r <ACR_NAME> -t frameseek-web:latest ./web
az containerapp update -n <API_APP> -g $RG --image <ACR_NAME>.azurecr.io/frameseek-api:latest
```

### 6. External wiring

- **Google**: add the prod redirect URI (`https://api.frameseek.in/...callback`).
- **Stripe (when enabling payments)**: add a webhook endpoint → `https://api.frameseek.in/api/v1/subscriptions/webhook`,
  create products/prices, put the price IDs in the env vars above, and set
  `PAYMENTS_ENABLED=true` on the API. Keep it false to launch with payments disabled.
- **DNS / TLS**: point `app.` and `api.` at the Container Apps ingress; add Front Door + WAF
  (hardening, see `infra/README.md`).

### 7. Smoke test

```bash
curl https://api.frameseek.in/health          # {"api":"ok","postgres":"ok"}
```
Then in the browser: Google login → upload → process → search. Test checkout only
when payments are enabled.
