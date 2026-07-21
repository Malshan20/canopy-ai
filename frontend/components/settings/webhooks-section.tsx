"use client";

import { useEffect, useState } from "react";
import { Webhook as WebhookIcon, Copy, Check, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createWebhook, deleteWebhook, fetchWebhooks } from "@/services/api";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { WebhookResponse } from "@/types/webhook";

/**
 * Real webhook management — CanoryAI's honest answer to "ERP
 * integrations" (see backend/app/models/webhook.py's docstring): a
 * signed HTTP POST fired at `shipment.completed`, not a named connector
 * to any specific vendor system. The customer's own middleware (which
 * could itself be a real SAP/NetSuite/etc. connector, built by them or a
 * systems integrator) receives it and does whatever's specific to their
 * system.
 */
export function WebhooksSection() {
  const [webhooks, setWebhooks] = useState<WebhookResponse[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchWebhooks().then((result) => {
      if (result.ok) {
        setWebhooks(result.data);
      } else {
        toast.error("Could not load webhooks", { description: result.error.message });
      }
      setIsLoading(false);
    });
  }, []);

  async function refresh() {
    const result = await fetchWebhooks();
    if (result.ok) setWebhooks(result.data);
  }

  async function handleCreate() {
    if (!newUrl.trim()) return;
    setIsCreating(true);
    const result = await createWebhook(newUrl.trim());
    setIsCreating(false);

    if (!result.ok) {
      toast.error("Could not create webhook", { description: result.error.message });
      return;
    }

    setRevealedSecret(result.data.secret);
    setNewUrl("");
    await refresh();
  }

  async function handleCopy() {
    if (!revealedSecret) return;
    await navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeCreateDialog() {
    setIsCreateOpen(false);
    setRevealedSecret(null);
    setCopied(false);
  }

  async function handleDelete(webhook: WebhookResponse) {
    if (!window.confirm(`Delete the webhook for ${webhook.url}?`)) return;

    setDeletingId(webhook.id);
    const result = await deleteWebhook(webhook.id);
    setDeletingId(null);

    if (!result.ok) {
      toast.error("Could not delete webhook", { description: result.error.message });
      return;
    }
    toast.success("Webhook deleted");
    await refresh();
  }

  return (
    <SettingsSection
      title="Webhooks"
      description="Get a signed HTTP notification when a shipment finishes processing — point it at your own ERP integration or automation. Available on Enterprise and Custom plans."
    >
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus />
          Add webhook
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !webhooks || webhooks.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <WebhookIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No webhooks yet. Add one to be notified the moment a shipment&apos;s compliance status is ready.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {webhooks.map((webhook) => (
            <li key={webhook.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <WebhookIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{webhook.url}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {webhook.last_triggered_at ? (
                      <>
                        Last triggered {formatDate(webhook.last_triggered_at)}
                        {webhook.last_status_code !== null && (
                          <Badge
                            variant={webhook.last_status_code < 300 ? "success" : "danger"}
                            className="text-[10px]"
                          >
                            {webhook.last_status_code}
                          </Badge>
                        )}
                      </>
                    ) : (
                      "Never triggered"
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(webhook)}
                disabled={deletingId === webhook.id}
                className="shrink-0 text-danger hover:bg-danger/10 hover:text-danger"
              >
                {deletingId === webhook.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={isCreateOpen} onOpenChange={(open) => (open ? setIsCreateOpen(true) : closeCreateDialog())}>
        <DialogContent>
          {revealedSecret ? (
            <>
              <DialogHeader>
                <DialogTitle>Webhook signing secret</DialogTitle>
                <DialogDescription>
                  Copy this now — CanoryAI never stores the secret in reversible form, so this is the only
                  time it will ever be shown. Use it to verify the <code>X-CanoryAI-Signature</code> header
                  on every delivered payload.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
                  {revealedSecret}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="text-success" /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeCreateDialog}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Add webhook</DialogTitle>
                <DialogDescription>
                  We&apos;ll POST a signed JSON payload here every time a shipment finishes processing.
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="webhook-url">Endpoint URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://your-erp.example.com/webhooks/canoryai"
                  className="mt-1.5"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeCreateDialog}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isCreating || !newUrl.trim()}>
                  {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
                  Add webhook
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
