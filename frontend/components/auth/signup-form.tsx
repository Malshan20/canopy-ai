import Link from "next/link";
import { Leaf, Mail } from "lucide-react";

import { APP_NAME, SALES_EMAIL } from "@/constants/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * CanoryAI is an invite-only enterprise product — there is deliberately
 * no self-serve signup. This used to be a real form (organization name +
 * work email + password) that called `POST /api/v1/organizations` and
 * let anyone with a Supabase account instantly become the owner of a
 * brand-new organization, with zero approval or invitation. That backend
 * route no longer exists — workspaces are provisioned internally (via
 * the admin panel) and new members join through a real invitation email
 * (see app/invite/). This page is now just a clear, honest redirect to a
 * real person instead of an unauthenticated account-creation flow.
 */
export function SignupForm() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10">
            <Leaf className="size-5.5 text-primary" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">EUDR compliance, automated.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Talk to sales</CardTitle>
            <CardDescription>
              {APP_NAME} is provisioned for your organization by our team — there&apos;s no
              self-serve signup. Reach out and we&apos;ll get your workspace set up.
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

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Already have a workspace?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
