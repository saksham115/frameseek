# Templates: spec (phase 1)

Status: phase 1 built (October 2026). See "What was built" below for where the build
differs from this plan.

Turn moments from a user's videos into finished, ready-to-post videos: vertical shorts,
square posts, highlight reels, testimonials and more. The user picks the moments, picks a
template, adjusts it in a side panel, and FrameSeek renders an MP4.

- Template catalogue: [catalog.md](catalog.md) (machine-readable: [catalog.json](../../backend/app/assets/templates/catalog.json))
- AI moment picking (deferred): [ADR 0001](../adr/0001-ai-moment-picking.md)

## What was built

Everything in phase 1 below except the items marked later, with these differences from the
plan:

| Plan | Built | Why |
|---|---|---|
| `templates` table seeded from the catalogue | The catalogue ships with the API (`backend/app/assets/templates/catalog.json`); each creation stores a copy of its recipe | A creation keeps its template exactly as it was, with no seeding step |
| Word timings from Whisper (`transcript_words`) | Word times are spread across each caption line by word length | Works for every existing video and stays right when a caption is edited; real word timings can replace it later |
| Smart-crop per shot (`shot_framing`) | Smart-crop per moment, at the moment's midpoint, stored on the moment | Azure only accepts ratios 0.75 to 1.8, so 9:16 asks for 0.75 and centres a narrower window on it |
| Licensed music library | Own uploads only; the library endpoint reports it as unavailable | No licence is signed yet |
| Fast 360p preview render | Not built; the browser preview uses the renderer's fonts and layout rules | The live preview proved close enough in testing |
| Saved presets (Pro Max) | Not built | Phase 2 |

Code: API in `backend/app/routers/creations.py` and `services/creation_service.py`; renderer in
`backend/app/services/render/` (timeline, layout, ASS text, ffmpeg passes) run by
`workers/render_worker.py` on the existing queue (`render_creation` messages); web editor in
`web/src/pages/CreationEditor.tsx` and `web/src/components/creator/`. The preview mirrors the
renderer's rules in `web/src/lib/creator.ts`, and tests on both sides pin them.

## Who it's for

| Audience | What they make | What matters most |
|---|---|---|
| Creators | Shorts/Reels/TikToks from long videos, podcast clips, vlog recaps, highlight reels | Speed, captions that look current, music, vertical framing that keeps the subject in shot |
| Marketers | Product spotlights, customer testimonials, event highlights, tutorials, announcements | Brand consistency (logo, colours, fonts), clear text and calls to action, several formats from one edit |

## Scope

### In phase 1

- **10 system templates** (see the catalogue), each available in the formats it supports.
- **One or more moments per creation.** Single-moment templates (a short, a testimonial) and
  multi-moment ones (highlight reel, event recap, tutorial) both ship in phase 1, because the
  user chooses the moments. Moments can come from different videos.
- **Formats:** 9:16, 1:1, 4:5, 16:9.
- **Subject-aware reframing** per shot, with a manual nudge.
- **Captions** from the transcript, in five styles, with text editing before render.
- **Text layers** per template: hook, title, lower third, step badges, call to action.
- **Branding per creation:** logo upload, two brand colours, font choice.
- **Music:** a licensed in-app library plus the user's own audio; automatic ducking under
  speech; fades; loudness normalised for social platforms.
- **Live preview** in the browser while adjusting; final render on the server.
- **Renders** saved in the library (as "Creations"), downloadable, re-editable.
- **Plan limits and pricing**, defined but switched off (`PAYMENTS_ENABLED=false`).

### Not in phase 1

| Later | Why later |
|---|---|
| AI-picked moments | Decided separately in ADR 0001; v1 is user-chosen |
| Saved brand kits shared across creations | Phase 2; phase 1 keeps branding per creation (with "use last settings") |
| Custom user-built templates | Phase 2; users can save a creation's settings as a preset first |
| Timeline editor (multi-track, keyframes) | Out of scope by design: adjustable panel only |
| Direct posting to Instagram/TikTok/YouTube | Phase 4; platform APIs and review |
| Animated motion graphics beyond simple text animation | Would need a different renderer (see Rendering) |

