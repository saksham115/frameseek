import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Focus,
  Image,
  ScanLine,
  Search as SearchIcon,
  Sparkles,
} from "lucide-react";
import { search } from "@/api/search";
import { Button } from "@/components/ui/button";
import { MediaThumbnail, PageHeader } from "@/components/MediaUI";
import { formatTimestamp } from "@/lib/format";

const SUGGESTIONS = [
  "A person by the ocean",
  "Golden hour light",
  "Someone laughing",
  "A city at night",
];
export default function Search() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const {
    mutate,
    data: matches,
    variables,
    isPending,
    isError,
    isIdle,
  } = useMutation({ mutationFn: (q: string) => search(q) });
  const run = (q: string) => {
    if (!q.trim() || isPending) return;
    setQuery(q.trim());
    mutate(q.trim());
  };
  return (
    <div className="search-page">
      <PageHeader
        eyebrow="SEE YOUR FOOTAGE DIFFERENTLY"
        title="Find the moment."
        description="Describe what you remember. We’ll find where it happens."
        action={
          <span className="status-badge status-completed">
            <Sparkles size={11} /> Visual search
          </span>
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
          autoFocus
          aria-label="Describe a moment"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="A scene, a color, a feeling. What are you looking for?"
          maxLength={500}
        />
        <Button
          className="studio-button"
          disabled={isPending || !query.trim()}
          type="submit"
        >
          {isPending ? "Searching…" : "Search"}
          <ArrowRight />
        </Button>
      </form>
      <div className="search-suggestions">
        <span>A LITTLE INSPIRATION</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="suggestion"
            disabled={isPending}
            onClick={() => setQuery(s)}
          >
            {s}
            <ArrowUpRight size={10} />
          </button>
        ))}
      </div>
      {isError && (
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
      {isIdle && (
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
      {!isPending && !isError && matches && (
        <>
          <div className="search-results-heading">
            <strong>
              {matches.length
                ? `Results for “${variables}”`
                : "No matching moments yet"}
            </strong>
            <span>{matches.length} frames · Best matches first</span>
          </div>
          {matches.length ? (
            <div className="media-grid">
              {matches.map((m, i) => (
                <button
                  className="media-card result-card"
                  key={`${m.video_id}-${m.timestamp_seconds}-${i}`}
                  onClick={() =>
                    navigate(`/videos/${m.video_id}?t=${m.timestamp_seconds}`)
                  }
                >
                  <div className="media-card-preview">
                    <MediaThumbnail src={m.frame_url} />
                    <div className="preview-shade" />
                    <span className="timecode">
                      {formatTimestamp(m.timestamp_seconds)}
                    </span>
                  </div>
                  <div className="media-card-info">
                    <span className="media-card-title">{m.video_title}</span>
                    <div className="media-card-meta">
                      <span>
                        Visual similarity {Math.round(m.score * 100)}%
                      </span>
                      <ArrowUpRight size={13} />
                    </div>
                  </div>
                </button>
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
