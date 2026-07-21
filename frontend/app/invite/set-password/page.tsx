import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata: Metadata = { title: "Set Your Password" };

export default function SetPasswordPage() {
  return <SetPasswordForm />;
}
