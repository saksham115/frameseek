# FrameSeek

AI-powered video search platform. Find any moment in your videos using natural language.

Upload videos → AI extracts frames & generates embeddings → Search by describing what you're looking for → Jump to the exact timestamp.

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────┐
│   Mobile App    │────▶│         FastAPI Backend               │
│   (Expo/RN)     │     │                                      │
│                 │     │  Auth · Videos · Search · Jobs        │
│  iOS / Android  │     │  Folders · Analytics · Storage        │
└─────────────────┘     └──────┬───────┬───────┬───────────────┘
                               │       │       │
                          ┌────▼──┐ ┌──▼──┐ ┌──▼────┐
                          │Postgre│ │Redis│ │Qdrant │
                          │  SQL  │ │     │ │(Vector│
                          │  15   │ │  7  │ │  DB)  │
                          └───────┘ └─────┘ └───────┘
```

| Layer | Tech | Purpose |
|-------|------|---------|
| Backend | FastAPI (Python) | REST API, auth, business logic |
| Queue | ARQ + Redis | Background video processing |
| Database | PostgreSQL 15 | Users, videos, jobs, search history |
| Vector DB | Qdrant | Frame embeddings for semantic search |
| Embeddings | Vertex AI multimodal (1408-dim) | Image & text embedding generation |
| Frame Extraction | OpenCV + ffmpeg | Extract frames at configurable intervals |
| Storage | Local FS / Google Cloud Storage | Hybrid file storage with signed URLs |
| Mobile | React Native / Expo SDK 54 | Cross-platform iOS & Android app |
| State | Zustand | Client-side state management |
| Navigation | React Navigation 6 | Native stack + bottom tabs |

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose
- ffmpeg (`brew install ffmpeg`)

### 1. Start Infrastructure

```bash
cd backend
docker compose up -d
```

This starts PostgreSQL (`:5432`), Redis (`:6379`), and Qdrant (`:6333`).

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy env and edit as needed
cp .env.example .env

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --port 8000
```