## User flow and screens

The sidebar stays at two tabs (Media library, Visual search). Templates are reached from
where the moments already are, and creations live inside the Media library.

1. **Entry points**
   - Video workspace: a **Create** button next to Export clip. Starts with the current
     selection (or the shot under the playhead) as the first moment.
   - Search results and in-video results: **Use in a creation** on a shot.
   - Media library: select several videos or shots, then **Make a reel**.
2. **Template gallery** (dialog): cards with a looping preview, filters for goal
   (Short, Reel/highlight, Brand) and format. Choosing one opens the editor.
3. **Editor** (full screen):
   - Left: the preview, in a phone frame for vertical formats. Plays the whole creation.
   - Bottom: the moment strip. Add, remove, reorder, trim each moment.
   - Right: the adjustable panel (below).
   - Top bar: name, format switcher, **Render**.
4. **Render**: progress with the current step ("Mixing audio", "Encoding 64%"), then a
   ready notification (same system as video processing). Download, open, edit again.
5. **Creations** in the Media library: a filter tab next to All videos/Ready/Processing,
   showing rendered outputs with their template and format.

### The adjustable panel

Tabs, each showing only what the chosen template uses:

| Tab | Controls |
|---|---|
| Moments | Trim handles per moment; add from search; reorder; per-moment "keep original audio" toggle |
| Format & framing | Aspect ratio; per-moment framing (auto subject focus, or drag the crop window); background for "frame" layouts (blur, brand colour) |
| Captions | On/off; style (5); font; size; position (top, middle, bottom, safe zones); highlight colour; edit caption text and timing per line |
| Text | Each text layer the template defines (hook, title, lower third, step titles, bullets, CTA): text, on/off, start time, duration |
| Branding | Logo (upload, position, size, opacity); primary and accent colours; font; "use my last branding" |
| Music | Library browser (mood, tempo, length, preview); upload own audio (with a rights confirmation); volume; ducking under speech on/off; fade in/out; start offset |
| Export | Resolution (plan-dependent); file name; watermark status (Free plan) |

Every control has a template default, so a user can pick a template and press Render.

## Templates as data

A template is a versioned JSON recipe (see `catalog.json`). The editor reads it to build the
panel; the renderer reads it (plus the user's overrides) to build the render. Adding a
template means adding a recipe, not code. Recipe fields:

- `formats`, `default_format`
- `moments`: min/max count, max total length, per-moment max length
- `layout`: `fill` (subject fills frame), `split` (video plus caption panel), `frame`
  (video inset on a branded or blurred background)
- `captions`: default style, position, enabled
- `text_layers`: role, default text, timing rule (e.g. first 2.5 s, per moment, last 3 s),
  style
- `branding`: logo slot and default position, colour roles
- `transitions`: type (cut, crossfade, slide) and duration
- `intro_card` / `outro_card`: on/off, layout, default text
- `music`: default mood, volume, ducking, fades, whether music leads or sits under speech
- `panel`: which panel controls this template exposes

A creation stores the template id **and version**, so editing a template later never
changes existing creations.

## Rendering

### Where it runs

Rendering moves to the worker. Today's clip export runs ffmpeg inside the API request; a
template render (reframing, captions, overlays, music) takes far longer and must not block
the API. Renders become a new queued job type on the existing worker, reusing the progress
heartbeat, stalled-job recovery, and "ready" notifications built for video processing.

### How

The renderer turns recipe + overrides into one ffmpeg run per creation:

1. **Per moment:** trim from the original in Blob; crop and scale to the format using the
   moment's crop window; blurred or brand-colour background for `frame` layouts.
2. **Join** moments with the template's transition (`xfade` for crossfades).
3. **Overlays:** logo, text layers and intro/outro cards, pre-rendered to transparent
   PNG/ASS with the chosen fonts, composited at their times.
4. **Captions:** burned in from an ASS subtitle file (libass), which supports all five styles
   including word-by-word highlighting.
5. **Audio:** original speech, plus music trimmed/looped to length, ducked under speech using
   the transcript's speech segments, faded, and loudness-normalised (target about -14 LUFS
   for social).
