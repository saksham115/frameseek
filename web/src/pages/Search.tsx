import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Focus,
  History,
  Image,
  Play,
  ScanLine,
  Scissors,
  Search as SearchIcon,
  Sparkles,
} from "lucide-react";
import {
  getSearchHistory,
  getSearchQuota,
  searchWithQuota,
  type SearchQuota,
} from "@/api/search";
import type { SearchMatch } from "@/api/types";
import { Button } from "@/components/ui/button";
import { MediaThumbnail, PageHeader } from "@/components/MediaUI";
import { errorStatus } from "@/lib/errors";
import { formatTimestamp } from "@/lib/format";
import { SEARCH_INPUT_ID } from "@/lib/navigation";
import { clipParam } from "@/lib/shots";
import RequestMoreSearches from "@/components/RequestMoreSearches";

const SUGGESTIONS = [
  "A person by the ocean",
  "Golden hour light",
  "Someone laughing",
  "A city at night",
];
// Fallback for results without shot info: frames closer than this are one moment.
const SAME_MOMENT_SECONDS = 4;
const MAX_MOMENTS = 6;

interface VideoGroup {
  video_id: string;
  video_title: string;
  best: SearchMatch;
  moments: SearchMatch[];
  total?: number;
}

/**
 * One card per video: its best moment, plus its other moments in time order. The API
 * already returns one result per shot; the time-gap check only covers frames that have
 * no shot (e.g. videos indexed before shots existed).
 */
function groupByVideo(matches: SearchMatch[]): VideoGroup[] {
  const groups = new Map<string, VideoGroup>();
  for (const m of matches) {
    const g = groups.get(m.video_id);
    if (!g) {
      groups.set(m.video_id, {
        video_id: m.video_id,
        video_title: m.video_title,
        best: m,
        moments: [m],
      });
    } else if (
      m.shot_index != null ||
      g.moments.every(
        (o) => Math.abs(o.timestamp_seconds - m.timestamp_seconds) >= SAME_MOMENT_SECONDS,
      )
    ) {
      g.moments.push(m);
    }
  }
  // Matches arrive best-first, so the first MAX_MOMENTS are the strongest; show those
  // in timeline order.
  return [...groups.values()].map((g) => ({
    ...g,
    total: g.moments.length,
    moments: g.moments
      .slice(0, MAX_MOMENTS)
      .sort((a, b) => a.timestamp_seconds - b.timestamp_seconds),
  }));
}

/** "0:12–0:31" for a shot, or the frame time when there's no shot. */
function momentLabel(m: SearchMatch) {
  return m.shot_start_seconds != null && m.shot_end_seconds != null
    ? `${formatTimestamp(m.shot_start_seconds)}–${formatTimestamp(m.shot_end_seconds)}`
    : formatTimestamp(m.timestamp_seconds);
}

function quotaLabel(quota: SearchQuota) {
  if (quota.limit < 0) return "Unlimited searches";
  return `${quota.remaining} of ${quota.limit} searches left this month`;
}

