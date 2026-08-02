"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Where Supabase's invite email link points, for the "invite a teammate"
 * flow (backend/app/api/v1/organizations.py's invite_team_member).
 *
 * THIS MUST BE A CLIENT COMPONENT, NOT A SERVER ROUTE HANDLER — that was
 * the actual bug in the previous version of this file (and the identical
 * bug in the separate admin panel project, fixed the same way there).
 * Admin/server-generated invite links (`auth.admin.inviteUserByEmail()`)
 * don't carry a PKCE `?code=` query parameter the way a browser-
 * initiated OAuth flow would — there's no "initiating client" holding a
 * code_verifier, since the invite was generated server-side, not started
 * by the invitee's own browser. Instead, Supabase puts the session
 * directly in the URL as a `#access_token=...&refresh_token=...`
 * fragment.
 *
 * Fragments are never sent to a server — the browser strips everything
 * after `#` before the HTTP request is even made, so a server-side
 * Route Handler structurally cannot see it, no matter how it's written.
 * Only client-side JavaScript, reading `window.location.hash` after the
 * page has actually loaded in the browser, can process this.
 */
export default function InviteCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function completeSignIn() {
      const supabase = createClient();

      // Fragment-based tokens — the actual path admin/server-generated
      // invites take. window.location.hash is only ever available
      // client-side, which is why this page can't be a Route Handler.
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          setError(sessionError.message);
          return;
        }
        router.replace("/invite/set-password");
        return;
      }

      // Fallback: PKCE `?code=` — kept in case Supabase's behavior for
      // this flow ever changes, so this page doesn't silently break if
      // it does.
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        router.replace("/invite/set-password");
        return;
      }

      setError("This invite link is missing its authentication token. Ask whoever invited you to resend it.");
    }

    completeSignIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        {error ? (
          <>
            <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
            <p className="max-w-sm text-sm text-destructive">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Signing you in...</p>
          </>
        )}
      </div>
    </div>
  );
}
