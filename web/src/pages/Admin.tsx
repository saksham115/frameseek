import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  addAdmin,
  getAdminUsers,
  getAdmins,
  getFeedback,
  getOverview,
  removeAdmin,
  type AdminEntry,
  type AdminOverview,
} from "@/api/admin";
import { PageHeader } from "@/components/MediaUI";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import WorldMap, { countryName, countryRegion } from "@/components/admin/WorldMap";
import { apiErrorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import "@/admin.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "feedback", label: "Feedback" },
  { id: "admins", label: "Admins" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const RANGES = [7, 30, 90] as const;

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-IN");
const pct = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const ago = (d: string | null) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true }) : "Never");

function Panel({ title, note, children, className }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("admin-panel", className)}>
      <header>
        <h2>{title}</h2>
        {note && <span>{note}</span>}
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "good" }) {
  return (
    <div className={cn("admin-stat", tone && `is-${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <em>{sub}</em>}
    </div>
  );
}

function Bars({ rows, total }: { rows: { label: string; value: number; hint?: string }[]; total?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="admin-empty">Nothing yet.</p>;
  return (
    <ul className="admin-bars">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="admin-bar-label">
            <span title={r.label}>{r.label}</span>
            <b>
              {num(r.value)}
              {total ? <em> · {Math.round((r.value / total) * 100)}%</em> : null}
            </b>
          </div>
          <div className="admin-bar-track">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.hint && <small>{r.hint}</small>}
        </li>
      ))}
    </ul>
  );
}

const chartTip = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
    color: "hsl(var(--popover-foreground))",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 4 },
};

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as Tab) : "overview";
  const days = RANGES.includes(Number(params.get("days")) as 7) ? Number(params.get("days")) : 30;
  const set = (next: Record<string, string>) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) (v ? p.set(k, v) : p.delete(k));
      return p;
    }, { replace: true });

  const overview = useQuery({
    queryKey: ["admin", "overview", days],
    queryFn: () => getOverview(days),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  return (
    <div className="library-page admin-page">
      <PageHeader
        eyebrow="FRAMESEEK ADMIN"
        title="Admin dashboard"
        description={
          overview.data
            ? `Live usage across FrameSeek. Updated ${ago(overview.data.generated_at)}.`
            : "Live usage across FrameSeek."
        }
        action={
          <div className="admin-actions">
            <div className="view-toggle" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r} className={cn("admin-range", days === r && "active")} aria-pressed={days === r}
                  onClick={() => set({ days: r === 30 ? "" : String(r) })}>
                  {r} days
                </button>
              ))}
            </div>
            <Button variant="outline" className="studio-button" onClick={() => overview.refetch()} disabled={overview.isFetching}>
              <RefreshCw className={cn(overview.isFetching && "animate-spin")} /> Refresh
            </Button>
          </div>
        }
      />
      <div className="library-toolbar">
        <div className="filter-tabs" aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t.id} className={cn(tab === t.id && "active")} aria-pressed={tab === t.id}
              onClick={() => set({ tab: t.id === "overview" ? "" : t.id })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "overview" &&
        (overview.isError ? (
          <div className="error-state" role="alert">
            {apiErrorMessage(overview.error, "We couldn’t load the dashboard.")}{" "}
            <button className="underline ml-2" onClick={() => overview.refetch()}>Try again</button>
          </div>
        ) : !overview.data ? (
          <div className="admin-loading"><Loader2 className="animate-spin" size={18} /></div>
        ) : (
          <Overview data={overview.data} />
        ))}
      {tab === "users" && <UsersTab />}
      {tab === "feedback" && <FeedbackTab />}
      {tab === "admins" && <AdminsTab />}
    </div>
  );
}

// ------------------------------------------------------------------ overview

function Overview({ data }: { data: AdminOverview }) {
  const { users, content, searches, creations, renders } = data;
  const daily = data.daily.map((d) => ({ ...d, label: dayLabel(d.day) }));
  const counts = useMemo(() => Object.fromEntries(data.countries.map((c) => [c.code, c.users])), [data.countries]);
  const regions = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of data.countries) m[countryRegion(c.code)] = (m[countryRegion(c.code)] ?? 0) + c.users;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }, [data.countries]);
  const known = users.total - users.unknown_country;
  const storagePct = content.storage_limit_bytes ? content.storage_bytes / content.storage_limit_bytes : 0;
  const range = `${data.days} days`;

  return (
    <div className="admin-overview">
      <div className="admin-stats">
        <Stat label="Users" value={num(users.total)} sub={`+${num(users.new_in_range)} in ${range}`} />
        <Stat label="Active today" value={num(users.active_1d)} sub={`${num(users.active_7d)} this week · ${num(users.active_30d)} this month`} />
        <Stat label="Videos" value={num(content.videos)} sub={`${num(content.uploaded_in_range)} uploaded in ${range}`} />
        <Stat label="Hours indexed" value={content.hours.toFixed(1)} sub={`avg ${content.avg_minutes.toFixed(1)} min per video`} />
        <Stat label="Storage used" value={formatBytes(content.storage_bytes)} sub={`${(storagePct * 100).toFixed(1)}% of allocated`} />
        <Stat label="Searches" value={num(searches.in_range)} sub={`${num(searches.searchers_in_range)} people · ${range}`} />
        <Stat label="Creations" value={num(creations.total)} sub={`${num(creations.drafts)} drafts · ${num(creations.rendered)} rendered`} />
        <Stat
          label="Render success"
          value={pct(renders.success_rate)}
          sub={`${num(renders.ready_in_range)} ready · ${num(renders.failed_in_range)} failed`}
          tone={renders.success_rate != null && renders.success_rate < 0.9 ? "warn" : undefined}
        />
      </div>

      <div className="admin-grid two">
        <Panel title="Signups and active users" note={`Daily, last ${range}`}>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip {...chartTip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="active" name="Active users" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.18)" strokeWidth={2} />
                <Bar dataKey="signups" name="Signups" fill="hsl(var(--foreground) / 0.55)" radius={[3, 3, 0, 0]} maxBarSize={14} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Activity" note={`Daily, last ${range}`}>
          <div className="admin-chart">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <Tooltip {...chartTip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="searches" name="Searches" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="videos" name="Uploads" stroke="#60a5fa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="ready" name="Renders" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        title="Where users are"
        note={
          <>
            {num(known)} of {num(users.total)} located
            {users.unknown_country ? " · the rest are added on their next visit" : ""}
          </>
        }
      >
        {!data.geo_enabled && (
          <p className="admin-callout">The IP-to-country database isn’t installed on this server, so new countries can’t be recorded yet.</p>
        )}
        <div className="admin-geo">
          <WorldMap counts={counts} />
          <div className="admin-geo-side">
            <table className="admin-table compact">
              <thead>
                <tr><th>Country</th><th>Users</th><th>Active 30d</th><th>New</th></tr>
              </thead>
              <tbody>
                {data.countries.slice(0, 10).map((c) => (
                  <tr key={c.code}>
                    <td>{countryName(c.code)}</td>
                    <td>{num(c.users)}</td>
                    <td>{num(c.active_30d)}</td>
                    <td>{num(c.new_in_range)}</td>
                  </tr>
                ))}
                {!data.countries.length && (
                  <tr><td colSpan={4} className="admin-empty">Countries appear as people sign in.</td></tr>
                )}
              </tbody>
            </table>
            <div className="admin-subgrid">
              <div>
                <h3>Regions</h3>
                <Bars rows={regions} total={known} />
              </div>
              <div>
                <h3>Timezones</h3>
                <Bars rows={data.timezones.slice(0, 6).map((t) => ({ label: t.tz.replace(/_/g, " "), value: t.users }))} />
              </div>
            </div>
          </div>
        </div>
        <p className="admin-footnote">
          Country from each user’s IP at sign-in (the IP itself isn’t stored).{" "}
          <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">IP Geolocation by DB-IP</a>.
        </p>
      </Panel>

      <div className="admin-grid three">
        <Panel title="Users">
          <div className="admin-kv">
            <Stat label="New this week" value={num(users.new_7d)} />
            <Stat label="Uploaded a video" value={pct(users.total ? users.with_videos / users.total : null)} sub={`${num(users.with_videos)} people`} />
            <Stat label="Made a creation" value={pct(users.total ? users.with_creations / users.total : null)} sub={`${num(users.with_creations)} people`} />
            <Stat label="Haven’t accepted terms" value={num(users.terms_pending)} />
          </div>
          <h3>Plans</h3>
          <Bars rows={data.plans.map((p) => ({ label: p.plan === "pro_max" ? "Pro Max" : p.plan[0].toUpperCase() + p.plan.slice(1), value: p.users }))} total={users.total} />
        </Panel>
        <Panel title="Videos and processing">
          <div className="admin-kv">
            <Stat label="Ready" value={num(content.ready)} />
            <Stat label="Processing now" value={num(content.in_progress)} />
            <Stat label="Need attention" value={num(content.failed)} sub={`${num(content.failed_in_range)} in ${range}`} tone={content.failed ? "warn" : undefined} />
            <Stat label="Avg processing" value={`${content.avg_processing_minutes.toFixed(1)} min`} />
            <Stat label="With transcript" value={pct(content.videos ? content.transcribed / content.videos : null)} />
            <Stat label="Frames indexed" value={num(content.frames)} />
          </div>
        </Panel>
        <Panel title="Search">
          <div className="admin-kv">
            <Stat label="All-time searches" value={num(searches.total)} />
            <Stat label="Avg response" value={`${(searches.avg_ms / 1000).toFixed(2)} s`} />
            <Stat label="No results" value={pct(searches.zero_result_rate)} tone={searches.zero_result_rate > 0.2 ? "warn" : undefined} />
            <Stat label="Asked for more" value={num(searches.quota_requests_in_range)} sub={`requests in ${range}`} />
          </div>
        </Panel>
      </div>

      <div className="admin-grid three">
        <Panel title="Templates" note="Creations · rendered">
          <Bars rows={data.templates.map((t) => ({ label: t.name, value: t.creations, hint: `${num(t.rendered)} rendered` }))} />
        </Panel>
        <Panel title="Rendering">
          <div className="admin-kv">
            <Stat label={`Renders in ${range}`} value={num(renders.in_range)} />
            <Stat label="Rendering now" value={num(renders.active)} />
            <Stat label="Avg render time" value={`${Math.round(renders.avg_seconds)} s`} />
            <Stat label="Minutes rendered" value={renders.minutes_rendered.toFixed(1)} sub={`${num(renders.hd)} in 1080p`} />
          </div>
          <h3>Formats</h3>
          <Bars rows={data.formats.map((f) => ({ label: f.format ?? "Unknown", value: f.creations }))} total={creations.total} />
        </Panel>
        <Panel title="Music">
          <Bars
            rows={[
              { label: "Stock library", value: data.music.stock },
              { label: "Own uploads", value: data.music.own },
              { label: "No music", value: data.music.none },
            ]}
            total={creations.total}
          />
        </Panel>
      </div>

      <div className="admin-grid two">
        <Panel title="Feedback" note={`${num(data.feedback.in_range)} in ${range} · ${num(data.feedback.total)} all time`}>
          <Bars rows={data.feedback.by_category.map((c) => ({ label: c.category, value: c.n }))} />
        </Panel>
        <Panel title="Account deletions" note={`${num(data.deletions.in_range)} in ${range} · ${num(data.deletions.total)} all time`}>
          <Bars rows={data.deletions.reasons.map((r) => ({ label: r.reason.replace(/_/g, " "), value: r.n }))} />
        </Panel>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ users

const SORTS = [
  { id: "joined", label: "Newest" },
  { id: "last_seen", label: "Recently active" },
  { id: "storage", label: "Most storage" },
  { id: "videos", label: "Most videos" },
  { id: "searches", label: "Most searches" },
  { id: "creations", label: "Most creations" },
];

function UsersTab() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("joined");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin", "users", query, sort, page],
    queryFn: () => getAdminUsers({ q: query, sort, page }),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <section className="admin-panel">
      <div className="admin-table-tools">
        <label className="library-find">
          <Search size={13} />
          <input type="search" placeholder="Name, email or country (IN)" value={q} maxLength={200}
            aria-label="Search users" onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="studio-select" aria-label="Sort users" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span className="admin-count">{data ? `${num(data.total)} users` : ""}{isFetching && !isLoading ? " · updating" : ""}</span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th><th>Country</th><th>Plan</th><th>Joined</th><th>Last seen</th>
              <th className="num">Videos</th><th className="num">Storage</th><th className="num">Searches</th>
              <th className="num">Creations</th><th className="num">Renders</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="admin-empty"><Loader2 className="animate-spin inline" size={14} /></td></tr>
            )}
            {data?.users.map((u) => (
              <tr key={u.user_id}>
                <td>
                  <div className="admin-user">
                    <strong>{u.name}</strong>
                    <span>{u.email}</span>
                  </div>
                </td>
                <td title={u.timezone ?? undefined}>{u.country_code ? countryName(u.country_code) : "–"}</td>
                <td>{u.plan_type === "pro_max" ? "Pro Max" : u.plan_type[0].toUpperCase() + u.plan_type.slice(1)}</td>
                <td title={new Date(u.created_at).toLocaleString()}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>{ago(u.last_seen_at)}</td>
                <td className="num">{num(u.videos)}</td>
                <td className="num">{formatBytes(u.storage_used_bytes)}</td>
                <td className="num">{num(u.searches)}</td>
                <td className="num">{num(u.creations)}</td>
                <td className="num">{num(u.renders)}</td>
              </tr>
            ))}
            {data && !data.users.length && (
              <tr><td colSpan={10} className="admin-empty">No users match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} onPage={setPage} />
    </section>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="admin-pager">
      <span>Page {page} of {pages}</span>
      <button className="icon-button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={15} />
      </button>
      <button className="icon-button" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ feedback

function FeedbackTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "feedback", page],
    queryFn: () => getFeedback(page),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <section className="admin-panel">
      {isLoading && <div className="admin-loading"><Loader2 className="animate-spin" size={18} /></div>}
      {data && !data.feedback.length && <p className="admin-empty">No feedback yet.</p>}
      <ul className="admin-feedback">
        {data?.feedback.map((f) => (
          <li key={f.feedback_id}>
            <div className="admin-feedback-meta">
              <span className="admin-chip">{f.category}</span>
              <span>{f.email ?? "Deleted account"}</span>
              {f.page && <code>{f.page}</code>}
              <time title={new Date(f.created_at).toLocaleString()}>{ago(f.created_at)}</time>
            </div>
            <p>{f.message}</p>
          </li>
        ))}
      </ul>
      <Pager page={page} pages={pages} onPage={setPage} />
    </section>
  );
}

// ------------------------------------------------------------------ admins

function AdminsTab() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [email, setEmail] = useState("");
  const [removing, setRemoving] = useState<AdminEntry | null>(null);
  const { data: admins, isLoading } = useQuery({ queryKey: ["admin", "admins"], queryFn: getAdmins });
  const add = useMutation({
    mutationFn: () => addAdmin(email.trim()),
    onSuccess: (list) => {
      qc.setQueryData(["admin", "admins"], list);
      toast.success(`${email.trim()} is now an admin.`);
      setEmail("");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t add that admin.")),
  });
  const remove = useMutation({
    mutationFn: (a: AdminEntry) => removeAdmin(a.email),
    onSuccess: (list, a) => {
      qc.setQueryData(["admin", "admins"], list);
      toast.success(`${a.email} is no longer an admin.`);
      setRemoving(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t remove that admin.")),
  });
  const mine = me?.email.toLowerCase();

  return (
    <section className="admin-panel">
      <header>
        <h2>Admins</h2>
        <span>Admins sign in with their Google account and see this dashboard.</span>
      </header>
      <form
        className="admin-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) add.mutate();
        }}
      >
        <input id="admin-email" type="email" required placeholder="name@gmail.com" value={email} maxLength={255}
          aria-label="Email of the new admin" onChange={(e) => setEmail(e.target.value)} />
        <Button className="studio-button" type="submit" disabled={add.isPending || !email.trim()}>
          {add.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Add admin
        </Button>
      </form>
      <p className="admin-footnote">They get access the next time they open FrameSeek with that Google account.</p>
      {isLoading && <div className="admin-loading"><Loader2 className="animate-spin" size={18} /></div>}
      <ul className="admin-list">
        {admins?.map((a) => (
          <li key={a.email}>
            <ShieldCheck size={16} />
            <div>
              <strong>
                {a.name ?? a.email}
                {a.email === mine && <em> (you)</em>}
              </strong>
              <span>
                {a.name ? `${a.email} · ` : ""}
                {a.source === "config" ? "Set in server config" : `Added by ${a.added_by ?? "an admin"} ${ago(a.created_at)}`}
                {!a.has_account && " · hasn’t signed in yet"}
              </span>
            </div>
            {a.source === "dashboard" && a.email !== mine ? (
              <button className="icon-button" aria-label={`Remove ${a.email}`} onClick={() => setRemoving(a)}>
                <Trash2 size={14} />
              </button>
            ) : (
              <span className="admin-lock" title={a.source === "config" ? "Change ADMIN_EMAILS in the server config" : "Ask another admin to remove you"}>
                {a.source === "config" ? "Config" : "You"}
              </span>
            )}
          </li>
        ))}
      </ul>
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this admin?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.email} will lose access to the admin dashboard. Their FrameSeek account stays as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
