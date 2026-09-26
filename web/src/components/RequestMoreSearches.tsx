import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { getSearchQuota, requestMoreSearches } from "@/api/search";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/errors";

export function quotaResetLabel(resetsAt: string | null | undefined) {
  const base = resetsAt ? new Date(resetsAt) : new Date();
  const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return next.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/**
 * Shown only once searches are used up. On the Free plan it offers "Request more"
 * (10 searches, up to 3 times a month); otherwise it says when searches reset.
 */
export default function RequestMoreSearches({
  compact = false,
  onGranted,
}: {
  compact?: boolean;
  onGranted?: () => void;
}) {
  const qc = useQueryClient();
  const { data: quota } = useQuery({ queryKey: ["search-quota"], queryFn: getSearchQuota });
  const grant = useMutation({
    mutationFn: requestMoreSearches,
    onSuccess: (q) => {
      qc.setQueryData(["search-quota"], q);
      toast.success(`${q.remaining} more searches added for this month.`);
      onGranted?.();
    },
    onError: (e) => {
      toast.error(apiErrorMessage(e, "Couldn’t add more searches."));
      qc.invalidateQueries({ queryKey: ["search-quota"] });
    },
  });
  if (!quota || quota.limit < 0 || quota.remaining > 0) return null;

  const left = (quota.requests_max ?? 0) - (quota.requests_used ?? 0);
  return (
    <div className={compact ? "request-more is-compact" : "request-more"} role="alert">
      <div>
        <strong>You’ve used all your searches for this month.</strong>
        <p>
          {quota.can_request_more
            ? `Need a few more? Request 10 extra searches (${left} ${left === 1 ? "request" : "requests"} left this month).`
            : `They reset on ${quotaResetLabel(quota.resets_at)}.`}
        </p>
      </div>
      {quota.can_request_more && (
        <Button
          className="studio-button"
          disabled={grant.isPending}
          onClick={() => grant.mutate()}
        >
          <Plus /> {grant.isPending ? "Adding…" : "Request more"}
        </Button>
      )}
    </div>
  );
}
