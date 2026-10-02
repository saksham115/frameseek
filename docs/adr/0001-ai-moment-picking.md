# ADR 0001: AI moment picking for templates

- **Status:** Proposed. Deferred: templates phase 1 ships with user-chosen moments only.
- **Date:** 2026-10-02
- **Related:** [Templates spec](../templates/README.md)

## Context

Templates turn moments from a user's videos into finished videos. In phase 1 the user picks
every moment. The most requested shortcut in comparable tools is the reverse: "find the best
30 seconds of this video" or "make a reel of every moment with the dog". FrameSeek already has
most of the raw material for this:

- **Shots:** each video is split into runs of similar-looking frames, with start/end times.
- **Visual search:** text-to-frame embeddings (Azure AI Vision), with generic frames
  (black screens, end cards) pushed down the ranking.
- **Transcripts:** Whisper segments with timestamps, for anything spoken.

What we don't have is anything that judges a moment as *good*: funny, emotional, quotable,
on-topic, or a complete thought that makes sense out of context.

## Decision

1. **Phase 1: the user chooses every moment.** No AI picking. Templates must be valuable
   without it, and user-chosen moments give us the data to evaluate picking later (which
   moments people actually use).
2. **When we build it: a hybrid of our own retrieval plus Claude for judgement** (option C
   below), behind a feature flag, as *suggestions* the user reviews in the same moment strip.
   Nothing is rendered from AI picks without the user seeing them.

## Options considered

| Option | How | Strengths | Weaknesses |
|---|---|---|---|
| A. Visual search only | User describes the theme; top shots from existing search fill the reel | Already built, no new cost | Can't judge "best", "funny" or "complete thought"; blind to speech |
| B. Transcript LLM only | Send the transcript to an LLM and ask for highlight ranges | Great at quotes, jokes, complete thoughts | Blind to visuals; silent footage gets nothing; may return times that cut mid-word |
| **C. Hybrid (chosen)** | Our retrieval builds a candidate list (shots matching the theme, plus transcript segments); Claude ranks and assembles them to a target length, choosing only from candidates by ID | Uses both modalities; picks are always real ranges we can validate; cost bounded by the candidate list | More moving parts; needs an eval to tune |
| D. Hybrid plus vision | As C, and Claude also sees one representative frame per top candidate | Can judge visual quality and composition | More tokens and latency; use only for a shortlist |
| E. Trained engagement model | Learn "good moment" from usage data | Could be best in the long run | No data yet; revisit once phase 1 usage exists |

We start with C, add D for the final shortlist if the eval shows it helps, and keep E as a
future direction.

## Design (for when this is built)

### Flow

1. The user opens a template and clicks **Suggest moments**, optionally typing a theme ("the
   product demo", "funny moments") and a target length.
2. **Candidates** (our code, no LLM): shots matching the theme through visual search; transcript
   segments; shot boundaries; generic frames excluded. Capped to keep the prompt bounded
   (for example the top 150 shots and the full transcript).
3. **Claude ranks and assembles:** given the template (format, target length, moment count),
   the theme, and the candidates with IDs, it returns an ordered list of picks, each a
   candidate ID with optional trim within that candidate and a one-line reason.
4. **We validate and snap:** every pick must reference a real candidate; times are snapped to
   shot and transcript segment boundaries so cuts don't land mid-word; total length is
   enforced.
5. **Suggestions fill the moment strip,** labelled as suggestions with their reasons. The user
   keeps, removes, re-orders or trims them as usual.

### Model and API

- **Model:** `claude-opus-5-5`, our default. Effort is tuned with the eval below, starting at
  `low` and raising only if picks measurably improve. Thinking is always on for this model;
  effort is the control.
- **Structured outputs:** the response format is constrained to a JSON schema (picks with
  `candidate_id`, optional `trim_start`/`trim_end`, `reason`), so the result always parses.
  Because picks are IDs from our list, the model can't invent timestamps.
- **Refusal handling:** opt into server-side fallbacks (`fallbacks: "default"` with the
  `server-side-fallback-2026-07-01` beta) and check `stop_reason` before reading content.
- **Prompt caching:** the system prompt (instructions, schema, template definitions) is stable
  and cached. For a given video, the candidate list is the next cached block, so "Suggest
  again", a different target length or a different template reuse it at the cached rate.
- **Batch processing (optional):** if we pre-compute "suggested highlights" right after a video
  finishes processing (no user waiting), send those through the Message Batches API, which
  runs asynchronously at about half the cost.

### Cost estimate

At current list prices for `claude-opus-5-5` ($4 per million input tokens, $20 per million
output tokens, cache reads $0.20 per million):

| Video | Input (transcript + candidates + instructions) | Output (picks + reasons + thinking) | Cost per request |
|---|---|---|---|
| 15 min | about 8,000 tokens | about 2,000 tokens | about $0.07 |
| 1 hour | about 25,000 tokens | about 3,000 tokens | about $0.16 |
| "Suggest again" on the same video | mostly cached | about 2,000 tokens | about $0.05 |

Token counts are estimates (roughly 150 spoken words a minute plus a compact candidate list);
measure with token counting on real videos before setting plan limits. Adding vision (option
D) for a shortlist of 20 frames adds image tokens; measure before enabling.

At these costs, suggestions fit inside the proposed plans as a monthly allowance (for
example 10 on Free, 100 on Pro, 400 on Pro Max), counted like searches.

### Evaluation

Before launch, build an eval:

- **Data:** 20 to 30 real videos across creator and marketer use cases, each with moments
  picked by people (from phase 1 creations, with consent, or hand-labelled).
- **Metrics:** overlap between suggested and human-picked time ranges; "complete thought" rate
  (no cut mid-sentence); and in production, the share of suggestions users keep versus remove.
- **Use:** tune effort, candidate limits and the prompt against this eval; it is also the gate
  for adding vision.

## Consequences

- **Privacy:** transcripts, candidate metadata and (with option D) frames would be sent to
  Anthropic. The Privacy Policy's processor list (currently Microsoft Azure, Google, Stripe)
  must add Anthropic before launch, and suggestions should be opt-in per request (the user
  clicks Suggest).
- **Reliability:** suggestions depend on an external API; if it is unavailable the editor
  still works with manual picking, and the button shows a clear error.
- **Cost control:** a per-plan monthly allowance plus caching keeps spend predictable.
- **Product:** phase 1 must record which moments users pick for each template (already
  implied by the `creations` table), since that is the evaluation data for this decision.

## Revisit when

- Phase 1 has been live long enough to have a few hundred real creations, or
- users repeatedly ask for automatic highlights, or
- the eval shows option C clearly beats visual search alone.