6. **Encode** H.264 + AAC MP4 at the plan's resolution, upload to Blob, generate a
   thumbnail, mark the render ready.

**ffmpeg, not Remotion, for phase 1.** It's already in the worker image, fast and free.
Remotion (React to video) would make richer animated text easier and match the web preview
exactly, but it's heavier to run and needs a paid company licence; revisit if motion
graphics become a priority.

### Reframing

Azure AI Vision's smart-crop returns the region of interest for a requested aspect ratio. We
run it once per shot (on the shot's representative frame) and store the crop window per
shot and format. Shots then carry their own framing, so a cut to a new speaker reframes too.
Users can drag the window to override.

### Captions

Phase 1 needs **word-level timings** for word-by-word styles. The Whisper API can return word
timestamps alongside segments (to confirm on our Azure OpenAI deployment and API version
before building); we'd request both during transcription and store words per segment. Existing videos get word timings by re-running transcription on demand (only when
first used in a word-level style). Sentence styles work with today's segment timings.

### Preview

The editor previews in the browser: the source video with a CSS crop window, captions and
text drawn as HTML from the same style tokens the renderer uses, music played alongside. It
won't match the render pixel for pixel (fonts and ducking are approximated), so the render
dialog says so and offers a fast 360p preview render before the full one.

## Music

Music is in phase 1, and it is the main legal risk, so it has its own section.

- **Library:** a curated set of tracks (start with about 100, tagged by mood, tempo, length)
  licensed from a provider whose terms explicitly cover **use inside user-generated videos
  made in our app and posted to social platforms**, for both personal and commercial
  (marketer) use. Candidates to evaluate: royalty-free music providers with partner/API
  programmes, or an AI music generator with a commercial licence. This is a business and
  legal decision; we should not ship any library before the licence is signed and covers
  redistribution inside the app.
- **User uploads:** MP3, WAV, M4A up to 20 MB, with a checkbox confirming the user has the
  rights. Stored as a user asset, counted against storage.
- **Platform caveat:** even licensed tracks can be flagged by platform content-ID systems;
  the provider must offer whitelisting or a claims process. The UI should say which tracks
  are "safe for commercial use".
- **Processing:** ducking under speech, fades, looping to fill, loudness normalisation; all
  in the ffmpeg render.

## Data model

New tables (all scoped by `user_id`):

| Table | Purpose | Key fields |
|---|---|---|
| `templates` | System templates (and later user presets) | `slug`, `version`, `name`, `audience`, `recipe` (JSONB), `is_system`, `owner_user_id` |
| `creations` | A user's editable draft | `template_id`, `template_version`, `format`, `moments` (JSONB: video, start, end, crop, keep_audio), `overrides` (JSONB), `caption_edits` (JSONB), `music` (track or asset, volume, ducking, fades), `status` |
| `renders` | One render of a creation | `creation_id`, `status`, `progress`, `current_step`, `resolution`, `duration_seconds`, `size_bytes`, `output_blob`, `error`, timestamps |
| `music_tracks` | The licensed library | `title`, `artist`, `mood`, `bpm`, `duration_seconds`, `licence`, `provider`, `blob_path`, `commercial_safe` |
| `user_assets` | Logos and uploaded music | `kind`, `blob_path`, `size_bytes`, `rights_confirmed_at` |
| `shot_framing` | Smart-crop windows per shot and format | `video_id`, `shot_index`, `format`, crop box |

Plus `transcript_words` (or a JSONB column on segments) for word timings, and a monthly
render counter on `users` (same pattern as the search counter).

## API sketch

