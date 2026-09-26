import { api } from "./client";

export type FeedbackCategory = "idea" | "problem" | "other";

export async function sendFeedback(input: {
  category: FeedbackCategory;
  message: string;
  page?: string;
}): Promise<void> {
  await api.post("/feedback", input);
}
