# Template catalogue (phase 1)

Ten system templates: five aimed at creators, five at marketers, several useful to both. The
machine-readable recipes are in [catalog.json](../../backend/app/assets/templates/catalog.json); the editor and renderer both read
them. Every value below is a default the user can change in the adjustable panel.

## Overview

| Template | For | Formats | Moments | Captions | Music |
|---|---|---|---|---|---|
| Hook & Caption | Creators | 9:16, 1:1 | 1 to 3, up to 90 s | Bold pop (word by word) | Under speech, ducked |
| Podcast Clip | Creators, marketers | 9:16 | 1, up to 2 min | Karaoke, in a panel | Off by default |
| Highlight Reel | Creators | 9:16, 16:9, 1:1 | 3 to 12, up to 90 s | Off | Leads |
| Clean Subtitles | Both | All four | 1, up to 10 min | Clean | Off by default |
| Vlog Recap | Creators | 16:9, 9:16 | 3 to 15, up to 3 min | Off | Leads, ducked |
| Product Spotlight | Marketers | 4:5, 1:1, 9:16 | 1 to 5, up to 45 s | Off | Leads, ducked |
| Customer Testimonial | Marketers | 4:5, 9:16, 1:1, 16:9 | 1 to 3, up to 90 s | Quote | Soft, ducked |
| Event Highlights | Marketers, creators | 16:9, 9:16, 1:1 | 4 to 20, up to 3 min | Off | Leads |
| Step-by-Step Tutorial | Marketers, creators | 16:9, 9:16 | 2 to 10, up to 10 min | Clean | Quiet, ducked |
| Announcement Teaser | Marketers, creators | 9:16, 1:1 | 1 to 3, up to 30 s | Off | Leads |

## Creators

**Hook & Caption.** The everyday short. A bold hook line for the first 2.5 seconds, the
speaker reframed to fill a vertical frame, and big word-by-word captions in the lower middle.
Optional "Follow for more" end card.

**Podcast Clip.** The speaker takes the top 62% of a vertical frame; the bottom is a brand-colour
panel with large karaoke captions and the episode title. Speaker name as a lower third for the
first few seconds. End card pointing to the full episode.

**Highlight Reel.** Several moments cut to music with short crossfades, a title card up front
and an end card. Music leads; original audio sits underneath at 25% so reactions still come
through.

**Clean Subtitles.** The no-frills option: any single moment in any format with tidy two-line
subtitles. Good for accessibility and repurposing long clips.

**Vlog Recap.** A softer reel for trips and days out: place names as lower thirds on each
moment, a serif title card, slower crossfades, chill music ducked under talking.

## Marketers

**Product Spotlight.** The video sits inset on a brand-colour frame with rounded corners. A
headline stays at the top; each moment gets its own feature callout; ends on a call-to-action
card. Logo required.

**Customer Testimonial.** The customer fills the frame with large quote-style captions, a name
and role lower third with an accent bar, soft music under the voice, and a brand-colour end
card.

**Event Highlights.** Opens on a title card (event, date, city) over a blurred first moment,
then fast crossfaded moments to energetic music with the organiser or sponsor logo, closing on
a brand-colour card.

**Step-by-Step Tutorial.** One moment per step, each with a numbered step badge and title,
clean subtitles, an intro card ("How to…") and a help-link end card. No reframing by default,
since screen recordings need the full frame.

**Announcement Teaser.** Short and punchy: bold text cards slam in between up to three short
moments, ending on a launch date and URL. Music leads.

## Caption styles

| Style | Granularity | Look |
|---|---|---|
| Bold pop | Word by word | Uppercase Montserrat ExtraBold, heavy outline, active word in the accent colour, 3 words per line |
| Clean | Sentence | Inter SemiBold, soft shadow, up to 2 lines |
| Boxed | Sentence | Inter Bold on a brand-colour box |
| Karaoke | Word by word | Poppins Bold, the line shown dim with the spoken word lit |
| Quote | Sentence | Playfair Display italic with quote marks, up to 4 lines |

Word-by-word styles need word-level transcript timings (see the spec's Captions section).

## Fonts

Inter, Montserrat, Poppins, Playfair Display, Bebas Neue and DM Serif Display, all under the
SIL Open Font License, so they can be bundled in the render worker and used in commercial
videos.
