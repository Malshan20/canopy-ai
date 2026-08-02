"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Send, User, Headset } from "lucide-react";

import { fetchContactTicket, replyToContactTicket, type ContactTicketDetail } from "@/services/api";
import { cn } from "@/lib/utils";

const fieldClasses =
  "w-full rounded-lg border border-[var(--mkt-border)] bg-white px-4 py-2.5 text-sm text-[var(--mkt-ink)] placeholder:text-[var(--mkt-muted)] transition-colors focus:border-[var(--mkt-forest)] focus:outline-none focus:ring-2 focus:ring-[var(--mkt-forest)]/20";

const STATUS_LABEL: Record<ContactTicketDetail["status"], string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_COLOR: Record<ContactTicketDetail["status"], string> = {
  open: "bg-[var(--mkt-forest)]/10 text-[var(--mkt-forest-deep)]",
  in_progress: "bg-amber-100 text-amber-800",
  resolved: "bg-slate-100 text-slate-600",
  closed: "bg-slate-100 text-slate-500",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function TicketTracker() {
  const searchParams = useSearchParams();

  const [ticketNumber, setTicketNumber] = useState(searchParams.get("ticket") ?? "");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [ticket, setTicket] = useState<ContactTicketDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replyBody, setReplyBody] = useState("");
  const [isReplying, setIsReplying] = useState(false);

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    const result = await fetchContactTicket(ticketNumber.trim(), email.trim());
    setIsLoading(false);

    if (!result.ok) {
      setError(result.error.message);
      setTicket(null);
      return;
    }
    setTicket(result.data);
  }

  async function handleReply(event: FormEvent) {
    event.preventDefault();
    if (!replyBody.trim() || !ticket) return;
    setIsReplying(true);
    const result = await replyToContactTicket(ticket.ticket_number, { email, message: replyBody.trim() });
    setIsReplying(false);

    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setTicket(result.data);
    setReplyBody("");
  }

  if (!ticket) {
    return (
      <form onSubmit={handleLookup} className="space-y-4 rounded-xl border border-[var(--mkt-border)] bg-white p-8">
        <div>
          <label htmlFor="ticket-number" className="mb-1.5 block text-xs font-medium text-[var(--mkt-body)]">
            Ticket number
          </label>
          <input
            id="ticket-number"
            required
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value)}
            className={cn(fieldClasses, "font-mono")}
            placeholder="CNRY-1042"
          />
        </div>
        <div>
          <label htmlFor="lookup-email" className="mb-1.5 block text-xs font-medium text-[var(--mkt-body)]">
            Email used to submit it
          </label>
          <input
            id="lookup-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClasses}
            placeholder="jane@company.com"
          />
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--mkt-forest)] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--mkt-forest-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : "Find my ticket"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--mkt-border)] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-xs text-[var(--mkt-muted)]">{ticket.ticket_number}</p>
            <h2 className="mt-0.5 text-lg font-semibold text-[var(--mkt-ink)]">{ticket.subject}</h2>
          </div>
          <span className={cn("rounded-full px-3 py-1 text-xs font-medium", STATUS_COLOR[ticket.status])}>
            {STATUS_LABEL[ticket.status]}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {ticket.messages.map((message) => (
          <div
            key={message.id}
            className={cn("flex gap-3", message.sender_type === "admin" && "flex-row-reverse text-right")}
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full",
                message.sender_type === "admin" ? "bg-[var(--mkt-forest)]/10" : "bg-[var(--mkt-border)]",
              )}
            >
              {message.sender_type === "admin" ? (
                <Headset className="size-4 text-[var(--mkt-forest)]" aria-hidden="true" />
              ) : (
                <User className="size-4 text-[var(--mkt-muted)]" aria-hidden="true" />
              )}
            </div>
            <div
              className={cn(
                "max-w-[80%] rounded-xl border border-[var(--mkt-border)] bg-white px-4 py-3",
                message.sender_type === "admin" && "bg-[var(--mkt-forest)]/5",
              )}
            >
              <div className="flex items-center gap-2 text-xs text-[var(--mkt-muted)]">
                <span className="font-medium text-[var(--mkt-ink)]">
                  {message.sender_type === "admin" ? "CanoryAI Support" : message.sender_name}
                </span>
                <span>{formatDate(message.created_at)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--mkt-body)]">{message.body}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleReply} className="space-y-3 rounded-xl border border-[var(--mkt-border)] bg-white p-6">
        <label htmlFor="reply" className="block text-xs font-medium text-[var(--mkt-body)]">
          Add a reply
        </label>
        <textarea
          id="reply"
          rows={3}
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          className={cn(fieldClasses, "resize-none")}
          placeholder="Type your reply..."
        />
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={isReplying || !replyBody.trim()}
          className="flex items-center gap-2 rounded-lg bg-[var(--mkt-forest)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--mkt-forest-deep)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isReplying ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          Send reply
        </button>
      </form>
    </div>
  );
}
