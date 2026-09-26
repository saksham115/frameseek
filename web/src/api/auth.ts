import { api } from "./client";
import { mapUser, type User } from "./types";

export async function acceptTerms(): Promise<User> {
  const { data } = await api.post("/auth/accept-tos", { accepted: true });
  return mapUser(data as never);
}

export async function completeTour(): Promise<User> {
  const { data } = await api.post("/auth/tour-complete");
  return mapUser(data as never);
}