function resetLabel(quota: SearchQuota) {
  const base = quota.resets_at ? new Date(quota.resets_at) : new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return next.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export default function Search() {
  const [params, setParams] = useSearchParams();
  const submitted = params.get("q")?.trim() ?? "";
  const [query, setQuery] = useState(submitted);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => setQuery(submitted), [submitted]);

  const { data: quota } = useQuery({
    queryKey: ["search-quota"],
    queryFn: getSearchQuota,
  });
  const { data: history } = useQuery({
    queryKey: ["search-history"],
    queryFn: () => getSearchHistory(30),
  });
  // Each run spends quota, so results are cached for the session: going Back to this
  // page, or repeating a query, reuses them instead of searching again.
  const {
    data: result,
    isFetching: isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["search", submitted],
    queryFn: async () => {
      const r = await searchWithQuota(submitted, undefined, 40);
      if (r.quota) qc.setQueryData(["search-quota"], r.quota);
      qc.invalidateQueries({ queryKey: ["search-history"] });
      return r;
    },
    enabled: !!submitted,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
  });
  const groups = useMemo(() => groupByVideo(result?.matches ?? []), [result]);
  const recent = useMemo(() => {
    const seen = new Set<string>();
    return (history ?? [])
      .filter((h) => {
        const key = h.query.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 6);
  }, [history]);
  const outOfSearches = !!quota && quota.limit >= 0 && quota.remaining <= 0;

  const quotaError = errorStatus(error) === 429;
  const run = (q: string) => {
    const text = q.trim();
    if (!text || isPending) return;
    setQuery(text);
    // Same query as a failed run (e.g. before more searches were granted): try it again.
    if (text === submitted && isError) refetch();
    else setParams({ q: text });
  };
  // A 429 means our cached quota is stale; refresh it so "Request more" can appear.
  useEffect(() => {
    if (quotaError) qc.invalidateQueries({ queryKey: ["search-quota"] });
  }, [quotaError, qc]);

  return (
    <div className="search-page">
      <PageHeader
        eyebrow="SEE YOUR FOOTAGE DIFFERENTLY"
        title="Find the moment."
        description="Describe what you remember. We’ll find where it happens."
        action={
          quota ? (
            <span
              className={
                outOfSearches
                  ? "status-badge status-failed"
                  : "status-badge status-completed"
              }
              title={
                quota.limit >= 0 ? `Resets ${resetLabel(quota)}` : undefined
              }
            >
              <Sparkles size={11} /> {quotaLabel(quota)}
            </span>
          ) : (
            <span className="status-badge status-completed">
              <Sparkles size={11} /> Visual search
            </span>
          )
        }
      />
      <form
        className="search-field"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <SearchIcon size={19} />
        <input
          id={SEARCH_INPUT_ID}
          autoFocus
          aria-label="Describe a moment"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A scene, a color, a feeling. What are you looking for?"
          maxLength={500}
        />
        <Button
          className="studio-button"
          disabled={isPending || !query.trim() || outOfSearches}
          type="submit"
        >
          {isPending ? "Searching…" : "Search"}
          <ArrowRight />
        </Button>
      </form>
      <div className="search-suggestions">
        {recent.length ? (
          <>
            <span className="flex items-center gap-1.5">
              <History size={11} /> RECENT
            </span>
            {recent.map((h) => (
              <button
                key={h.search_id}
                className="suggestion"
                disabled={isPending || outOfSearches}
                onClick={() => run(h.query)}
                title={`${h.results_count} results last time`}
              >
                {h.query}
                <ArrowUpRight size={10} />
              </button>
            ))}
          </>
        ) : (
          <>
            <span>A LITTLE INSPIRATION</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="suggestion"
                disabled={isPending || outOfSearches}
                onClick={() => run(s)}
              >
                {s}
                <ArrowUpRight size={10} />
              </button>
            ))}
          </>
        )}
      </div>
      {(outOfSearches || quotaError) && (
        <RequestMoreSearches
          onGranted={() => {
            // Finish the search that was blocked.
            if (quotaError && submitted) refetch();
          }}
        />
      )}
      {isError && !quotaError && (
        <div className="error-state" role="alert">
          Search is temporarily unavailable. Please try again.
        </div>
      )}
      {isPending && (
        <div role="status">
          <div className="section-caption">
            <span>Finding the frames that matter…</span>
            <ScanLine size={16} className="animate-pulse" />
          </div>
          <div className="media-grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton aspect-video" />
            ))}
          </div>
        </div>
      )}
      {!submitted && (
        <>
          <div className="search-intro">
            <div className="search-orbit" aria-hidden="true">
              <div />
              <div />
              <div>
                <Focus size={29} strokeWidth={1} />
              </div>
            </div>
            <h2>There’s a frame for that.</h2>
            <p>
              Search across your processed videos with natural language. No
              tags, filenames, or perfect memory required.
            </p>
          </div>
          <div className="search-footer">
            <div>
              <Image size={18} strokeWidth={1.5} />
              <h3>Think visually</h3>
              <p>Describe a scene, object, color, or action.</p>
            </div>
            <div>
              <ScanLine size={18} strokeWidth={1.5} />
              <h3>Find the right frame</h3>
              <p>Your most relevant moments appear first.</p>
            </div>
            <div>
              <ArrowUpRight size={18} strokeWidth={1.5} />
              <h3>Pick up from there</h3>
              <p>Open a result to jump straight into the video.</p>
            </div>
          </div>
        </>
      )}
      {!isPending && result && (
        <>
          <div className="search-results-heading">
            <strong>
              {groups.length
                ? `Results for “${submitted}”`
                : "No matching moments yet"}
            </strong>
            <span>
              {groups.length} {groups.length === 1 ? "video" : "videos"} ·{" "}
              {result.matches.length}{" "}
              {result.matches.length === 1 ? "shot" : "shots"} · Best matches first
            </span>
          </div>
          {groups.length ? (
            <div className="media-grid">
              {groups.map((g) => (
                <div className="media-card result-card" key={g.video_id}>
                  <button
                    className="block w-full text-left"
                    onClick={() =>
                      navigate(
                        `/videos/${g.video_id}?t=${g.best.timestamp_seconds}`,
                      )
                    }
                  >
                    <div className="media-card-preview">
                      <MediaThumbnail src={g.best.frame_url} />
                      <div className="preview-shade" />
                      <span className="preview-play">
                        <Play size={15} fill="currentColor" />
                      </span>
                      <span className="timecode">
                        {momentLabel(g.best)}
                      </span>
                    </div>
                    <div className="media-card-info">
                      <span className="media-card-title">{g.video_title}</span>
                      <div className="media-card-meta">
                        <span>
                          Best match {Math.round(g.best.score * 100)}% visual
                          similarity
                          {(g.best.match_count ?? 1) > 1 &&
                            ` · ${g.best.match_count} frames`}
                        </span>
                        <ArrowUpRight size={13} />
                      </div>
                    </div>
                  </button>
                  {g.best.shot_start_seconds != null &&
                    g.best.shot_end_seconds != null && (
                      <Link
                        className="result-clip-link"
                        to={`/videos/${g.video_id}?t=${g.best.shot_start_seconds}&clip=${clipParam(g.best.shot_start_seconds, g.best.shot_end_seconds)}`}
                        aria-label={`Clip the ${momentLabel(g.best)} shot of ${g.video_title}`}
                      >
                        <Scissors size={12} /> Clip this shot
                      </Link>
                    )}
                  {(g.total ?? g.moments.length) > 1 && (
                    <div className="result-moments" aria-label="Other moments">
                      <span>
                        {g.total ?? g.moments.length}{" "}
                        {g.best.shot_index != null ? "SHOTS" : "MOMENTS"}
                      </span>
                      {g.moments.map((m) => (
                        <Link
                          key={m.timestamp_seconds}
                          className={
                            m === g.best ? "moment-chip is-best" : "moment-chip"
                          }
                          to={`/videos/${g.video_id}?t=${m.timestamp_seconds}`}
                          aria-label={`Open ${g.video_title} at ${momentLabel(m)}`}
                        >
                          {momentLabel(m)}
                        </Link>
                      ))}
                      {(g.total ?? 0) > g.moments.length && (
                        <span>+{(g.total ?? 0) - g.moments.length} weaker</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <SearchIcon size={22} />
              </div>
              <h2>Try another way of seeing it.</h2>
              <p>
                Use a simple description, or check that your videos have
                finished processing.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
