import Image from "next/image";
import { cn } from "@/lib/utils";

interface VerificationWindowProps {
  src: string;
  alt: string;
  label: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}

/**
 * CanoryAI's signature visual device: a dark, glowing photographic panel
 * — a literal window into satellite, data, and infrastructure imagery —
 * framed identically everywhere it appears (hero, bento grid) against the
 * light enterprise canvas. The device encodes the product's actual job:
 * making the otherwise-invisible parts of a supply chain (a remote farm's
 * deforestation risk, an AI model's internal state, an audit ledger's
 * integrity) visible and verified, inside a controlled, legible frame —
 * rather than scattering the four source photos as generic full-bleed
 * decoration.
 */
export function VerificationWindow({
  src,
  alt,
  label,
  className,
  priority = false,
  sizes = "(min-width: 1024px) 50vw, 100vw",
}: VerificationWindowProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[28px] border border-black/10 bg-[#060a08] shadow-[0_30px_80px_-30px_rgba(11,110,79,0.45)]",
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover opacity-90 transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#060a08]/70 via-transparent to-[#060a08]/10" />

      <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 backdrop-blur-sm">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--mkt-mint-glow)] opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-[var(--mkt-mint-glow)]" />
        </span>
        <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-white/80">
          {label}
        </span>
      </div>
    </div>
  );
}
