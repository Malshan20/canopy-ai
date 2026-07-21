"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Loader2, Mail } from "lucide-react";

import { fetchOrganizationProfile } from "@/services/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { APP_NAME, SALES_EMAIL } from "@/constants/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CheckState = "checking" | "needs-org" | "already-has-org";

/**
 * Reached from `login-form.tsx` when someone authenticates but has no
 * organization membership — normally shouldn't happen for an invite-only
 * product (every real account is created already attached to an
 * organization), but a real edge case is worth landing somewhere sensible
 * rather than a broken dashboard: an invitation that didn't fully
 * complete, a removed membership, etc.
 *
 * This used to be a self-serve "name your organization" form that called
 * the same `createOrganization` endpoint `signup-form.tsx` did — the same
 * unauthorized-account-creation problem, just reached from a different
 * entry point. That endpoint no longer exists; this is now the same
 * honest "talk to a real person" state as the signup page.
 */
export function OnboardingForm() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [checkState, setCheckState] = useState<CheckState>("checking");

  useEffect(() => {
    fetchOrganizationProfile().then((result) => {
      setCheckState(result.ok ? "already-has-org" : "needs-org");
      if (result.ok) {
        router.push("/dashboard");
      }
    });
  }, [router]);

  if (checkState === "checking" || checkState === "already-has-org") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10">
            <Leaf className="size-5.5 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{APP_NAME}</h1>
          {user?.email && <p className="mt-1 text-sm text-muted-foreground">Signed in as {user.email}</p>}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>No workspace found</CardTitle>
            <CardDescription>
              Your account isn&apos;t attached to a workspace yet. {APP_NAME} workspaces are set up
              by our team — reach out and we&apos;ll sort it out.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="lg" className="w-full">
              <a href={`mailto:${SALES_EMAIL}`}>
                <Mail />
                Email {SALES_EMAIL}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
