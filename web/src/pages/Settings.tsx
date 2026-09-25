import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import { openBillingPortal } from "@/api/subscriptions";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatBytes } from "@/lib/format";

const Settings = () => {
  const { user, logout } = useAuth();

  const portal = useMutation({
    mutationFn: openBillingPortal,
    onSuccess: (url) => (window.location.href = url),
    onError: () => toast.error("Couldn’t open the billing portal."),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api.delete("/auth/me"),
    onSuccess: async () => {
      toast.success("Your account has been deleted.");
      await logout();
    },
    onError: () => toast.error("Account deletion failed."),
  });

  const usedFraction = user ? (user.storage_used_bytes / user.storage_limit_bytes) * 100 : 0;

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
        <p className="mt-4 text-sm">
          Plan: <span className="font-mono text-primary uppercase">{user?.plan}</span>
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Storage</h2>
          <span className="text-sm text-muted-foreground">
            {user && `${formatBytes(user.storage_used_bytes)} / ${formatBytes(user.storage_limit_bytes)}`}
          </span>
        </div>
        <Progress className="mt-3" value={usedFraction} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Billing</h2>
          <p className="text-sm text-muted-foreground">Manage or upgrade your subscription.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/upgrade">Plans</Link>
          </Button>
          <Button onClick={() => portal.mutate()} disabled={portal.isPending}>
            Manage
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-destructive/30 bg-card p-6">
        <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleting your account permanently removes your videos, frames, and search history.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="mt-4">Delete account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This can’t be undone. All your data will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteAccount.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </div>
  );
};

export default Settings;
