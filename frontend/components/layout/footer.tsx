import { APP_NAME } from "@/constants/config";

export function Footer() {
  return (
    <footer className="shrink-0 border-t border-border px-6 py-3">
      <p className="text-xs text-muted-foreground">
        {APP_NAME} · EUDR compliance automation · &copy; {new Date().getFullYear()}
      </p>
    </footer>
  );
}
