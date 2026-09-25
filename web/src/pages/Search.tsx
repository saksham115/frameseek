import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Search as SearchIcon, ArrowRight } from "lucide-react";
import { search } from "@/api/search";
import type { SearchMatch } from "@/api/types";
import { formatTimestamp } from "@/lib/format";

const SUGGESTIONS = ["person holding a red cup", "sunset on the beach", "someone laughing", "a whiteboard with text"];

const Search = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const { mutate, data: matches, isPending, isError } = useMutation<SearchMatch[], unknown, string>({
    mutationFn: (q) => search(q),
  });

  const run = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    mutate(trimmed);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight text-center mb-2">Search your videos</h1>
      <p className="text-muted-foreground text-center mb-8">Describe the moment — we’ll find the exact frame.</p>

      <div className="search-bar">
        <SearchIcon className="h-5 w-5 shrink-0" style={{ color: "var(--cream-mid)" }} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(query)}
          placeholder="What are you looking for?"
        />
        <button className="search-btn" onClick={() => run(query)}>
          Search <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 justify-center mt-5">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s}
            className="hero-tag"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => run(s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-10">
        {isError && <p role="alert" className="text-center text-destructive">Search is temporarily unavailable. Please try again later.</p>}
        {isPending && <p className="text-center text-muted-foreground font-mono text-sm animate-pulse">Searching…</p>}
        {matches && matches.length === 0 && (
          <p className="text-center text-muted-foreground">No matches. Try describing it differently.</p>
        )}
        {matches && matches.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {matches.map((m, i) => (
              <button
                key={`${m.video_id}-${m.timestamp_seconds}-${i}`}
                onClick={() => navigate(`/videos/${m.video_id}?t=${Math.floor(m.timestamp_seconds)}`)}
                className="group text-left rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary"
              >
                <div className="aspect-video bg-secondary relative">
                  <img src={m.frame_url} alt="" className="h-full w-full object-cover" />
                  <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">
                    {formatTimestamp(m.timestamp_seconds)}
                  </span>
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{m.video_title}</p>
                  <p className="text-xs text-muted-foreground">{Math.round(m.score * 100)}% match</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;
