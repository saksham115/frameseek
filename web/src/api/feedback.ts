import { api } from "./client";

export type FeedbackCategory = "idea" | "issue" | "feature";

export async function sendFeedback(input: {
  category: FeedbackCategory;
  message: string;
  page?: string;
}): Promise<void> {
  await api.post("/feedback", input);
}