API docs available at [http://localhost:8000/docs](http://localhost:8000/docs).

### 3. Start the Worker (separate terminal)

```bash
cd backend
source venv/bin/activate
arq app.workers.worker.WorkerSettings
```

### 4. Mobile App Setup

```bash
cd mobile
npm install

# Start Expo dev server
npx expo start
```

Press `i` for iOS Simulator or `a` for Android Emulator.

## Project Structure

```
frameseek/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── config.py               # Pydantic settings
│   │   ├── database.py             # SQLAlchemy async engine
│   │   ├── dependencies.py         # Auth dependency injection
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   ├── routers/                # API route handlers
│   │   ├── services/               # Business logic
│   │   ├── repositories/           # Data access layer
│   │   ├── workers/                # ARQ background workers
│   │   └── utils/                  # Security, formatting, metadata
│   ├── migrations/                 # Alembic migrations
│   ├── storage/                    # Local file storage (videos, frames)
│   ├── docker-compose.yml
│   ├── requirements.txt
│   └── .env.example
│
├── mobile/
│   ├── src/
│   │   ├── App.tsx                 # Root component, font loading, nav
│   │   ├── constants/              # Theme tokens, config, routes
│   │   ├── types/                  # TypeScript types (API, navigation)
│   │   ├── hooks/                  # useTheme, useDebounce
│   │   ├── providers/              # ThemeProvider
│   │   ├── navigation/             # Auth, Main (tabs), App stacks
│   │   ├── screens/                # 10 screens across 4 groups
│   │   ├── components/             # 19 reusable components
│   │   ├── services/api/           # Axios client, API modules
│   │   ├── services/storage/       # SecureStore, AsyncStorage
│   │   ├── store/slices/           # Zustand stores (auth, videos, search, ui)
│   │   └── utils/                  # Formatting, validation (Zod)
│   ├── App.tsx                     # Re-exports src/App
│   ├── app.json
│   ├── tsconfig.json
│   └── package.json
│
├── TECHNICAL_SPECIFICATION.md
├── PRODUCT_SPECIFICATION.md
└── README.md
```

## API Endpoints

All endpoints prefixed with `/api/v1/`.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Sign in |
| POST | `/auth/refresh` | Refresh JWT tokens |
| POST | `/auth/logout` | Sign out |

### Videos
| Method | Path | Description |
|--------|------|-------------|
| GET | `/videos` | List videos (paginated, filterable) |
| POST | `/videos` | Upload video (multipart) |
| GET | `/videos/:id` | Video detail + frame count |
| DELETE | `/videos/:id` | Soft-delete video |
| POST | `/videos/:id/process` | Trigger processing pipeline |
| GET | `/videos/:id/frames` | List extracted frames |

### Search
| Method | Path | Description |
|--------|------|-------------|
| POST | `/search` | Semantic search across all frames |
| GET | `/search/history` | Recent search queries |
| GET | `/search/quota` | Daily search quota status |

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/jobs` | List processing jobs |
| GET | `/jobs/:id` | Job detail |
| POST | `/jobs/:id/cancel` | Cancel a job |
| GET | `/jobs/:id/progress` | SSE progress stream |

### Folders
| Method | Path | Description |
|--------|------|-------------|
| GET | `/folders` | List folders |
| POST | `/folders` | Create folder |
| PUT | `/folders/:id` | Rename folder |
| DELETE | `/folders/:id` | Delete folder |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/dashboard` | Dashboard stats |
| GET | `/storage/quota` | Storage usage |

## Processing Pipeline

```
Upload → Save to disk → Extract metadata (ffprobe)
                              │
                    ┌─────────▼──────────┐
                    │  ARQ Job Queue     │
                    └─────────┬──────────┘
                              │
              ┌───────────────▼───────────────┐
              │  1. Frame Extraction (OpenCV)  │
              │     - Configurable interval    │
              │     - JPEG frames + thumbnails │
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │  2. Embedding Generation       │
              │     - Vertex AI multimodal     │
              │     - 1408-dim vectors         │
              │     - Mock mode for dev        │
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │  3. Vector Storage (Qdrant)    │
              │     - Per-user collections     │
              │     - Cosine similarity        │
              └───────────────┬───────────────┘
                              │
                     Video status → "ready"
```

## Mobile Screens

| Screen | Description |
|--------|-------------|
| Login | Email/password, FrameSeek branding |
| Register | Name/email/password with validation |
| Forgot Password | Email input with success state |
| Dashboard | Search bar, quick stats, recent videos & searches, upload FAB |
| Search | Auto-focus, 300ms debounce, 2-column results grid, history chips |
| Videos | Segment control (All/Processing/Ready), video cards with status |
| Video Detail | Metadata, frames grid, process/delete actions |
| Upload | Camera roll or file picker, upload progress |
| Settings | Account, theme toggle, processing prefs, about, sign out |
| Profile | Editable name, plan info, storage usage |

## Design System

FrameSeek uses a custom design system built on brand tokens.

| Token | Dark | Light |
|-------|------|-------|
| Background | `#0A0A0B` | `#F5F3EF` |
| Surface | `#131315` | `#FFFFFF` |
| Amber (brand) | `#D4A053` | `#C08A30` |
| Text | `#E8E4DD` | `#1A1A1E` |
| Success | `#6EC87A` | `#2D8A3E` |
| Error | `#E06060` | `#C03030` |

**Fonts:** Plus Jakarta Sans (UI), JetBrains Mono (timestamps, code)

## Storage

FrameSeek supports two storage backends: **local filesystem** (default, for dev) and **Google Cloud Storage** (for production). Both can coexist — old files on local disk continue working while new uploads go to GCS.

### Local Storage (default)

No configuration needed. Files are saved to `backend/storage/` and served via a static mount at `/storage/`.

### Google Cloud Storage

#### 1. Create a GCS bucket

```bash
gcloud storage buckets create gs://frameseek-storage \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --public-access-prevention
```

#### 2. Grant the service account access

```bash
SA_EMAIL=$(python3 -c "import json; print(json.load(open('service-account.json'))['client_email'])")
gcloud storage buckets add-iam-policy-binding gs://frameseek-storage \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"
```

#### 3. Configure environment variables

Add to your `.env`:

```env
GCS_BUCKET_NAME=frameseek-storage
GCS_SIGNED_URL_EXPIRY_MINUTES=60   # optional, defaults to 60
```

When `GCS_BUCKET_NAME` is set, new uploads (videos, frames, clips, thumbnails) are stored in GCS. The API returns time-limited signed URLs for file access instead of local `/storage/...` paths.

#### How it works

```
API response URL construction:
  gcs_path set?  →  signed URL (https://storage.googleapis.com/...?X-Goog-Signature=...)
  gcs_path null? →  local relative path (/storage/videos/...)

Mobile resolveMediaUrl():
  starts with http?    →  use as-is (signed GCS URL)
  starts with /storage →  prepend STORAGE_BASE_URL (local dev or old files)
```

The `StaticFiles` mount stays — it continues serving existing local files. No data migration is needed.

## Development Notes

- **Mock embeddings**: When `GCP_PROJECT_ID` is empty, the embedding service generates deterministic mock vectors. Search still works — results will be random but the full pipeline runs end to end.
- **Vertex AI**: Set `GCP_PROJECT_ID` and authenticate with `gcloud auth application-default login` to use real multimodal embeddings.
- **Database migrations**: After changing models, run `alembic revision --autogenerate -m "description"` then `alembic upgrade head`.
- **Mobile API URL**: Configured in `mobile/src/constants/config.ts`. Defaults to `localhost:8000` in dev.

## License

Private project.
