# App Store Review - Guideline 2.1 Response

## 1. Screen Recording

A screen recording captured on a physical device will be provided, demonstrating the following flows:

- App launch and Google Sign-In authentication
- Terms of Service acceptance on first login
- Uploading a video from the photo library
- Video processing status (frame extraction and AI embedding generation)
- Searching videos with a natural language query (e.g., "person holding a red cup")
- Viewing search results with matching frames and exact timestamps
- Creating a clip from a search result
- Subscription paywall with plan comparison and purchasing flow
- Restore Purchases functionality
- Settings screen: Sign Out and Delete Account flows
- Permission prompts for photo library access during video upload

---

## 2. App Purpose

FrameSeek is an AI-powered video search app that makes every moment in your videos instantly findable through natural language.

Users upload videos, which are automatically processed — frames are extracted at configurable intervals and converted into high-dimensional semantic embeddings using AI. Users can then search their entire video library by describing what they're looking for in plain English (e.g., "sunset on the beach", "person holding a red cup"), and FrameSeek returns matching frames with exact timestamps they can jump to.

**Problem it solves:** Scrubbing through hours of video to find a specific moment is time-consuming and frustrating. FrameSeek eliminates this by enabling instant, natural language search across an entire video library.

**Value it provides:** Content creators, researchers, journalists, and anyone with large video libraries can find exact moments in seconds instead of minutes or hours. Users can also generate clips directly from search results for easy sharing and export.

---

## 3. Test Credentials & Instructions

**Authentication:** The app uses Google Sign-In exclusively.

- **Test Email:** [INSERT_TEST_GMAIL_HERE]
- **Test Password:** [INSERT_TEST_PASSWORD_HERE]

**Instructions to access main features:**

1. Launch the app and tap "Sign in with Google"
2. Sign in with the test credentials above
3. Accept the Terms of Service on first login
4. **Upload a video:** Tap the upload button on the Home screen, select a video from the photo library (the app will request photo library access)
5. **Wait for processing:** The video will show processing status as frames are extracted and AI embeddings are generated (typically 1-2 minutes for a short video)
6. **Search:** Once processed, use the search bar to type a natural language description (e.g., "person walking", "blue sky"). Results show matching frames with timestamps
7. **Create a clip:** Tap on a search result and use the clip creation feature to generate a clip with a start and end time
8. **Subscriptions:** Navigate to Settings > Plan to view the paywall with Free, Pro ($6.99/mo), and Pro Max ($14.99/mo) plans
9. **Account deletion:** Navigate to Settings > scroll to bottom > "Delete Account" — confirms with an alert before permanently deleting the account and all associated data
10. **Sign out:** Settings > "Sign Out"

---

## 4. External Services

| Service | Purpose |
|---------|---------|
| **Google OAuth 2.0** | User authentication — users sign in exclusively via Google Sign-In |
| **Google Vertex AI (Multimodal Embeddings)** | Converts extracted video frames into 1408-dimensional semantic vectors for natural language search |
| **Google Cloud Storage** | Stores uploaded videos, extracted frames, thumbnails, and generated clips |
| **OpenAI Whisper** | Automatic speech recognition — generates video transcripts for enhanced search |
| **Qdrant** | Self-hosted vector database for storing and querying frame embeddings |
| **Apple StoreKit / In-App Purchase v2** | Subscription management, receipt validation, and Apple Server Notifications v2 for renewal/cancellation events |
| **PostgreSQL** | Primary database for user accounts, video metadata, subscriptions, and search history |
| **Redis** | Background job queue for asynchronous video processing tasks |

---

## 5. Regional Differences

FrameSeek functions consistently across all regions. There are no regional differences in features, content, pricing tiers, or functionality. All users worldwide have access to the same features regardless of their location.

---

## 6. Regulated Industry

FrameSeek does not operate in a highly regulated industry. The app is a general-purpose video search tool and does not provide services in healthcare, finance, gambling, legal, or any other regulated sector. No special documentation or credentials are required.
