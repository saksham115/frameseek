import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { getPaymentConfig, listPlans, startCheckout } from "@/api/subscriptions";
import type { Plan } from "@/api/types";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";

const Paywall = () => {
  const { user } = useAuth();
  const { data: paymentConfig, isLoading: paymentsLoading } = useQuery({
    queryKey: ["payment-config"], queryFn: getPaymentConfig,
  });
  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans"], queryFn: listPlans, enabled: paymentConfig?.payments_enabled === true,
  });

  const checkout = useMutation<string, unknown, string>({
    mutationFn: (priceId) => startCheckout(priceId),
    onSuccess: (url) => (window.location.href = url),
    onError: () => toast.error("Couldn’t start checkout."),
  });

  const features = (p: Plan) => [
    `${p.storage_gb} GB storage`,
    `${p.monthly_searches.toLocaleString()} searches / month`,
  ];

  if (paymentsLoading) return <p className="text-center text-muted-foreground">Loading plans…</p>;

  if (!paymentConfig?.payments_enabled) {
    return (
      <div className="max-w-xl mx-auto text-center space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Payments are currently unavailable</h1>
        <p className="text-muted-foreground">You can continue using FrameSeek on your current plan.</p>
        <Button asChild><Link to="/">Back to library</Link></Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold tracking-tight text-center mb-2">Choose your plan</h1>
      <p className="text-muted-foreground text-center mb-10">Upgrade any time. Cancel any time.</p>

      {isLoading ? (
        <div className="grid sm:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-80 rounded-2xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 gap-5">
          {plans?.map((p) => {
            const current = user?.plan === p.id;
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-border bg-card p-6 flex flex-col data-[featured=true]:border-primary"
                data-featured={p.id === "pro"}
              >
                <h2 className="text-xl font-bold">{p.name}</h2>
                <ul className="mt-6 space-y-3 flex-1">
                  {features(p).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6"
                  variant={p.id === "pro" ? "default" : "outline"}
                  disabled={current || !p.price_id || checkout.isPending}
                  onClick={() => p.price_id && checkout.mutate(p.price_id)}
                >
                  {current ? "Current plan" : p.price_id ? "Upgrade" : p.id === "free" ? "Free" : "Currently unavailable"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Paywall;
