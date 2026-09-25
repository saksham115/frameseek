import { api } from "./client";
import type { Plan } from "./types";

export async function listPlans(): Promise<Plan[]> {
  const { data } = await api.get<Plan[]>("/subscriptions/plans");
  return data;
}

// Server creates a Stripe Checkout session and returns its URL; the browser redirects there.
export async function startCheckout(priceId: string): Promise<string> {
  const { data } = await api.post<{ url: string }>("/subscriptions/checkout", { price_id: priceId });
  return data.url;
}

export async function openBillingPortal(): Promise<string> {
  const { data } = await api.post<{ url: string }>("/subscriptions/portal");
  return data.url;
}
