import { QueryClient } from "@tanstack/react-query";

// Shared so non-React code (e.g. the background upload queue) can invalidate caches.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
