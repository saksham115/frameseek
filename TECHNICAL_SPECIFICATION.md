# Technical Specification: AI Video Search v2.0

## Cross-Platform Mobile & Desktop Application

**Version:** 2.0
**Date:** January 2026
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Backend Services](#4-backend-services)
5. [Database Design](#5-database-design)
6. [Vector Database Architecture](#6-vector-database-architecture)
7. [API Specification](#7-api-specification)
8. [Worker Architecture](#8-worker-architecture)
9. [Authentication & Security](#9-authentication--security)
10. [File Storage Strategy](#10-file-storage-strategy)
11. [Multi-Tenancy Implementation](#11-multi-tenancy-implementation)
12. [Mobile Architecture](#12-mobile-architecture)
13. [Desktop Architecture](#13-desktop-architecture)
14. [Offline Support](#14-offline-support)
15. [Performance Requirements](#15-performance-requirements)
16. [Deployment Architecture](#16-deployment-architecture)
17. [Development Guidelines](#17-development-guidelines)

---

## 1. Executive Summary

### 1.1 Project Overview

AI Video Search v2.0 is a cross-platform application enabling semantic search through video content using natural language queries. Users upload videos, which are processed to extract frames and generate AI embeddings. These embeddings enable intelligent search where users describe what they're looking for in plain language.

### 1.2 Key Features

- **Semantic Video Search**: Natural language queries to find specific moments in videos
- **Multi-Source Support**: Local uploads, Google Drive, cloud storage integration
- **Cross-Platform**: Native mobile (iOS/Android) and desktop (macOS/Windows/Linux) apps
- **Offline Capability**: Local processing and search when disconnected
- **Worker-Based Processing**: Scalable background video processing pipeline

### 1.3 Architecture Philosophy

The system follows a **microservices architecture** with a clear separation between:

1. **Client Applications** (Mobile/Desktop) - User interface and local operations
2. **API Gateway** - Request routing, authentication, rate limiting
3. **Core Services** - Business logic and data management
4. **Worker Services** - Background processing (frame extraction, embedding generation)
5. **Data Stores** - PostgreSQL, Vector DB, Object Storage

### 1.4 Design Principles

- **Worker-First Processing**: All heavy computation happens in background workers
- **API-Driven**: All functionality exposed via RESTful APIs
- **Multi-Tenant Isolation**: Complete data separation per user
- **Horizontal Scalability**: Workers can scale independently
- **Offline-First Mobile**: Core features work without connectivity

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────────┬─────────────────────┬─────────────────────────────────┤
│   iOS App           │   Android App       │   Desktop App                   │
│   (React Native)    │   (React Native)    │   (Electron/Tauri)              │
│                     │                     │                                 │
│   ┌─────────────┐   │   ┌─────────────┐   │   ┌─────────────┐               │
│   │ Local SQLite│   │   │ Local SQLite│   │   │ Local SQLite│               │
│   │ Local Vector│   │   │ Local Vector│   │   │ Local Vector│               │
│   └─────────────┘   │   └─────────────┘   │   └─────────────┘               │
└─────────────────────┴─────────────────────┴─────────────────────────────────┘
                                    │
                                    │ HTTPS/WSS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY LAYER                                  │
│                                                                             │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│   │   Auth      │   │   Rate      │   │   Request   │   │   Load      │    │
│   │   Middleware│   │   Limiter   │   │   Router    │   │   Balancer  │    │
│   └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CORE SERVICES LAYER                                 │
│                                                                             │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │  API Service    │   │  Search Service │   │  Storage Service│          │
│   │  (Node.js)      │   │  (Python)       │   │  (Node.js)      │          │
│   │                 │   │                 │   │                 │          │
│   │  - User CRUD    │   │  - Query embed  │   │  - Upload mgmt  │          │
│   │  - Video CRUD   │   │  - Vector search│   │  - GCS/S3 proxy │          │
│   │  - Job mgmt     │   │  - Result rank  │   │  - Presign URLs │          │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘          │
│            │                     │                     │                    │
└────────────┼─────────────────────┼─────────────────────┼────────────────────┘
             │                     │                     │
             ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WORKER SERVICES LAYER                               │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                        Job Queue (Redis/BullMQ)                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│            │                     │                     │                    │
│            ▼                     ▼                     ▼                    │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │ Frame Extractor │   │ Embedding Gen   │   │ Cleanup Worker  │          │
│   │ Worker (Python) │   │ Worker (Python) │   │ (Node.js)       │          │
│   │                 │   │                 │   │                 │          │
│   │ - OpenCV        │   │ - Vertex AI     │   │ - Temp files    │          │
│   │ - ffmpeg        │   │ - Batch process │   │ - Old jobs      │          │
│   │ - Thumbnail gen │   │ - Retry logic   │   │ - Storage quota │          │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA STORAGE LAYER                                 │
│                                                                             │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │   PostgreSQL    │   │   Qdrant        │   │   Object Storage│          │
│   │                 │   │   (Vector DB)   │   │   (GCS/S3)      │          │
│   │   - Users       │   │                 │   │                 │          │
│   │   - Videos      │   │   - Embeddings  │   │   - Videos      │          │
│   │   - Jobs        │   │   - HNSW Index  │   │   - Frames      │          │
│   │   - Analytics   │   │   - Metadata    │   │   - Thumbnails  │          │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Service Communication

| Source | Destination | Protocol | Purpose |
|--------|-------------|----------|---------|
| Client | API Gateway | HTTPS | All API requests |
| Client | API Gateway | WSS | Real-time updates |
| API Service | Search Service | gRPC | Search queries |
| API Service | Redis | TCP | Job queuing |
| Workers | Redis | TCP | Job consumption |
| Workers | PostgreSQL | TCP | Status updates |
| Workers | Vector DB | HTTP | Embedding storage |
| Workers | Object Storage | HTTPS | File upload/download |

### 2.3 Data Flow Overview

```
VIDEO UPLOAD FLOW:
Client → API Gateway → API Service → Object Storage (video)
                                   → PostgreSQL (metadata)
                                   → Redis (processing job)

PROCESSING FLOW:
Redis → Frame Worker → Object Storage (frames)
                     → PostgreSQL (frame records)
                     → Redis (embedding job)

Redis → Embedding Worker → Vertex AI (embedding generation)
                         → Vector DB (embedding storage)
                         → PostgreSQL (job complete)

SEARCH FLOW:
Client → API Gateway → Search Service → Vertex AI (query embedding)
                                      → Vector DB (similarity search)
                                      → PostgreSQL (metadata enrichment)
                                      → Client (results)
```

---

## 3. Technology Stack

### 3.1 Backend Services

| Component | Technology | Justification |
|-----------|------------|---------------|
| API Service | Node.js 20 + TypeScript | Fast development, strong ecosystem |
| Search Service | Python 3.11 + FastAPI | ML library support, Vertex AI SDK |
| Worker Services | Python 3.11 | OpenCV, ffmpeg bindings |
| Job Queue | Redis + BullMQ | Reliable, scalable job processing |
| API Gateway | Kong / Nginx | Rate limiting, auth, routing |

### 3.2 Data Storage

| Component | Technology | Justification |
|-----------|------------|---------------|
| Primary DB | PostgreSQL 15 | ACID compliance, JSON support |
| Vector DB | Qdrant | Purpose-built for embeddings, HNSW |
| Object Storage | Google Cloud Storage | Scalable, CDN integration |
| Cache | Redis | Session cache, API cache |
| Message Queue | Redis Streams | Event pub/sub |

### 3.3 Mobile Application

| Component | Technology | Justification |
|-----------|------------|---------------|
| Framework | React Native 0.73+ | Cross-platform, code sharing |
| State Management | Zustand | Lightweight, TypeScript support |
| Local DB | SQLite (expo-sqlite) | Offline storage |
| Local Vector | HNSWLIB (via native module) | Offline search |
| Navigation | React Navigation 6 | Standard for RN |
| UI Components | React Native Paper / Tamagui | Material Design, theming |

### 3.4 Desktop Application

| Component | Technology | Justification |
|-----------|------------|---------------|
| Framework | Tauri 2.0 | Lightweight, native performance |
| Frontend | React + TypeScript | Code sharing with mobile |
| Local DB | SQLite | Offline storage |
| Local Vector | DuckDB with HNSW | Powerful embedded vector search |
| IPC | Tauri IPC | Secure frontend-backend comm |

### 3.5 AI/ML Components

| Component | Technology | Justification |
|-----------|------------|---------------|
| Embeddings | Google Vertex AI Multimodal | 1408-dim, high quality |
| Query Embedding | Gemini API | Text to embedding |
| Local Embeddings | ONNX Runtime | Offline embedding gen |
| Video Processing | OpenCV + ffmpeg | Frame extraction |

### 3.6 Infrastructure

| Component | Technology | Justification |
|-----------|------------|---------------|
| Container Runtime | Docker | Standardized deployment |
| Orchestration | Kubernetes | Scalable worker management |
| CI/CD | GitHub Actions | Integrated with repo |
| Monitoring | Prometheus + Grafana | Industry standard |
| Logging | Loki | Log aggregation |
| APM | OpenTelemetry | Distributed tracing |

---

## 4. Backend Services

### 4.1 API Service (Node.js)

**Responsibilities:**
- User authentication and session management
- Video metadata CRUD operations
- Job creation and status tracking
- Storage quota management
- Webhook handling

**Directory Structure:**
```
/api-service
├── src/
│   ├── index.ts                 # Entry point
│   ├── config/
│   │   ├── index.ts             # Configuration loader
│   │   ├── database.ts          # DB connection config
│   │   └── redis.ts             # Redis config
│   ├── middleware/
│   │   ├── auth.ts              # JWT validation
│   │   ├── rateLimit.ts         # Rate limiting
│   │   ├── validation.ts        # Request validation
│   │   └── errorHandler.ts      # Global error handler
│   ├── routes/
│   │   ├── auth.routes.ts       # /auth/*
│   │   ├── videos.routes.ts     # /videos/*
│   │   ├── jobs.routes.ts       # /jobs/*
│   │   ├── search.routes.ts     # /search/*
│   │   ├── folders.routes.ts    # /folders/*
│   │   ├── analytics.routes.ts  # /analytics/*
│   │   └── webhooks.routes.ts   # /webhooks/*
│   ├── services/
│   │   ├── auth.service.ts      # Auth business logic
│   │   ├── video.service.ts     # Video operations
│   │   ├── job.service.ts       # Job management
│   │   ├── storage.service.ts   # GCS operations
│   │   └── quota.service.ts     # Usage tracking
│   ├── repositories/
│   │   ├── user.repository.ts   # User data access
│   │   ├── video.repository.ts  # Video data access
│   │   └── job.repository.ts    # Job data access
│   ├── queues/
│   │   ├── index.ts             # BullMQ setup
│   │   ├── video.queue.ts       # Video processing queue
│   │   └── cleanup.queue.ts     # Cleanup queue
│   ├── types/
│   │   ├── index.ts             # Shared types
│   │   ├── api.types.ts         # API request/response
│   │   └── domain.types.ts      # Domain models
│   └── utils/
│       ├── logger.ts            # Winston logger
│       ├── crypto.ts            # Encryption helpers
│       └── validators.ts        # Zod schemas
├── tests/
│   ├── unit/
│   └── integration/
├── Dockerfile
├── package.json
└── tsconfig.json
```

**Key Endpoints:**

```typescript
// Auth
POST   /auth/register           // User registration
POST   /auth/login              // Email/password login
POST   /auth/oauth/google       // Google OAuth
POST   /auth/refresh            // Refresh token
POST   /auth/logout             // Logout

// Videos
GET    /videos                  // List user's videos
POST   /videos                  // Upload video
GET    /videos/:id              // Get video details
DELETE /videos/:id              // Delete video
POST   /videos/:id/process      // Start processing
GET    /videos/:id/frames       // Get video frames

// Jobs
GET    /jobs                    // List user's jobs
GET    /jobs/:id                // Get job status
POST   /jobs/:id/cancel         // Cancel job
GET    /jobs/:id/progress       // SSE progress stream

// Search
POST   /search                  // Semantic search
GET    /search/history          // Search history
GET    /search/quota            // Quota status

// Folders
GET    /folders                 // List folders
POST   /folders                 // Create folder
PUT    /folders/:id             // Rename folder
DELETE /folders/:id             // Delete folder

// Analytics
GET    /analytics/dashboard     // Dashboard stats
GET    /analytics/usage         // Usage over time

// Storage
POST   /storage/presign         // Get upload URL
GET    /storage/quota           // Storage quota
```

### 4.2 Search Service (Python)

**Responsibilities:**
- Query embedding generation
- Vector similarity search
- Result ranking and filtering
- Search analytics

**Directory Structure:**
```
/search-service
├── src/
│   ├── main.py                  # FastAPI entry point
│   ├── config.py                # Configuration
│   ├── routers/
│   │   ├── search.py            # Search endpoints
│   │   └── health.py            # Health checks
│   ├── services/
│   │   ├── embedding.py         # Query embedding
│   │   ├── search.py            # Vector search
│   │   └── ranking.py           # Result ranking
│   ├── repositories/
│   │   ├── vector_db.py         # Vector DB adapter
│   │   └── postgres.py          # Metadata queries
│   ├── models/
│   │   ├── requests.py          # Pydantic request models
│   │   └── responses.py         # Pydantic response models
│   └── utils/
│       ├── logger.py            # Logging setup
│       └── metrics.py           # Prometheus metrics
├── tests/
├── Dockerfile
├── requirements.txt
└── pyproject.toml
```

**Key Endpoints:**

```python
# Search
POST /api/v1/search              # Main search endpoint
POST /api/v1/search/batch        # Batch search
GET  /api/v1/search/suggest      # Query suggestions

# Health
GET  /health                     # Health check
GET  /health/ready               # Readiness check
GET  /metrics                    # Prometheus metrics
```

### 4.3 Worker Services

See [Section 8: Worker Architecture](#8-worker-architecture) for detailed worker specifications.

---

## 5. Database Design

### 5.1 Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │       │   videos    │       │   frames    │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ user_id (PK)│──┐    │ video_id(PK)│──┐    │ frame_id(PK)│
│ email       │  │    │ user_id(FK) │◄─┘    │ video_id(FK)│◄──┘
│ name        │  │    │ title       │       │ timestamp   │
│ plan_type   │  └───►│ file_path   │       │ frame_path  │
│ storage_*   │       │ status      │       │ gcs_path    │
│ created_at  │       │ source_type │       │ created_at  │
└─────────────┘       │ duration    │       └─────────────┘
      │               │ folder_id   │
      │               └─────────────┘
      │                     │
      │                     ▼
      │               ┌─────────────┐       ┌─────────────┐
      │               │    jobs     │       │search_history│
      │               ├─────────────┤       ├─────────────┤
      │               │ job_id (PK) │       │ search_id(PK)│
      │               │ user_id(FK) │◄──────│ user_id(FK) │◄───┐
      │               │ video_id(FK)│       │ query       │    │
      │               │ status      │       │ results_cnt │    │
      │               │ progress    │       │ created_at  │    │
      │               │ error_msg   │       └─────────────┘    │
      │               └─────────────┘                          │
      │                                                        │
      └────────────────────────────────────────────────────────┘
```

### 5.2 Core Tables

#### users
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),

    -- Plan & Limits
    plan_type VARCHAR(20) DEFAULT 'free'
        CHECK (plan_type IN ('free', 'pro', 'enterprise')),
    storage_used_bytes BIGINT DEFAULT 0,
    storage_limit_bytes BIGINT DEFAULT 5368709120, -- 5GB
    daily_search_limit INT DEFAULT 50,
    daily_search_count INT DEFAULT 0,
    search_count_reset_at TIMESTAMP WITH TIME ZONE,

    -- Preferences
    auto_process_uploads BOOLEAN DEFAULT false,
    default_frame_interval DECIMAL(5,2) DEFAULT 2.0,
    notifications_enabled BOOLEAN DEFAULT true,

    -- OAuth
    google_id VARCHAR(255),
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_token_expires_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,

    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
```

#### videos
```sql
CREATE TABLE videos (
    video_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Basic Info
    title VARCHAR(500) NOT NULL,
    description TEXT,
    original_filename VARCHAR(500) NOT NULL,

    -- Storage
    file_path VARCHAR(1000) NOT NULL,
    gcs_bucket VARCHAR(255),
    gcs_path VARCHAR(1000),
    file_size_bytes BIGINT NOT NULL,

    -- Video Metadata
    duration_seconds DECIMAL(12,3),
    fps DECIMAL(8,4),
    width INT,
    height INT,
    codec VARCHAR(50),

    -- Processing
    status VARCHAR(20) DEFAULT 'uploaded'
        CHECK (status IN ('uploading', 'uploaded', 'queued', 'processing', 'ready', 'error')),
    processing_progress INT DEFAULT 0 CHECK (processing_progress BETWEEN 0 AND 100),
    frame_count INT,
    error_message TEXT,

    -- Organization
    folder_id UUID REFERENCES folders(folder_id) ON DELETE SET NULL,
    tags VARCHAR(100)[],

    -- Source
    source_type VARCHAR(20) DEFAULT 'local'
        CHECK (source_type IN ('local', 'google_drive', 'dropbox', 'url')),
    source_id VARCHAR(500),         -- External source ID
    source_url TEXT,                -- Original source URL
    source_metadata JSONB,          -- Provider-specific metadata

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,

    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_videos_user_id ON videos(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_videos_status ON videos(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_videos_folder ON videos(user_id, folder_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_videos_source ON videos(source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX idx_videos_created ON videos(user_id, created_at DESC) WHERE deleted_at IS NULL;
```

#### frames
```sql
CREATE TABLE frames (
    frame_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    -- Frame Info
    frame_index INT NOT NULL,
    timestamp_seconds DECIMAL(12,3) NOT NULL,

    -- Storage
    frame_path VARCHAR(1000) NOT NULL,
    gcs_path VARCHAR(1000),
    thumbnail_path VARCHAR(1000),

    -- Metadata
    width INT,
    height INT,
    file_size_bytes INT,

    -- Embedding
    embedding_id VARCHAR(255),      -- ID in vector DB
    embedding_generated_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(video_id, frame_index)
);

CREATE INDEX idx_frames_video ON frames(video_id);
CREATE INDEX idx_frames_user ON frames(user_id);
CREATE INDEX idx_frames_timestamp ON frames(video_id, timestamp_seconds);
```

#### jobs
```sql
CREATE TABLE jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,

    -- Job Config
    job_type VARCHAR(50) NOT NULL
        CHECK (job_type IN ('video_processing', 'reprocessing', 'embedding_only')),
    frame_interval_seconds DECIMAL(5,2) DEFAULT 2.0,
    priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),

    -- Status
    status VARCHAR(20) DEFAULT 'queued'
        CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
    progress INT DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    current_step VARCHAR(50),

    -- Metrics
    total_frames INT,
    processed_frames INT DEFAULT 0,

    -- Error Handling
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,

    -- Worker Info
    worker_id VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Queue metadata
    queue_name VARCHAR(100),
    queue_job_id VARCHAR(255)
);

CREATE INDEX idx_jobs_user ON jobs(user_id);
CREATE INDEX idx_jobs_video ON jobs(video_id);
CREATE INDEX idx_jobs_status ON jobs(status) WHERE status IN ('queued', 'processing');
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);
```

#### folders
```sql
CREATE TABLE folders (
    folder_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    parent_folder_id UUID REFERENCES folders(folder_id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    path VARCHAR(1000) NOT NULL,    -- Materialized path for fast queries

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(user_id, path)
);

CREATE INDEX idx_folders_user ON folders(user_id);
CREATE INDEX idx_folders_parent ON folders(parent_folder_id);
CREATE INDEX idx_folders_path ON folders(user_id, path);
```

#### search_history
```sql
CREATE TABLE search_history (
    search_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

    query TEXT NOT NULL,
    query_embedding_id VARCHAR(255),    -- Cached query embedding

    -- Filters Applied
    video_ids UUID[],
    source_filter VARCHAR(20),
    min_score DECIMAL(5,4),

    -- Results
    results_count INT DEFAULT 0,
    top_result_score DECIMAL(5,4),

    -- Performance
    search_time_ms INT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_search_history_user ON search_history(user_id);
CREATE INDEX idx_search_history_created ON search_history(user_id, created_at DESC);
```

#### user_analytics
```sql
CREATE TABLE user_analytics (
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Counts
    videos_uploaded INT DEFAULT 0,
    videos_processed INT DEFAULT 0,
    searches_performed INT DEFAULT 0,
    storage_delta_bytes BIGINT DEFAULT 0,

    -- Aggregates
    total_processing_time_seconds INT DEFAULT 0,
    total_frames_generated INT DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    PRIMARY KEY (user_id, date)
);
```

### 5.3 Database Functions

```sql
-- Check and increment search quota
CREATE OR REPLACE FUNCTION check_and_increment_search_quota(p_user_id UUID)
RETURNS TABLE (
    allowed BOOLEAN,
    current_count INT,
    daily_limit INT,
    remaining INT
) AS $$
DECLARE
    v_user RECORD;
    v_today DATE := CURRENT_DATE;
BEGIN
    SELECT * INTO v_user FROM users WHERE user_id = p_user_id FOR UPDATE;

    -- Reset counter if new day
    IF v_user.search_count_reset_at IS NULL
       OR v_user.search_count_reset_at::date < v_today THEN
        UPDATE users
        SET daily_search_count = 0,
            search_count_reset_at = NOW()
        WHERE user_id = p_user_id;
        v_user.daily_search_count := 0;
    END IF;

    -- Check limit
    IF v_user.daily_search_count >= v_user.daily_search_limit THEN
        RETURN QUERY SELECT
            FALSE,
            v_user.daily_search_count,
            v_user.daily_search_limit,
            0;
        RETURN;
    END IF;

    -- Increment and return
    UPDATE users
    SET daily_search_count = daily_search_count + 1
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT
        TRUE,
        v_user.daily_search_count + 1,
        v_user.daily_search_limit,
        v_user.daily_search_limit - v_user.daily_search_count - 1;
END;
$$ LANGUAGE plpgsql;

-- Update storage usage
CREATE OR REPLACE FUNCTION update_storage_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users
        SET storage_used_bytes = storage_used_bytes + NEW.file_size_bytes
        WHERE user_id = NEW.user_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users
        SET storage_used_bytes = storage_used_bytes - OLD.file_size_bytes
        WHERE user_id = OLD.user_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_video_storage
AFTER INSERT OR DELETE ON videos
FOR EACH ROW EXECUTE FUNCTION update_storage_usage();
```

### 5.4 Migrations Strategy

All schema changes managed via versioned migration files:

```
/migrations
├── 001_initial_schema.sql
├── 002_add_folders.sql
├── 003_add_search_history.sql
├── 004_add_analytics.sql
├── 005_add_oauth_fields.sql
├── 006_add_source_metadata.sql
└── ...
```

Migration runner: [node-pg-migrate](https://github.com/salsita/node-pg-migrate) or [Prisma Migrate](https://www.prisma.io/migrate)

---

## 6. Vector Database Architecture

### 6.1 Qdrant Configuration

**Collection Schema:**
```json
{
  "name": "user_{user_id}",
  "vectors": {
    "size": 1408,
    "distance": "Cosine"
  },
  "hnsw_config": {
    "m": 16,
    "ef_construct": 200,
    "full_scan_threshold": 10000
  },
  "optimizers_config": {
    "memmap_threshold": 50000,
    "indexing_threshold": 20000
  },
  "on_disk_payload": true
}
```

**Point Structure:**
```json
{
  "id": "frame_{frame_id}",
  "vector": [/* 1408 floats */],
  "payload": {
    "frame_id": "uuid",
    "video_id": "uuid",
    "user_id": "uuid",
    "timestamp_seconds": 123.45,
    "frame_path": "path/to/frame.jpg",
    "gcs_path": "gs://bucket/path",
    "video_title": "My Video",
    "source_type": "local"
  }
}
```

### 6.2 Vector DB Adapter Interface

```python
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class SearchResult:
    frame_id: str
    video_id: str
    timestamp: float
    score: float
    payload: Dict[str, Any]

@dataclass
class EmbeddingPoint:
    id: str
    vector: List[float]
    payload: Dict[str, Any]

class VectorDBAdapter(ABC):
    """Abstract base class for vector database adapters."""

    @abstractmethod
    async def create_collection(self, user_id: str) -> bool:
        """Create a new collection for user."""
        pass

    @abstractmethod
    async def delete_collection(self, user_id: str) -> bool:
        """Delete user's collection."""
        pass

    @abstractmethod
    async def upsert_embeddings(
        self,
        user_id: str,
        points: List[EmbeddingPoint]
    ) -> int:
        """Insert or update embeddings."""
        pass

    @abstractmethod
    async def delete_embeddings(
        self,
        user_id: str,
        ids: List[str]
    ) -> int:
        """Delete embeddings by ID."""
        pass

    @abstractmethod
    async def search(
        self,
        user_id: str,
        query_vector: List[float],
        top_k: int = 20,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[SearchResult]:
        """Search for similar embeddings."""
        pass

    @abstractmethod
    async def get_collection_info(self, user_id: str) -> Dict[str, Any]:
        """Get collection statistics."""
        pass
```

### 6.3 Embedding Generation

**Cloud (Vertex AI):**
```python
from google.cloud import aiplatform
from vertexai.vision_models import MultiModalEmbeddingModel

class CloudEmbeddingGenerator:
    def __init__(self, project_id: str, location: str = "us-central1"):
        aiplatform.init(project=project_id, location=location)
        self.model = MultiModalEmbeddingModel.from_pretrained(
            "multimodalembedding@001"
        )

    async def generate_image_embedding(
        self,
        image_path: str
    ) -> List[float]:
        """Generate embedding for a single image."""
        from vertexai.vision_models import Image

        image = Image.load_from_file(image_path)
        embeddings = self.model.get_embeddings(
            image=image,
            dimension=1408
        )
        return embeddings.image_embedding

    async def generate_text_embedding(
        self,
        text: str
    ) -> List[float]:
        """Generate embedding for search query."""
        embeddings = self.model.get_embeddings(
            contextual_text=text,
            dimension=1408
        )
        return embeddings.text_embedding
```

**Local (ONNX Runtime) for Offline:**
```python
import onnxruntime as ort
import numpy as np
from PIL import Image

class LocalEmbeddingGenerator:
    def __init__(self, model_path: str):
        self.session = ort.InferenceSession(
            model_path,
            providers=['CoreMLExecutionProvider', 'CPUExecutionProvider']
        )

    def preprocess_image(self, image_path: str) -> np.ndarray:
        img = Image.open(image_path).convert('RGB')
        img = img.resize((224, 224))
        arr = np.array(img).astype(np.float32) / 255.0
        arr = (arr - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        return arr.transpose(2, 0, 1)[np.newaxis, ...]

    def generate_embedding(self, image_path: str) -> List[float]:
        input_data = self.preprocess_image(image_path)
        outputs = self.session.run(None, {'input': input_data})
        return outputs[0][0].tolist()
```

---

## 7. API Specification

### 7.1 API Versioning

All APIs versioned via URL path: `/api/v1/...`

### 7.2 Authentication

**JWT Token Structure:**
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "name": "User Name",
  "plan": "free",
  "iat": 1706700000,
  "exp": 1706786400
}
```

**Headers:**
```
Authorization: Bearer <jwt_token>
X-Request-ID: <uuid>          # For request tracing
X-Client-Version: 2.0.0       # Client version
X-Platform: ios|android|macos|windows|linux
```

### 7.3 Standard Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-01-31T12:00:00Z"
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": { ... }
  },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-01-31T12:00:00Z"
  }
}
```

### 7.4 Core API Endpoints

#### Authentication

```yaml
POST /api/v1/auth/register:
  request:
    email: string (required)
    password: string (required, min 8 chars)
    name: string (required)
  response:
    user:
      user_id: uuid
      email: string
      name: string
    tokens:
      access_token: string
      refresh_token: string
      expires_in: number

POST /api/v1/auth/login:
  request:
    email: string
    password: string
  response:
    user: User
    tokens: Tokens

POST /api/v1/auth/oauth/google:
  request:
    code: string       # OAuth authorization code
    redirect_uri: string
  response:
    user: User
    tokens: Tokens
    is_new_user: boolean

POST /api/v1/auth/refresh:
  request:
    refresh_token: string
  response:
    tokens: Tokens

POST /api/v1/auth/logout:
  request:
    refresh_token: string
  response:
    success: boolean
```

#### Videos

```yaml
GET /api/v1/videos:
  query_params:
    folder_id: uuid (optional)
    status: string (optional)
    source_type: string (optional)
    page: number (default: 1)
    limit: number (default: 20, max: 100)
    sort: created_at|title|duration (default: created_at)
    order: asc|desc (default: desc)
  response:
    videos: Video[]
    pagination:
      page: number
      limit: number
      total: number
      total_pages: number

POST /api/v1/videos:
  content_type: multipart/form-data
  request:
    file: binary (required)
    title: string (optional, defaults to filename)
    folder_id: uuid (optional)
    auto_process: boolean (default: false)
    frame_interval: number (default: 2.0)
  response:
    video:
      video_id: uuid
      title: string
      status: "uploaded"
      file_size_bytes: number
      metadata:
        duration_seconds: number
        fps: number
        width: number
        height: number
    job: Job (if auto_process=true)

GET /api/v1/videos/{video_id}:
  response:
    video: Video
    frames_count: number
    job: Job (if processing)

DELETE /api/v1/videos/{video_id}:
  response:
    success: boolean

POST /api/v1/videos/{video_id}/process:
  request:
    frame_interval: number (default: 2.0)
    priority: number (1-10, default: 5)
  response:
    job: Job

GET /api/v1/videos/{video_id}/frames:
  query_params:
    page: number
    limit: number
  response:
    frames: Frame[]
    pagination: Pagination
```

#### Search

```yaml
POST /api/v1/search:
  request:
    query: string (required)
    top_k: number (default: 20, max: 50)
    video_ids: uuid[] (optional, filter to specific videos)
    source_filter: "all"|"local"|"google_drive" (default: "all")
    min_score: number (0-1, default: 0.05)
  response:
    query: string
    results:
      - frame_id: uuid
        video_id: uuid
        video_title: string
        timestamp_seconds: number
        formatted_timestamp: string
        score: number
        frame_url: string
        thumbnail_url: string
        source_type: string
    count: number
    search_time_ms: number
    quota:
      used: number
      limit: number
      remaining: number

GET /api/v1/search/history:
  query_params:
    limit: number (default: 20)
  response:
    history:
      - search_id: uuid
        query: string
        results_count: number
        created_at: timestamp

GET /api/v1/search/quota:
  response:
    used: number
    limit: number
    remaining: number
    resets_at: timestamp
```

#### Jobs

```yaml
GET /api/v1/jobs:
  query_params:
    status: string (optional)
    video_id: uuid (optional)
    page: number
    limit: number
  response:
    jobs: Job[]
    pagination: Pagination

GET /api/v1/jobs/{job_id}:
  response:
    job:
      job_id: uuid
      video_id: uuid
      video_title: string
      status: string
      progress: number
      current_step: string
      total_frames: number
      processed_frames: number
      error_message: string (if failed)
      created_at: timestamp
      started_at: timestamp
      completed_at: timestamp

GET /api/v1/jobs/{job_id}/progress:
  # Server-Sent Events stream
  event: progress
  data:
    progress: number
    current_step: string
    processed_frames: number

POST /api/v1/jobs/{job_id}/cancel:
  response:
    success: boolean
    job: Job
```

#### Storage

```yaml
POST /api/v1/storage/presign:
  request:
    filename: string
    content_type: string
    size_bytes: number
  response:
    upload_url: string
    video_id: uuid
    expires_at: timestamp

GET /api/v1/storage/quota:
  response:
    used_bytes: number
    limit_bytes: number
    used_percentage: number
```

### 7.5 WebSocket Events

**Connection:**
```
wss://api.example.com/ws?token=<jwt>
```

**Events:**
```typescript
// Server -> Client
interface JobProgressEvent {
  type: 'job.progress';
  job_id: string;
  progress: number;
  current_step: string;
}

interface JobCompletedEvent {
  type: 'job.completed';
  job_id: string;
  video_id: string;
  frames_count: number;
}

interface JobFailedEvent {
  type: 'job.failed';
  job_id: string;
  error_message: string;
}

// Client -> Server
interface SubscribeEvent {
  type: 'subscribe';
  channels: string[];  // ['job.{job_id}', 'user.{user_id}']
}

interface UnsubscribeEvent {
  type: 'unsubscribe';
  channels: string[];
}
```

---

## 8. Worker Architecture

### 8.1 Job Queue Design

**Technology:** Redis + BullMQ

**Queue Structure:**
```
Queues:
├── video-processing (main processing queue)
│   ├── Priority levels: 1-10
│   ├── Concurrency: 3 per worker
│   └── Retry: 3 attempts, exponential backoff
│
├── frame-extraction (sub-queue)
│   ├── Concurrency: 8 per worker
│   └── Timeout: 5 minutes per video
│
├── embedding-generation (sub-queue)
│   ├── Concurrency: 8 per worker
│   ├── Batch size: 10 frames
│   └── Rate limit: 60 requests/minute (Vertex AI)
│
└── cleanup (maintenance queue)
    ├── Schedule: Every hour
    └── Tasks: temp files, old jobs, orphaned data
```

### 8.2 Worker Implementation

**Frame Extraction Worker:**

```python
# workers/frame_extractor.py

import asyncio
import cv2
import os
from pathlib import Path
from dataclasses import dataclass
from typing import List
import aiofiles
from google.cloud import storage

@dataclass
class ExtractedFrame:
    frame_index: int
    timestamp_seconds: float
    local_path: str
    gcs_path: str | None = None

class FrameExtractor:
    def __init__(
        self,
        temp_dir: str,
        gcs_bucket: str | None = None,
        gcs_client: storage.Client | None = None
    ):
        self.temp_dir = Path(temp_dir)
        self.gcs_bucket = gcs_bucket
        self.gcs_client = gcs_client
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    async def extract_frames(
        self,
        video_path: str,
        video_id: str,
        interval_seconds: float = 2.0,
        progress_callback = None
    ) -> List[ExtractedFrame]:
        """Extract frames from video at specified interval."""

        frames_dir = self.temp_dir / video_id
        frames_dir.mkdir(exist_ok=True)

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise ValueError(f"Cannot open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0

        frame_interval = int(fps * interval_seconds)
        extracted: List[ExtractedFrame] = []

        frame_index = 0
        extract_index = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_index % frame_interval == 0:
                timestamp = frame_index / fps
                frame_path = frames_dir / f"frame_{extract_index:06d}.jpg"

                # Save frame
                cv2.imwrite(str(frame_path), frame, [
                    cv2.IMWRITE_JPEG_QUALITY, 85
                ])

                # Upload to GCS if configured
                gcs_path = None
                if self.gcs_bucket:
                    gcs_path = await self._upload_to_gcs(
                        frame_path,
                        video_id,
                        extract_index
                    )

                extracted.append(ExtractedFrame(
                    frame_index=extract_index,
                    timestamp_seconds=timestamp,
                    local_path=str(frame_path),
                    gcs_path=gcs_path
                ))

                if progress_callback:
                    progress = (frame_index / total_frames) * 100
                    await progress_callback(progress, "extracting_frames")

                extract_index += 1

            frame_index += 1

        cap.release()
        return extracted

    async def _upload_to_gcs(
        self,
        local_path: Path,
        video_id: str,
        frame_index: int
    ) -> str:
        """Upload frame to Google Cloud Storage."""
        bucket = self.gcs_client.bucket(self.gcs_bucket)
        blob_path = f"frames/{video_id}/frame_{frame_index:06d}.jpg"
        blob = bucket.blob(blob_path)

        blob.upload_from_filename(str(local_path))

        return f"gs://{self.gcs_bucket}/{blob_path}"

    def cleanup(self, video_id: str):
        """Remove temporary frames directory."""
        frames_dir = self.temp_dir / video_id
        if frames_dir.exists():
            import shutil
            shutil.rmtree(frames_dir)
```

**Embedding Generation Worker:**

```python
# workers/embedding_generator.py

import asyncio
from typing import List, Dict, Any
from dataclasses import dataclass
import numpy as np
from google.cloud import aiplatform
from vertexai.vision_models import MultiModalEmbeddingModel, Image

@dataclass
class FrameEmbedding:
    frame_id: str
    video_id: str
    timestamp_seconds: float
    frame_path: str
    embedding: List[float]

class EmbeddingGenerator:
    def __init__(
        self,
        project_id: str,
        location: str = "us-central1",
        batch_size: int = 10,
        rate_limit_per_minute: int = 60
    ):
        aiplatform.init(project=project_id, location=location)
        self.model = MultiModalEmbeddingModel.from_pretrained(
            "multimodalembedding@001"
        )
        self.batch_size = batch_size
        self.rate_limit = rate_limit_per_minute
        self._request_times: List[float] = []

    async def generate_embeddings(
        self,
        frames: List[Dict[str, Any]],
        progress_callback = None
    ) -> List[FrameEmbedding]:
        """Generate embeddings for a batch of frames."""

        embeddings: List[FrameEmbedding] = []
        total = len(frames)

        for i in range(0, total, self.batch_size):
            batch = frames[i:i + self.batch_size]

            # Rate limiting
            await self._wait_for_rate_limit()

            batch_embeddings = await self._process_batch(batch)
            embeddings.extend(batch_embeddings)

            if progress_callback:
                progress = ((i + len(batch)) / total) * 100
                await progress_callback(progress, "generating_embeddings")

        return embeddings

    async def _process_batch(
        self,
        batch: List[Dict[str, Any]]
    ) -> List[FrameEmbedding]:
        """Process a batch of frames."""
        results = []

        for frame in batch:
            try:
                image = Image.load_from_file(frame['local_path'])
                response = self.model.get_embeddings(
                    image=image,
                    dimension=1408
                )

                # Normalize embedding
                embedding = np.array(response.image_embedding)
                embedding = embedding / np.linalg.norm(embedding)

                results.append(FrameEmbedding(
                    frame_id=frame['frame_id'],
                    video_id=frame['video_id'],
                    timestamp_seconds=frame['timestamp_seconds'],
                    frame_path=frame.get('gcs_path') or frame['local_path'],
                    embedding=embedding.tolist()
                ))
            except Exception as e:
                # Log error but continue with other frames
                print(f"Error processing frame {frame['frame_id']}: {e}")

        return results

    async def _wait_for_rate_limit(self):
        """Enforce rate limiting."""
        import time
        now = time.time()

        # Remove requests older than 1 minute
        self._request_times = [
            t for t in self._request_times
            if now - t < 60
        ]

        if len(self._request_times) >= self.rate_limit:
            wait_time = 60 - (now - self._request_times[0])
            if wait_time > 0:
                await asyncio.sleep(wait_time)

        self._request_times.append(time.time())
```

**Main Processing Worker:**

```python
# workers/video_processor.py

import asyncio
from typing import Optional
from dataclasses import dataclass
import uuid
from datetime import datetime

from .frame_extractor import FrameExtractor
from .embedding_generator import EmbeddingGenerator
from repositories.video_repository import VideoRepository
from repositories.job_repository import JobRepository
from repositories.vector_db import VectorDBAdapter

@dataclass
class ProcessingConfig:
    frame_interval_seconds: float = 2.0
    temp_dir: str = "/tmp/video_processing"
    gcs_bucket: Optional[str] = None

class VideoProcessor:
    def __init__(
        self,
        video_repo: VideoRepository,
        job_repo: JobRepository,
        vector_db: VectorDBAdapter,
        frame_extractor: FrameExtractor,
        embedding_generator: EmbeddingGenerator
    ):
        self.video_repo = video_repo
        self.job_repo = job_repo
        self.vector_db = vector_db
        self.frame_extractor = frame_extractor
        self.embedding_generator = embedding_generator

    async def process_video(
        self,
        job_id: str,
        video_id: str,
        user_id: str,
        config: ProcessingConfig
    ):
        """Main video processing pipeline."""

        try:
            # Update job status
            await self.job_repo.update_status(
                job_id,
                status="processing",
                started_at=datetime.utcnow()
            )

            # Get video info
            video = await self.video_repo.get_by_id(video_id)
            if not video:
                raise ValueError(f"Video not found: {video_id}")

            # Step 1: Extract frames
            frames = await self.frame_extractor.extract_frames(
                video_path=video.file_path,
                video_id=video_id,
                interval_seconds=config.frame_interval_seconds,
                progress_callback=lambda p, s: self._update_progress(job_id, p * 0.4, s)
            )

            await self.job_repo.update_progress(
                job_id,
                progress=40,
                current_step="frames_extracted",
                total_frames=len(frames)
            )

            # Step 2: Save frame records to database
            frame_records = []
            for i, frame in enumerate(frames):
                frame_id = str(uuid.uuid4())
                frame_records.append({
                    'frame_id': frame_id,
                    'video_id': video_id,
                    'user_id': user_id,
                    'frame_index': frame.frame_index,
                    'timestamp_seconds': frame.timestamp_seconds,
                    'local_path': frame.local_path,
                    'gcs_path': frame.gcs_path
                })

            await self.video_repo.save_frames(frame_records)

            # Step 3: Generate embeddings
            embeddings = await self.embedding_generator.generate_embeddings(
                frames=frame_records,
                progress_callback=lambda p, s: self._update_progress(
                    job_id, 40 + (p * 0.5), s
                )
            )

            await self.job_repo.update_progress(
                job_id,
                progress=90,
                current_step="storing_embeddings"
            )

            # Step 4: Store embeddings in vector DB
            points = [
                {
                    'id': f"frame_{e.frame_id}",
                    'vector': e.embedding,
                    'payload': {
                        'frame_id': e.frame_id,
                        'video_id': e.video_id,
                        'user_id': user_id,
                        'timestamp_seconds': e.timestamp_seconds,
                        'frame_path': e.frame_path,
                        'video_title': video.title
                    }
                }
                for e in embeddings
            ]

            await self.vector_db.upsert_embeddings(user_id, points)

            # Step 5: Update video status
            await self.video_repo.update_status(
                video_id,
                status="ready",
                frame_count=len(frames)
            )

            # Complete job
            await self.job_repo.update_status(
                job_id,
                status="completed",
                progress=100,
                current_step="complete",
                completed_at=datetime.utcnow()
            )

            # Cleanup temp files
            self.frame_extractor.cleanup(video_id)

        except Exception as e:
            await self.job_repo.update_status(
                job_id,
                status="failed",
                error_message=str(e)
            )
            await self.video_repo.update_status(
                video_id,
                status="error",
                error_message=str(e)
            )
            raise

    async def _update_progress(
        self,
        job_id: str,
        progress: float,
        step: str
    ):
        """Update job progress."""
        await self.job_repo.update_progress(
            job_id,
            progress=int(progress),
            current_step=step
        )
```

### 8.3 BullMQ Queue Configuration

```typescript
// queues/video-processing.queue.ts

import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';

const connection = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

// Queue definition
export const videoProcessingQueue = new Queue('video-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  },
});

// Job data interface
interface VideoProcessingJobData {
  jobId: string;
  videoId: string;
  userId: string;
  videoPath: string;
  frameInterval: number;
  priority: number;
}

// Add job to queue
export async function queueVideoProcessing(
  data: VideoProcessingJobData
): Promise<Job> {
  return videoProcessingQueue.add(
    'process-video',
    data,
    {
      priority: data.priority,
      jobId: data.jobId,
    }
  );
}

// Worker definition (runs in separate process)
export function createVideoProcessingWorker() {
  const worker = new Worker(
    'video-processing',
    async (job: Job<VideoProcessingJobData>) => {
      const { jobId, videoId, userId, videoPath, frameInterval } = job.data;

      // Call Python processing service
      const response = await fetch(
        `${process.env.PROCESSOR_SERVICE_URL}/api/process`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            video_id: videoId,
            user_id: userId,
            video_path: videoPath,
            frame_interval_seconds: frameInterval,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }

      return response.json();
    },
    {
      connection,
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute max
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  return worker;
}
```

### 8.4 Job State Machine

```
         ┌─────────┐
         │ queued  │
         └────┬────┘
              │ worker picks up
              ▼
         ┌─────────────┐
    ┌────│ processing  │────┐
    │    └──────┬──────┘    │
    │           │           │
    │ cancel    │ complete  │ error (retry < max)
    ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│cancelled│ │completed│ │ queued  │ (retry)
└─────────┘ └─────────┘ └────┬────┘
                             │ error (retry >= max)
                             ▼
                        ┌─────────┐
                        │ failed  │
                        └─────────┘
```

---

## 9. Authentication & Security

### 9.1 Authentication Flow

**Email/Password:**
```
1. User submits email + password
2. Server validates credentials
3. Server generates JWT access token (15 min) + refresh token (7 days)
4. Client stores tokens securely (Keychain/Keystore)
5. Client sends access token with each request
6. On 401, client uses refresh token to get new access token
```

**OAuth (Google):**
```
1. Client initiates OAuth flow
2. User authenticates with Google
3. Google redirects with authorization code
4. Server exchanges code for Google tokens
5. Server creates/updates user record
6. Server generates app JWT tokens
7. Client stores tokens securely
```

### 9.2 Token Management

```typescript
// Token configuration
const TOKEN_CONFIG = {
  accessToken: {
    expiresIn: '15m',
    algorithm: 'RS256',
  },
  refreshToken: {
    expiresIn: '7d',
    algorithm: 'RS256',
  },
};

// Token payload
interface TokenPayload {
  sub: string;        // user_id
  email: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  type: 'access' | 'refresh';
}
```

### 9.3 Security Measures

| Measure | Implementation |
|---------|----------------|
| Password Hashing | bcrypt with cost factor 12 |
| Token Signing | RS256 (RSA + SHA-256) |
| Token Storage | iOS Keychain, Android Keystore |
| API Transport | TLS 1.3 required |
| Rate Limiting | 100 req/min per user, 1000 req/min per IP |
| Input Validation | Zod schemas on all endpoints |
| SQL Injection | Parameterized queries only |
| XSS Prevention | Content-Security-Policy headers |
| CORS | Whitelist of allowed origins |

### 9.4 API Key Authentication (for Integrations)

```typescript
// API key format: prefix_base64(random_32_bytes)
// Example: sk_live_a1b2c3d4e5f6...

interface APIKey {
  key_id: string;
  user_id: string;
  prefix: string;        // First 8 chars for identification
  hash: string;          // bcrypt hash of full key
  name: string;          // User-provided name
  scopes: string[];      // ['read:videos', 'write:videos', 'search']
  last_used_at: Date;
  expires_at: Date | null;
  created_at: Date;
}
```

---

## 10. File Storage Strategy

### 10.1 Storage Tiers

| Tier | Use Case | Technology | Retention |
|------|----------|------------|-----------|
| Hot | Active videos, recent frames | GCS Standard | Indefinite |
| Warm | Older frames, thumbnails | GCS Nearline | 90 days inactive |
| Cold | Archived videos | GCS Coldline | 1 year inactive |
| Local | Processing temp files | Local SSD | 24 hours |

### 10.2 File Organization

```
GCS Bucket Structure:
/users/{user_id}/
├── videos/
│   └── {video_id}/
│       ├── original.mp4          # Original upload
│       └── metadata.json         # Video metadata
├── frames/
│   └── {video_id}/
│       ├── frame_000001.jpg
│       ├── frame_000002.jpg
│       └── ...
└── thumbnails/
    └── {video_id}/
        ├── poster.jpg            # Video poster
        └── thumb_{timestamp}.jpg # Frame thumbnails
```

### 10.3 Upload Flow

```typescript
// 1. Client requests presigned URL
const { uploadUrl, videoId } = await api.post('/storage/presign', {
  filename: 'my-video.mp4',
  contentType: 'video/mp4',
  sizeBytes: 104857600, // 100MB
});

// 2. Client uploads directly to GCS
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'video/mp4' },
  body: videoFile,
});

// 3. Client notifies server of completion
await api.post(`/videos/${videoId}/upload-complete`);

// 4. Server validates upload and extracts metadata
```

### 10.4 Storage Quotas

| Plan | Storage Limit | Max File Size |
|------|---------------|---------------|
| Free | 5 GB | 500 MB |
| Pro | 100 GB | 2 GB |
| Enterprise | Unlimited | 10 GB |

---

## 11. Multi-Tenancy Implementation

### 11.1 Isolation Strategy

**Database Level:**
- All tables have `user_id` column
- All queries filtered by `user_id` from JWT
- Row-level security policies (optional, PostgreSQL)

**Vector Database Level:**
- Separate collection per user: `user_{user_id}`
- Collections created on first video upload
- Collections deleted on account deletion

**Storage Level:**
- User-specific paths: `/users/{user_id}/...`
- Presigned URLs scoped to user's path
- No cross-user access possible

### 11.2 Query Pattern

```typescript
// All repository methods require userId
class VideoRepository {
  async getById(userId: string, videoId: string): Promise<Video | null> {
    const result = await this.db.query(
      `SELECT * FROM videos
       WHERE video_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [videoId, userId]
    );
    return result.rows[0] || null;
  }

  async list(userId: string, options: ListOptions): Promise<Video[]> {
    const result = await this.db.query(
      `SELECT * FROM videos
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, options.limit, options.offset]
    );
    return result.rows;
  }
}
```

### 11.3 Cross-Tenant Prevention

```typescript
// Middleware to inject userId into all requests
function injectUserId(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);

  // Attach userId to request - used by all downstream code
  req.userId = decoded.sub;

  // Prevent any query param/body from overriding userId
  delete req.query.userId;
  delete req.query.user_id;
  if (req.body) {
    delete req.body.userId;
    delete req.body.user_id;
  }

  next();
}
```

---

## 12. Mobile Architecture

### 12.1 React Native Project Structure

```
/mobile
├── src/
│   ├── App.tsx                    # Root component
│   ├── navigation/
│   │   ├── AppNavigator.tsx       # Main navigator
│   │   ├── AuthNavigator.tsx      # Auth flow
│   │   └── MainNavigator.tsx      # Main app tabs
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── RegisterScreen.tsx
│   │   │   └── ForgotPasswordScreen.tsx
│   │   ├── home/
│   │   │   ├── DashboardScreen.tsx
│   │   │   └── SearchScreen.tsx
│   │   ├── videos/
│   │   │   ├── VideosScreen.tsx
│   │   │   ├── VideoDetailScreen.tsx
│   │   │   └── UploadScreen.tsx
│   │   └── settings/
│   │       ├── SettingsScreen.tsx
│   │       └── ProfileScreen.tsx
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Card.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── video/
│   │   │   ├── VideoCard.tsx
│   │   │   ├── VideoPlayer.tsx
│   │   │   └── FrameGrid.tsx
│   │   ├── search/
│   │   │   ├── SearchBar.tsx
│   │   │   ├── SearchResult.tsx
│   │   │   └── ResultsList.tsx
│   │   └── upload/
│   │       ├── FilePicker.tsx
│   │       ├── UploadProgress.tsx
│   │       └── ProcessingStatus.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useVideos.ts
│   │   ├── useSearch.ts
│   │   ├── useUpload.ts
│   │   └── useOffline.ts
│   ├── services/
│   │   ├── api/
│   │   │   ├── client.ts          # Axios instance
│   │   │   ├── auth.api.ts
│   │   │   ├── videos.api.ts
│   │   │   └── search.api.ts
│   │   ├── storage/
│   │   │   ├── secureStorage.ts   # Keychain/Keystore
│   │   │   └── asyncStorage.ts    # General storage
│   │   ├── offline/
│   │   │   ├── database.ts        # SQLite setup
│   │   │   ├── syncManager.ts     # Sync logic
│   │   │   └── vectorSearch.ts    # Local search
│   │   └── notifications/
│   │       └── pushNotifications.ts
│   ├── store/
│   │   ├── index.ts               # Zustand store
│   │   ├── slices/
│   │   │   ├── authSlice.ts
│   │   │   ├── videosSlice.ts
│   │   │   └── searchSlice.ts
│   │   └── persist.ts             # Persistence config
│   ├── utils/
│   │   ├── formatting.ts
│   │   ├── validation.ts
│   │   └── permissions.ts
│   ├── constants/
│   │   ├── theme.ts
│   │   ├── config.ts
│   │   └── routes.ts
│   └── types/
│       ├── api.types.ts
│       ├── navigation.types.ts
│       └── domain.types.ts
├── ios/
├── android/
├── app.json
├── babel.config.js
├── metro.config.js
├── package.json
└── tsconfig.json
```

### 12.2 State Management (Zustand)

```typescript
// store/index.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;

  login: (tokens: Tokens, user: User) => void;
  logout: () => void;
  updateTokens: (tokens: Tokens) => void;
}

interface VideosState {
  videos: Video[];
  isLoading: boolean;
  error: string | null;

  fetchVideos: () => Promise<void>;
  addVideo: (video: Video) => void;
  updateVideo: (videoId: string, updates: Partial<Video>) => void;
  removeVideo: (videoId: string) => void;
}

interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
  history: string[];

  setQuery: (query: string) => void;
  search: () => Promise<void>;
  clearResults: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: (tokens, user) => set({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        isAuthenticated: true,
      }),

      logout: () => set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      }),

      updateTokens: (tokens) => set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        refreshToken: state.refreshToken,
      }),
    }
  )
);
```

### 12.3 Offline Database (SQLite)

```typescript
// services/offline/database.ts
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('video_search.db');

export async function initDatabase() {
  return new Promise<void>((resolve, reject) => {
    db.transaction(tx => {
      // Videos table
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS videos (
          video_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          file_path TEXT,
          local_path TEXT,
          status TEXT,
          duration_seconds REAL,
          created_at TEXT,
          synced_at TEXT,
          is_local_only INTEGER DEFAULT 0
        )
      `);

      // Frames table
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS frames (
          frame_id TEXT PRIMARY KEY,
          video_id TEXT NOT NULL,
          timestamp_seconds REAL,
          local_path TEXT,
          embedding BLOB,
          FOREIGN KEY (video_id) REFERENCES videos(video_id)
        )
      `);

      // Search history
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS search_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Sync queue
      tx.executeSql(`
        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          payload TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          attempts INTEGER DEFAULT 0
        )
      `);
    }, reject, resolve);
  });
}
```

### 12.4 Local Vector Search

```typescript
// services/offline/vectorSearch.ts
// Using HNSWLIB via native module

import { NativeModules } from 'react-native';

const { HNSWModule } = NativeModules;

export class LocalVectorSearch {
  private indexPath: string;
  private dimension: number = 1408;

  constructor(userId: string) {
    this.indexPath = `${FileSystem.documentDirectory}vectors/${userId}`;
  }

  async initialize(): Promise<void> {
    await HNSWModule.createIndex({
      path: this.indexPath,
      dimension: this.dimension,
      maxElements: 100000,
      m: 16,
      efConstruction: 200,
    });
  }

  async addEmbeddings(
    embeddings: Array<{ id: string; vector: number[] }>
  ): Promise<void> {
    for (const { id, vector } of embeddings) {
      await HNSWModule.addItem({
        path: this.indexPath,
        id,
        vector,
      });
    }
    await HNSWModule.saveIndex({ path: this.indexPath });
  }

  async search(
    queryVector: number[],
    topK: number = 20
  ): Promise<Array<{ id: string; score: number }>> {
    return HNSWModule.search({
      path: this.indexPath,
      vector: queryVector,
      k: topK,
      efSearch: 128,
    });
  }
}
```

---

## 13. Desktop Architecture

### 13.1 Tauri Project Structure

```
/desktop
├── src/                           # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── services/
│   ├── store/
│   └── styles/
├── src-tauri/                     # Rust backend
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   ├── commands/             # IPC commands
│   │   │   ├── mod.rs
│   │   │   ├── auth.rs
│   │   │   ├── videos.rs
│   │   │   ├── search.rs
│   │   │   └── storage.rs
│   │   ├── database/             # SQLite operations
│   │   │   ├── mod.rs
│   │   │   ├── migrations.rs
│   │   │   └── models.rs
│   │   ├── vector/               # DuckDB vector search
│   │   │   ├── mod.rs
│   │   │   └── search.rs
│   │   ├── processing/           # Local video processing
│   │   │   ├── mod.rs
│   │   │   ├── frames.rs
│   │   │   └── embeddings.rs
│   │   └── utils/
│   │       ├── mod.rs
│   │       └── crypto.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── build.rs
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### 13.2 Tauri Commands (IPC)

```rust
// src-tauri/src/commands/videos.rs

use tauri::State;
use crate::database::Database;
use crate::models::{Video, CreateVideoInput};

#[tauri::command]
pub async fn list_videos(
    db: State<'_, Database>,
    folder_id: Option<String>,
    page: u32,
    limit: u32,
) -> Result<Vec<Video>, String> {
    db.list_videos(folder_id, page, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_video(
    db: State<'_, Database>,
    video_id: String,
) -> Result<Video, String> {
    db.get_video(&video_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_video(
    db: State<'_, Database>,
    app_handle: tauri::AppHandle,
    file_path: String,
) -> Result<Video, String> {
    // Copy video to app data directory
    let data_dir = app_handle.path_resolver()
        .app_data_dir()
        .ok_or("Cannot get app data dir")?;

    let videos_dir = data_dir.join("videos");
    std::fs::create_dir_all(&videos_dir)
        .map_err(|e| e.to_string())?;

    let video_id = uuid::Uuid::new_v4().to_string();
    let dest_path = videos_dir.join(format!("{}.mp4", video_id));

    std::fs::copy(&file_path, &dest_path)
        .map_err(|e| e.to_string())?;

    // Extract metadata using ffprobe
    let metadata = extract_video_metadata(&dest_path)?;

    // Save to database
    let video = db.create_video(CreateVideoInput {
        video_id: video_id.clone(),
        title: extract_filename(&file_path),
        file_path: dest_path.to_string_lossy().to_string(),
        duration_seconds: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
    }).await.map_err(|e| e.to_string())?;

    Ok(video)
}

#[tauri::command]
pub async fn process_video(
    db: State<'_, Database>,
    vector_db: State<'_, VectorDatabase>,
    video_id: String,
    frame_interval: f32,
) -> Result<String, String> {
    // Get video
    let video = db.get_video(&video_id).await
        .map_err(|e| e.to_string())?;

    // Start processing in background
    let job_id = uuid::Uuid::new_v4().to_string();

    tokio::spawn(async move {
        // 1. Extract frames
        let frames = extract_frames(&video.file_path, frame_interval).await?;

        // 2. Generate embeddings (using local ONNX model)
        let embeddings = generate_embeddings(&frames).await?;

        // 3. Store in vector DB
        vector_db.upsert_embeddings(&video_id, embeddings).await?;

        // 4. Update video status
        db.update_video_status(&video_id, "ready").await?;

        Ok::<(), Box<dyn std::error::Error>>(())
    });

    Ok(job_id)
}
```

### 13.3 DuckDB Vector Search

```rust
// src-tauri/src/vector/search.rs

use duckdb::{Connection, params};
use std::sync::Mutex;

pub struct VectorDatabase {
    conn: Mutex<Connection>,
}

impl VectorDatabase {
    pub fn new(db_path: &str) -> Result<Self, duckdb::Error> {
        let conn = Connection::open(db_path)?;

        // Install and load vss extension
        conn.execute("INSTALL vss", [])?;
        conn.execute("LOAD vss", [])?;

        // Create embeddings table
        conn.execute(r#"
            CREATE TABLE IF NOT EXISTS embeddings (
                frame_id VARCHAR PRIMARY KEY,
                video_id VARCHAR NOT NULL,
                timestamp_seconds DOUBLE,
                embedding FLOAT[1408],
                metadata JSON
            )
        "#, [])?;

        // Create HNSW index
        conn.execute(r#"
            CREATE INDEX IF NOT EXISTS embedding_idx
            ON embeddings
            USING HNSW (embedding)
            WITH (metric = 'cosine')
        "#, [])?;

        Ok(Self { conn: Mutex::new(conn) })
    }

    pub fn upsert_embeddings(
        &self,
        video_id: &str,
        embeddings: Vec<(String, f64, Vec<f32>)>,
    ) -> Result<(), duckdb::Error> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(r#"
            INSERT OR REPLACE INTO embeddings
            (frame_id, video_id, timestamp_seconds, embedding)
            VALUES (?, ?, ?, ?)
        "#)?;

        for (frame_id, timestamp, embedding) in embeddings {
            stmt.execute(params![
                frame_id,
                video_id,
                timestamp,
                embedding.as_slice()
            ])?;
        }

        Ok(())
    }

    pub fn search(
        &self,
        query_embedding: &[f32],
        top_k: usize,
        video_ids: Option<&[String]>,
    ) -> Result<Vec<SearchResult>, duckdb::Error> {
        let conn = self.conn.lock().unwrap();

        let video_filter = video_ids.map(|ids| {
            format!("AND video_id IN ({})",
                ids.iter().map(|_| "?").collect::<Vec<_>>().join(","))
        }).unwrap_or_default();

        let query = format!(r#"
            SELECT
                frame_id,
                video_id,
                timestamp_seconds,
                array_cosine_similarity(embedding, ?::FLOAT[1408]) as score
            FROM embeddings
            WHERE 1=1 {}
            ORDER BY score DESC
            LIMIT ?
        "#, video_filter);

        let mut stmt = conn.prepare(&query)?;

        // Bind parameters
        let mut param_idx = 1;
        stmt.bind(param_idx, query_embedding)?;
        param_idx += 1;

        if let Some(ids) = video_ids {
            for id in ids {
                stmt.bind(param_idx, id.as_str())?;
                param_idx += 1;
            }
        }

        stmt.bind(param_idx, top_k as i32)?;

        let mut results = Vec::new();
        let mut rows = stmt.query([])?;

        while let Some(row) = rows.next()? {
            results.push(SearchResult {
                frame_id: row.get(0)?,
                video_id: row.get(1)?,
                timestamp_seconds: row.get(2)?,
                score: row.get(3)?,
            });
        }

        Ok(results)
    }
}
```

### 13.4 Frontend IPC Integration

```typescript
// services/tauri.ts
import { invoke } from '@tauri-apps/api/tauri';

export const tauriApi = {
  videos: {
    list: (params: ListVideosParams) =>
      invoke<Video[]>('list_videos', params),

    get: (videoId: string) =>
      invoke<Video>('get_video', { videoId }),

    import: (filePath: string) =>
      invoke<Video>('import_video', { filePath }),

    process: (videoId: string, frameInterval: number) =>
      invoke<string>('process_video', { videoId, frameInterval }),

    delete: (videoId: string) =>
      invoke<void>('delete_video', { videoId }),
  },

  search: {
    query: (params: SearchParams) =>
      invoke<SearchResult[]>('search', params),
  },

  storage: {
    getQuota: () =>
      invoke<StorageQuota>('get_storage_quota'),
  },
};
```

---

## 14. Offline Support

### 14.1 Offline Capabilities Matrix

| Feature | Mobile | Desktop | Notes |
|---------|--------|---------|-------|
| View cached videos | ✅ | ✅ | Local SQLite |
| Search cached content | ✅ | ✅ | Local vector DB |
| Upload videos | ✅ (queue) | ✅ | Queued for sync |
| Process videos | ❌ | ✅ | Desktop has local ONNX |
| User settings | ✅ | ✅ | Cached locally |

### 14.2 Sync Strategy

```typescript
// services/offline/syncManager.ts

interface SyncOperation {
  id: string;
  operation: 'create' | 'update' | 'delete';
  entityType: 'video' | 'folder' | 'settings';
  entityId: string;
  payload: any;
  createdAt: Date;
  attempts: number;
}

class SyncManager {
  private isOnline: boolean = true;
  private syncQueue: SyncOperation[] = [];

  async initialize() {
    // Load pending operations from local DB
    this.syncQueue = await db.loadSyncQueue();

    // Listen for connectivity changes
    NetInfo.addEventListener(state => {
      this.isOnline = state.isConnected ?? false;
      if (this.isOnline) {
        this.processSyncQueue();
      }
    });
  }

  async queueOperation(op: Omit<SyncOperation, 'id' | 'createdAt' | 'attempts'>) {
    const operation: SyncOperation = {
      id: uuid(),
      createdAt: new Date(),
      attempts: 0,
      ...op,
    };

    await db.addToSyncQueue(operation);
    this.syncQueue.push(operation);

    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  private async processSyncQueue() {
    for (const op of this.syncQueue) {
      try {
        await this.executeOperation(op);
        await db.removeFromSyncQueue(op.id);
        this.syncQueue = this.syncQueue.filter(o => o.id !== op.id);
      } catch (error) {
        op.attempts++;
        if (op.attempts >= 3) {
          // Move to dead letter queue
          await db.moveToDeadLetter(op);
          this.syncQueue = this.syncQueue.filter(o => o.id !== op.id);
        }
      }
    }
  }

  private async executeOperation(op: SyncOperation) {
    switch (op.entityType) {
      case 'video':
        return this.syncVideo(op);
      case 'folder':
        return this.syncFolder(op);
      case 'settings':
        return this.syncSettings(op);
    }
  }
}
```

### 14.3 Conflict Resolution

```typescript
// Last-write-wins with timestamp comparison
interface SyncableEntity {
  id: string;
  updatedAt: Date;
  localUpdatedAt: Date;
  version: number;
}

function resolveConflict(local: SyncableEntity, remote: SyncableEntity): 'local' | 'remote' {
  // If remote is newer, use remote
  if (remote.updatedAt > local.localUpdatedAt) {
    return 'remote';
  }

  // If local was modified after last sync, use local
  if (local.localUpdatedAt > local.updatedAt) {
    return 'local';
  }

  // Default to remote (server is source of truth)
  return 'remote';
}
```

---

## 15. Performance Requirements

### 15.1 Response Time Targets

| Operation | Target | P99 |
|-----------|--------|-----|
| API response (simple) | < 100ms | < 200ms |
| Search query | < 500ms | < 1000ms |
| Video upload start | < 200ms | < 500ms |
| Frame extraction | 30 fps | 20 fps |
| Embedding generation | 100 frames/min | 60 frames/min |

### 15.2 Scalability Targets

| Metric | Target |
|--------|--------|
| Concurrent users | 10,000 |
| Videos per user | 1,000 |
| Frames per video | 10,000 |
| Total embeddings | 100M |
| Search throughput | 1,000 queries/sec |
| Upload throughput | 100 concurrent uploads |

### 15.3 Mobile Performance

| Metric | iOS | Android |
|--------|-----|---------|
| App launch time | < 2s | < 3s |
| Search response (local) | < 200ms | < 300ms |
| Memory usage (idle) | < 100MB | < 150MB |
| Battery (background) | < 1%/hour | < 2%/hour |

### 15.4 Desktop Performance

| Metric | Target |
|--------|--------|
| App launch time | < 1s |
| Local search | < 100ms |
| Video processing | 2x realtime |
| Memory usage (idle) | < 200MB |
| Memory usage (processing) | < 2GB |

---

## 16. Deployment Architecture

### 16.1 Cloud Infrastructure (GCP)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Google Cloud Platform                             │
│                                                                             │
│  ┌─────────────────┐                                                        │
│  │  Cloud DNS      │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────┐     ┌─────────────────┐                               │
│  │  Cloud CDN      │────▶│  Cloud Storage  │                               │
│  └────────┬────────┘     │  (videos/frames)│                               │
│           │              └─────────────────┘                               │
│           ▼                                                                 │
│  ┌─────────────────┐                                                        │
│  │  Cloud Load     │                                                        │
│  │  Balancer       │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Google Kubernetes Engine                      │   │
│  │                                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │   │
│  │  │API Service│  │Search    │  │Worker    │  │Worker    │            │   │
│  │  │(3 pods)  │  │Service   │  │Frame     │  │Embedding │            │   │
│  │  │          │  │(2 pods)  │  │(5 pods)  │  │(5 pods)  │            │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │              │                                                  │
│           ▼              ▼                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │  Cloud SQL      │  │  Memorystore    │  │  Qdrant         │            │
│  │  (PostgreSQL)   │  │  (Redis)        │  │  (Managed)      │            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 Kubernetes Manifests

```yaml
# api-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-service
  template:
    metadata:
      labels:
        app: api-service
    spec:
      containers:
      - name: api-service
        image: gcr.io/project/api-service:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: url
        - name: REDIS_URL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: redis-url
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: api-service
spec:
  selector:
    app: api-service
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-service
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### 16.3 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          npm ci
          npm test
          npm run type-check

  build-api:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./api-service
          push: true
          tags: gcr.io/${{ secrets.GCP_PROJECT }}/api-service:${{ github.sha }}

  build-workers:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./workers
          push: true
          tags: gcr.io/${{ secrets.GCP_PROJECT }}/workers:${{ github.sha }}

  deploy:
    needs: [build-api, build-workers]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to GKE
        run: |
          gcloud container clusters get-credentials cluster-name
          kubectl set image deployment/api-service \
            api-service=gcr.io/${{ secrets.GCP_PROJECT }}/api-service:${{ github.sha }}
          kubectl set image deployment/workers \
            workers=gcr.io/${{ secrets.GCP_PROJECT }}/workers:${{ github.sha }}
          kubectl rollout status deployment/api-service
          kubectl rollout status deployment/workers
```

---

## 17. Development Guidelines

### 17.1 Code Standards

**TypeScript/JavaScript:**
- ESLint + Prettier configuration
- Strict TypeScript mode
- No `any` types (use `unknown` if needed)
- Functional components with hooks

**Python:**
- Black formatter
- isort for imports
- mypy for type checking
- pytest for testing

**Rust:**
- rustfmt for formatting
- clippy for linting
- cargo test for testing

### 17.2 Git Workflow

```
main          ←── Production releases
  │
  └── develop ←── Integration branch
        │
        ├── feature/xxx ←── New features
        ├── fix/xxx     ←── Bug fixes
        └── chore/xxx   ←── Maintenance
```

**Commit Convention:**
```
type(scope): description

Types: feat, fix, docs, style, refactor, test, chore
Scope: api, mobile, desktop, workers, db

Examples:
feat(api): add video deletion endpoint
fix(mobile): resolve crash on search
chore(workers): update dependencies
```

### 17.3 Testing Requirements

| Type | Coverage Target | Tools |
|------|-----------------|-------|
| Unit | 80% | Jest, pytest |
| Integration | Key flows | Supertest, pytest |
| E2E | Critical paths | Playwright, Detox |
| Load | N/A | k6, Artillery |

### 17.4 Documentation Requirements

- API documentation: OpenAPI 3.0 spec
- Code documentation: JSDoc / docstrings
- Architecture: C4 diagrams
- Runbooks: For all production operations

---

## Appendix A: Environment Variables

```bash
# API Service
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379
JWT_SECRET=xxx
JWT_REFRESH_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GCS_BUCKET=video-search-storage
GCS_CREDENTIALS_PATH=/secrets/gcs.json

# Search Service
PYTHON_ENV=production
QDRANT_HOST=qdrant
QDRANT_PORT=6333
VERTEX_AI_PROJECT=project-id
VERTEX_AI_LOCATION=us-central1

# Workers
WORKER_CONCURRENCY=3
FRAME_EXTRACTION_WORKERS=8
EMBEDDING_BATCH_SIZE=10
TEMP_DIR=/tmp/processing
```

---

## Appendix B: Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| AUTH_INVALID_CREDENTIALS | 401 | Invalid email or password |
| AUTH_TOKEN_EXPIRED | 401 | Access token expired |
| AUTH_REFRESH_INVALID | 401 | Invalid refresh token |
| USER_NOT_FOUND | 404 | User does not exist |
| VIDEO_NOT_FOUND | 404 | Video does not exist |
| VIDEO_PROCESSING | 409 | Video is currently processing |
| STORAGE_LIMIT_EXCEEDED | 402 | Storage quota exceeded |
| SEARCH_QUOTA_EXCEEDED | 429 | Daily search limit reached |
| FILE_TOO_LARGE | 413 | File exceeds size limit |
| INVALID_FILE_TYPE | 415 | Unsupported file format |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Internal server error |

---

*End of Technical Specification*
