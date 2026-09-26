# FrameSeek: Azure Infrastructure (Bicep)

The current deployment uses `production.bicep` and `production-apps.bicep` in
resource group `frameseek-prod`, Central India. See [DEPLOY.md](../DEPLOY.md) for the
validated deployment procedure. It uses Azure Managed Redis and reuses existing AI
resources. The older `main.bicep` scaffold documented below is retained for reference.

Phase 0 foundation for the web rebuild. Provisions everything the API, worker, and web app
need, in the EU, with managed identity everywhere (no key files).

## What this deploys

| Module | Resource | Notes |
|---|---|---|
| `monitoring` | Log Analytics + Application Insights | Fixes the "silent worker death" gap |
| `identity` | User-assigned managed identity | Replaces `service-account.json` |
| `network` | VNet + delegated subnets + Postgres private DNS | Postgres is VNet-private |
| `keyvault` | Key Vault (RBAC) | JWT secret, Stripe, Google OAuth, DB creds |
| `acr` | Container Registry | Admin user disabled; identity pulls via AcrPull |
| `storage` | Blob Storage (`videos`/`frames`/`clips`) | Replaces GCS; shared-key auth disabled |
| `postgres` | PostgreSQL Flexible Server 16 + pgvector | Replaces Qdrant; 14-day managed backups |
| `servicebus` | Service Bus namespace + `video-processing` queue | Triggers the worker; dead-letters stuck jobs |
| `redis` | Azure Cache for Redis | Rate limiting + SSE progress |
| `ai` | Azure OpenAI (Whisper) + AI Vision (multimodal embeddings) | Foundry models, MI auth |
| `containerapps` | Managed env + API app + worker Job | Worker scales on queue depth (KEDA) |

## Region strategy

- **Primary: `westeurope`** for compute, data, storage and AI Vision. Keeps all data in the EU.
- **`swedencentral` for Azure OpenAI (Whisper)**: widest EU model coverage. Cross-region
  calls from the API/worker are fine (transcription latency is non-critical).

**Before first deploy, verify model availability** in the chosen regions:

```bash
# Whisper in the OpenAI region
az cognitiveservices model list -l swedencentral \
  --query "[?model.name=='whisper'].{name:model.name, version:model.version}" -o table

# AI Vision multimodal embeddings (Image Analysis 4.0) is region-gated: confirm westeurope
# supports the 'vectorizeImage'/'vectorizeText' operations before relying on it, else move
# the Computer Vision account to a supported EU region (e.g. northeurope).
```

## Deploy

```bash
# 1. Resource group
az group create -n rg-frameseek-prod -l westeurope

# 2. Lint (no deploy)
az bicep build --file infra/main.bicep --stdout > /dev/null

# 3. Preview changes
az deployment group what-if -g rg-frameseek-prod \
  -f infra/main.bicep -p @infra/main.parameters.json \
  -p postgresAdminPassword="$(openssl rand -base64 24)"

# 4. Deploy
az deployment group create -g rg-frameseek-prod \
  -f infra/main.bicep -p @infra/main.parameters.json \
  -p postgresAdminPassword="$(openssl rand -base64 24)"
```

Pass `postgresAdminPassword` on the command line (or via a Key Vault reference): never commit it.

## Post-deploy steps

1. **Enable pgvector** (the extension is allowlisted; create it once per database):
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
2. **Seed Key Vault secrets** the app reads at runtime:
   ```bash
   KV=$(az deployment group show -g rg-frameseek-prod -n main --query properties.outputs.keyVaultName.value -o tsv)
   az keyvault secret set --vault-name "$KV" -n jwt-secret --value "$(openssl rand -hex 32)"
   az keyvault secret set --vault-name "$KV" -n stripe-secret-key --value "sk_live_..."
   az keyvault secret set --vault-name "$KV" -n stripe-webhook-secret --value "whsec_..."
   az keyvault secret set --vault-name "$KV" -n google-oauth-client-secret --value "..."
   az keyvault secret set --vault-name "$KV" -n postgres-connection-string --value "postgresql+asyncpg://fsadmin:...@<fqdn>/frameseek"
   ```
3. Build & push the API/worker images to ACR, then update the Container App/Job images
   (handled by CI in Phase 4).

## Phase-4 hardening (deferred, tracked)

This foundation keeps Key Vault, Storage, Service Bus, Redis, and ACR on **public endpoints
locked down by RBAC + firewall defaults**. The `snet-pe` subnet is already reserved. Before
GA, add private endpoints + private DNS zones for each and flip `publicNetworkAccess` to
`Disabled`. Also add: Front Door + WAF in front of the API, Redis `Standard` tier for the SLA,
Postgres `highAvailability` zone-redundant, and geo-redundant backups.
