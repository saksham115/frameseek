import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  HardDrive,
  ShieldCheck,
  SunMoon,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/store/auth";
import { getPaymentConfig, openBillingPortal } from "@/api/subscriptions";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/MediaUI";
import ThemeToggle from "@/components/ThemeToggle";
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

export default function Settings() {
  const { user, logout } = useAuth();
  const { data: paymentConfig } = useQuery({
    queryKey: ["payment-config"],
    queryFn: getPaymentConfig,
  });
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
  const usedFraction = user?.storage_limit_bytes
    ? Math.min(100, (user.storage_used_bytes / user.storage_limit_bytes) * 100)
    : 0;
  return (
    <div className="settings-layout">
      <PageHeader
        eyebrow="MAKE IT YOURS"
        title="Workspace settings"
        description="Your account, your preferences, your creative space."
      />
      <section className="settings-card">
        <div className="flex items-center gap-3 mb-2">
          <UserRound size={16} className="text-primary" />
          <h2>Account details</h2>
        </div>
        <div className="settings-row">
          <span>Name</span>
          <strong>{user?.name || "Not set"}</strong>
        </div>
        <div className="settings-row">
          <span>Email address</span>
          <strong>{user?.email}</strong>
        </div>
        <div className="settings-row">
          <span>Current plan</span>
          <strong className="capitalize">
            {user?.plan?.replace(/_/g, " ")}
          </strong>
        </div>
        <div className="settings-row">
          <span>Sign-in method</span>
          <strong className="flex items-center gap-2">
            <ShieldCheck size={13} className="text-primary" /> Google
          </strong>
        </div>
      </section>
      <section className="settings-card">
        <div className="flex items-center gap-3 mb-5">
          <HardDrive size={16} className="text-primary" />
          <h2>Workspace storage</h2>
        </div>
        <div className="flex justify-between items-end gap-4">
          <span className="font-mono text-lg">
            {formatBytes(user?.storage_used_bytes ?? 0)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            of {formatBytes(user?.storage_limit_bytes ?? 0)} available
          </span>
        </div>
        <Progress className="mt-4 h-1" value={usedFraction} />
        <p className="mt-4">
          Storage is shared across the videos in your library.
        </p>
      </section>
      <section className="settings-card flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <SunMoon size={16} className="text-primary" />
            <h2>Appearance</h2>
          </div>
          <p>Set the tone for your workspace.</p>
        </div>
        <ThemeToggle />
      </section>
      {paymentConfig?.payments_enabled && (
        <section className="settings-card flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2>Billing & subscription</h2>
            <p className="mt-2">Find the plan that fits your workflow.</p>
          </div>
          <div className="flex gap-2">
            <Button className="studio-button" variant="outline" asChild>
              <Link to="/upgrade">
                View plans <ArrowUpRight />
              </Link>
            </Button>
            <Button
              className="studio-button"
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
            >
              Manage billing
            </Button>
          </div>
        </section>
      )}
      <section className="settings-card">
        <h2>Delete account</h2>
        <p className="mt-2 mb-5">
          Permanently remove your account, videos, and search history. This
          cannot be undone.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="studio-button text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This can’t be undone. All your data will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my account</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteAccount.mutate()}
                disabled={deleteAccount.isPending}
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
}
