# Production Deployment — Account Deletion + Permission Strings

## Architecture

- **Docker Compose**: Postgres, Redis, Qdrant (infra only)
- **PM2 on host**: `frameseek-api` (uvicorn) + `frameseek-worker` (arq)

---

## Commands to run on GCP server

```bash
# 1. Pull latest code
cd /path/to/frameseek/backend
git pull origin main

# 2. Install dependencies (in case of new packages)
source venv/bin/activate
pip install -r requirements.txt

# 3. Generate the migration
alembic revision --autogenerate -m "add account_deletion_feedback table"

# 4. Review it (sanity check)
ls -lt migrations/versions/ | head -3
# read the latest file to confirm it creates account_deletion_feedback table

# 5. Apply migration to production database
alembic upgrade head

# 6. Verify table was created
docker exec -it $(docker ps -qf "ancestor=postgres:15") \
  psql -U frameseek -d frameseek -c "\d account_deletion_feedback"

# 7. Restart API and worker
pm2 restart frameseek-api frameseek-worker

# 8. Check logs for errors
pm2 logs frameseek-api --lines 20

# 9. Verify the new endpoint is registered (expect 401 = route exists, auth required)
curl -s -o /dev/null -w "%{http_code}" -X DELETE https://api.frameseek.in/api/v1/auth/account \
  -H "Content-Type: application/json" -d '{"reason":"test"}'
# Should print: 401
```

That's it. After this, build and submit the iOS app from your local machine.
