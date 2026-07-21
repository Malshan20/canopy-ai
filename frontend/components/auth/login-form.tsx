"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Leaf, Loader2, AlertCircle, Building2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { checkSsoDomain, fetchOrganizationProfile } from "@/services/api";
import { APP_NAME } from "@/constants/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Two-step login: email first, then either a password field (the
 * common case) or an immediate redirect to the customer's own SSO
 * provider — decided by services/api.ts's checkSsoDomain(), called the
 * moment they submit their email, before any password field ever
 * renders. See backend/app/services/sso_service.py's module docstring
 * for the honest caveat on how much of the actual SSO redirect has
 * been verified versus built against Supabase's documented API shape.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ssoRedirecting, setSsoRedirecting] = useState(false);

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const domain = email.split("@")[1]?.toLowerCase().trim();
    const ssoResult = domain ? await checkSsoDomain(domain) : null;

    if (ssoResult?.sso_enabled && ssoResult.redirect_url) {
      setSsoRedirecting(true);
      window.location.href = ssoResult.redirect_url;
      return;
    }

    setIsSubmitting(false);
    setStep("password");
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setIsSubmitting(false);
      setError(
        signInError.message === "Invalid login credentials"
          ? "Incorrect email or password. Please try again."
          : signInError.message,
      );
      return;
    }

    // A freshly-confirmed signup has no organization yet — send them to
    // onboarding instead of a dashboard that has nothing to show them.
    // See app/onboarding/page.tsx and this repo's self-serve signup notes.
    const profileResult = await fetchOrganizationProfile();
    setIsSubmitting(false);

    if (!profileResult.ok) {
      router.push("/onboarding");
      router.refresh();
      return;
    }

    const next = searchParams.get("next") || "/dashboard";
    router.push(next);
    router.refresh();
  }

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
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              {step === "email" ? "Enter your work email to get started." : "Enter your password to continue."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ssoRedirecting ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Building2 className="size-6 animate-pulse text-primary" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Redirecting you to your organization&apos;s sign-in page...
                </p>
              </div>
            ) : step === "email" ? (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="mt-1.5"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" /> : "Continue"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email-readonly">Email</Label>
                  <div className="mt-1.5 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                    {email}
                    <button
                      type="button"
                      onClick={() => {
                        setStep("email");
                        setPassword("");
                        setError(null);
                      }}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Change
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                    className="mt-1.5"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          New to CanoryAI?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
