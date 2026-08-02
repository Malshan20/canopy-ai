"use client";

import { useEffect, useState } from "react";
import { KeyRound, Copy, Check, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createApiKey, fetchApiKeys, revokeApiKey } from "@/services/api";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
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
import type { ApiKeyResponse } from "@/types/api-key";

/**
 * Real API key management — replaces the "not yet available" placeholder
 * that used to sit here. Create flow shows the plaintext key exactly
 * once (the backend never stores or returns it again — only a SHA-256
 * hash), with an explicit "copy this now" warning. List and revoke are
 * both real, RLS-scoped, owner/admin-gated backend calls — see
 * `backend/app/api/v1/api_keys.py`.
 */
export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyResponse[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function loadKeys() {
    const result = await fetchApiKeys();
    if (result.ok) {
      setKeys(result.data);
    } else {
      toast.error("Could not load API keys", { description: result.error.message });
    }
    setIsLoading(false);
  }

  useEffect(() => {
    fetchApiKeys().then((result) => {
      if (result.ok) {
        setKeys(result.data);
      } else {
        toast.error("Could not load API keys", { description: result.error.message });
      }
      setIsLoading(false);
    });
  }, []);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setIsCreating(true);
    const result = await createApiKey(newKeyName.trim());
    setIsCreating(false);

    if (!result.ok) {
      toast.error("Could not create API key", { description: result.error.message });
      return;
    }

    setRevealedKey(result.data.key);
    setNewKeyName("");
    await loadKeys();
  }

  async function handleCopy() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function closeCreateDialog() {
    setIsCreateOpen(false);
    setRevealedKey(null);
    setCopied(false);
  }

  async function handleRevoke(key: ApiKeyResponse) {
    if (!window.confirm(`Revoke "${key.name}"? Any integration using this key will stop working immediately.`)) {
      return;
    }
    setRevokingId(key.id);
    const result = await revokeApiKey(key.id);
    setRevokingId(null);

    if (!result.ok) {
      toast.error("Could not revoke API key", { description: result.error.message });
      return;
    }

    toast.success(`"${key.name}" revoked`);
    await loadKeys();
  }

  const activeKeys = keys?.filter((k) => k.revoked_at === null) ?? [];

  return (
    <SettingsSection
      title="API Keys"
      description="Programmatic access to the CanoryAI API for ERP integrations and automation. Available on Enterprise and Custom plans."
    >
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus />
          Create API key
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : activeKeys.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No active API keys yet. Create one to connect an ERP system or automation to CanoryAI.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {activeKeys.map((key) => (
            <li key={key.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{key.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {key.key_prefix}••••••••
                    {key.last_used_at ? ` · last used ${formatDate(key.last_used_at)}` : " · never used"}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRevoke(key)}
                disabled={revokingId === key.id}
                className="text-danger hover:bg-danger/10 hover:text-danger"
              >
                {revokingId === key.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={isCreateOpen} onOpenChange={(open) => (open ? setIsCreateOpen(true) : closeCreateDialog())}>
        <DialogContent>
          {revealedKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Your new API key</DialogTitle>
                <DialogDescription>
                  Copy this now — CanoryAI never stores the full key, so this is the only time it will
                  ever be shown.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-foreground">
                  {revealedKey}
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
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  Give it a name that identifies where it&apos;s used, e.g. &quot;SAP integration&quot; or
                  &quot;Nightly sync job&quot;.
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label htmlFor="api-key-name">Name</Label>
                <Input
                  id="api-key-name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="ERP integration"
                  className="mt-1.5"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeCreateDialog}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={isCreating || !newKeyName.trim()}>
                  {isCreating ? <Loader2 className="animate-spin" /> : <Plus />}
                  Create key
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
