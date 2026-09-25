import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, HardDrive, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getPaymentConfig, listPlans, startCheckout } from "@/api/subscriptions";
import type { Plan } from "@/api/types";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/MediaUI";
import { apiErrorMessage } from "@/lib/errors";
import { formatBytes } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";

const Paywall = () => {
  const { user } = useAuth();
  const { data: paymentConfig, isLoading: paymentsLoading } = useQuery({
    queryKey: ["payment-config"],
    queryFn: getPaymentConfig,
  });
  const {
    data: plans,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["plans"],
    queryFn: listPlans,
    enabled: paymentConfig?.payments_enabled === true,
  });

  const checkout = useMutation<string, unknown, string>({
    mutationFn: (priceId) => startCheckout(priceId),
    onSuccess: (url) => (window.location.href = url),
    onError: (e) => toast.error(apiErrorMessage(e, "Couldn’t start checkout.")),
  });

  const features = (p: Plan) => [
    `${p.storage_gb} GB of video storage`,
    p.monthly_searches < 0
      ? "Unlimited visual searches"
      : `${p.monthly_searches.toLocaleString()} visual searches a month`,
    "Transcripts and clip exports",
  ];

  const header = (
    <PageHeader
      eyebrow="ROOM TO GROW"
      title="Plans for every workflow."
      description="More storage and searches when your library grows. Upgrade or cancel any time."
      action={
        <Button asChild variant="outline" className="studio-button">
          <Link to="/settings">
            <ArrowLeft /> Back to settings
          </Link>
        </Button>
      }
    />
  );

  if (paymentsLoading) {
    return (
      <div>
        {header}
        <div className="plan-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-72" />
          ))}
        </div>
      </div>
    );
  }

  if (!paymentConfig?.payments_enabled) {
    return (
      <div>
        {header}
        <div className="empty-state">
          <div className="empty-icon">
            <Sparkles size={22} strokeWidth={1.3} />
          </div>
          <h2>Upgrades aren’t open yet</h2>
          <p>
            You can keep using FrameSeek on your current plan. To free up space,
            delete videos you no longer need from the library.
          </p>
          <Button asChild className="studio-button mt-6" variant="outline">
            <Link to="/">Back to library</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      {user && (
        <div className="plan-usage">
          <HardDrive size={14} />
          You’re on the <strong className="capitalize">{user.plan.replace(/_/g, " ")}</strong> plan,
          using {formatBytes(user.storage_used_bytes)} of{" "}
          {formatBytes(user.storage_limit_bytes)}.
        </div>
      )}
      {isError ? (
        <div className="error-state" role="alert">
          We couldn’t load plans.{" "}
          <button className="underline ml-2" onClick={() => refetch()}>
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="plan-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-72" />
          ))}
        </div>
      ) : (
        <div className="plan-grid">
          {plans?.map((p) => {
            const current = user?.plan === p.id;
            const featured = p.id === "pro";
            return (
              <section
                key={p.id}
                className={cn(
                  "plan-card",
                  featured && "is-featured",
                  current && "is-current",
                )}
              >
                <div className="plan-card-head">
                  <h2>{p.name}</h2>
                  {current ? (
                    <span className="status-badge status-completed">
                      <Check size={11} /> Current
                    </span>
                  ) : featured ? (
                    <span className="status-badge status-completed">
                      <Sparkles size={11} /> Popular
                    </span>
                  ) : null}
                </div>
                <p className="plan-storage">
                  <strong>{p.storage_gb}</strong> GB
                </p>
                <ul>
                  {features(p).map((f) => (
                    <li key={f}>
                      <Check size={13} /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="studio-button w-full"
                  variant={featured ? "default" : "outline"}
                  disabled={current || !p.price_id || checkout.isPending}
                  onClick={() => p.price_id && checkout.mutate(p.price_id)}
                >
                  {current
                    ? "Your current plan"
                    : p.price_id
                      ? `Upgrade to ${p.name}`
                      : p.id === "free"
                        ? "Included"
                        : "Coming soon"}
                </Button>
              </section>
            );
          })}
        </div>
      )}
      <p className="plan-footnote">
        Payments are handled securely by Stripe. Manage or cancel from Settings →
        Billing at any time.
      </p>
    </div>
  );
};

export default Paywall;