| Method | Path | Purpose |
|---|---|---|
| GET | `/templates` | Catalogue for the gallery |
| POST | `/creations` | Create from a template with initial moments |
| GET/PATCH | `/creations/{id}` | Load and save the panel's state |
| GET | `/creations/{id}/captions` | Caption lines prefilled from transcripts of the chosen moments |
| POST | `/creations/{id}/render` | Queue a render (checks plan limits) |
| GET | `/renders/{id}` | Status and progress; download URL when ready |
| GET | `/music` | Library with filters; short signed preview URLs |
| POST | `/assets/upload-url` | Logo or music upload (SAS, same as videos) |
| GET | `/videos/{id}/framing?format=9:16` | Smart-crop windows per shot |

## Plans and pricing

Pricing is defined now so limits can be built in, but **payments stay off**
(`PAYMENTS_ENABLED=false`, as today). Prices are a starting proposal to validate against
comparable creator tools before turning payments on.

| | Free | Pro | Pro Max |
|---|---|---|---|
| Price (monthly) | $0 | $12 / ₹999 | $29 / ₹2,499 |
| Price (yearly) | $0 | $120 / ₹9,990 (2 months free) | $290 / ₹24,990 (2 months free) |
| Storage | 5 GB | 20 GB | 50 GB |
| Visual searches / month | 50 (+3 × 10 on request) | 100 | 500 |
| Renders / month | 5 | 50 | 200 |
| Max creation length | 60 s | 3 min | 10 min |
| Resolution | 720p | 1080p | 1080p (4K later) |
| Watermark | "Made with FrameSeek" | None | None |
| Templates | All system templates | All | All + save presets |
| Music | Own uploads | Own uploads + full library | Own uploads + full library, commercial use |
| Brand kits (phase 2) | None | 1 | 5 |
| Render queue | Standard | Standard | Priority |

Existing limits (storage, searches, retention) are unchanged; template limits are added to
`PlanConfig` alongside them.

**While payments are off:** to avoid showing walls nobody can pay past, every account gets
**Pro template limits without a watermark**, and the Plans page keeps saying upgrades aren't
open. A separate flag (`TEMPLATE_LIMITS_ENFORCED`, default false) switches Free limits on;
it's turned on together with `PAYMENTS_ENABLED`.

## Build order (phase 1)

1. **Render pipeline:** worker job type, recipe to ffmpeg for one moment in one format,
   captions (sentence styles), logo, encode, upload; progress and notifications.
2. **Data model and API:** templates seeded from `catalog.json`, creations, renders.
3. **Editor shell:** gallery, editor layout, moment strip, preview, Format and Captions tabs.
4. **Reframing:** smart-crop per shot, stored framing, manual nudge.
5. **Text layers and branding tabs;** intro/outro cards.
6. **Multi-moment:** joining, transitions, highlight/event/tutorial templates.
7. **Music:** user uploads, ducking and loudness; then the licensed library once the licence
   is signed.
8. **Word-level captions** (word timings, word-by-word styles).
9. **Plan limits** (behind the flags above), Creations tab, polish.

Steps 1 to 3 make an end-to-end slice (one template, one format) worth testing with real
users before the rest.

## Risks

| Risk | Mitigation |
|---|---|
| Music licensing | No library until a licence covering in-app use is signed; user uploads with rights confirmation in the meantime |
| Render cost and time | Renders on the worker with limits per plan; short creations (under 3 min) dominate; scale workers on queue depth |
| Preview vs render mismatch | Shared style tokens; fast 360p preview render; set expectations in the UI |
| Caption errors on screen | Caption editing before render is required, not optional |
| Fonts | Ship only fonts with open licences (SIL OFL) |
| Smart-crop misses the subject | Per-moment manual crop; per-shot (not per-video) framing |
| Privacy | New processors (music provider) and data flows must be added to the Privacy Policy before launch |

## Open questions

1. Which music provider (or AI generator)? Needs a licence review before the library ships.
2. Do creations count against storage like videos? (Proposed: yes.)
3. Should Free renders be watermarked once payments are on, or limited only by count and
   resolution?
4. Do we keep "Pro Max", or rename it for marketers (for example "Business")?
