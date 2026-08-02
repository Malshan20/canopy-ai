"use client";

import { useEffect, useState } from "react";
import { User, UserPlus, Trash2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  fetchTeamMembers,
  inviteTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
} from "@/services/api";
import { useCurrentUser } from "@/hooks/use-current-user";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import type { TeamMember, OrganizationRole } from "@/types/organization";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  compliance_manager: "Compliance Manager",
  viewer: "Viewer",
};

const ASSIGNABLE_ROLES: OrganizationRole[] = ["admin", "compliance_manager", "viewer"];

/**
 * Real team management — invite an existing CanoryAI user by email,
 * change their role, or remove them. All three are real, RLS-scoped,
 * owner/admin-gated backend calls (backend/app/api/v1/organizations.py).
 *
 * This is not an email-invitation flow: no email is sent, because no
 * email-sending service is integrated anywhere in this codebase (same
 * limitation as the "Notification Preferences" section below). If the
 * person hasn't signed up yet, inviting them fails with a clear message
 * rather than silently doing nothing — the real fix is for them to
 * create an account first, then be added here.
 */
export function TeamMembersSection() {
  const { user: currentAuthUser } = useCurrentUser();
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("viewer");
  const [isInviting, setIsInviting] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamMembers().then((result) => {
      if (result.ok) {
        setMembers(result.data);
      } else {
        toast.error("Could not load team members", { description: result.error.message });
      }
      setIsLoading(false);
    });
  }, []);

  async function refresh() {
    const result = await fetchTeamMembers();
    if (result.ok) setMembers(result.data);
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    const result = await inviteTeamMember(inviteEmail.trim(), inviteRole);
    setIsInviting(false);

    if (!result.ok) {
      toast.error("Could not add team member", { description: result.error.message });
      return;
    }

    toast.success(`${result.data.email} added as ${ROLE_LABEL[result.data.role]}`);
    setInviteEmail("");
    setInviteRole("viewer");
    setIsInviteOpen(false);
    await refresh();
  }

  async function handleRoleChange(member: TeamMember, newRole: OrganizationRole) {
    setPendingUserId(member.user_id);
    const result = await updateTeamMemberRole(member.user_id, newRole);
    setPendingUserId(null);

    if (!result.ok) {
      toast.error("Could not change role", { description: result.error.message });
      return;
    }
    toast.success(`${member.email ?? "Member"}'s role updated to ${ROLE_LABEL[newRole]}`);
    await refresh();
  }

  async function handleRemove(member: TeamMember) {
    if (!window.confirm(`Remove ${member.email ?? "this member"} from your organization?`)) return;

    setPendingUserId(member.user_id);
    const result = await removeTeamMember(member.user_id);
    setPendingUserId(null);

    if (!result.ok) {
      toast.error("Could not remove team member", { description: result.error.message });
      return;
    }
    toast.success(`${member.email ?? "Member"} removed`);
    await refresh();
  }

  const isSelf = (member: TeamMember) => member.email === currentAuthUser?.email;

  return (
    <SettingsSection
      title="Team Members"
      description="Everyone with access to this organization's shipments and compliance data."
    >
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setIsInviteOpen(true)}>
          <UserPlus />
          Add member
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !members || members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Could not load team members right now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {members.map((member) => (
            <li key={member.user_id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                  <User className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {member.email ?? member.user_id}
                    {isSelf(member) && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">Joined {formatDate(member.joined_at)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {member.role === "owner" || isSelf(member) ? (
                  <Badge variant={member.role === "owner" ? "info" : "secondary"}>
                    {ROLE_LABEL[member.role] ?? member.role}
                  </Badge>
                ) : (
                  <Select
                    value={member.role}
                    onValueChange={(value) => handleRoleChange(member, value as OrganizationRole)}
                    disabled={pendingUserId === member.user_id}
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {member.role !== "owner" && !isSelf(member) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(member)}
                    disabled={pendingUserId === member.user_id}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    {pendingUserId === member.user_id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3" aria-hidden="true" />
        Adding someone only works if they already have a CanoryAI account — no invitation email is sent
        yet.
      </p>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add team member</DialogTitle>
            <DialogDescription>
              They need to have already signed up for CanoryAI with this email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as OrganizationRole)}>
                <SelectTrigger id="invite-role" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim()}>
              {isInviting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
