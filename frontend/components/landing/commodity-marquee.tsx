import { Reveal } from "@/components/landing/reveal";

/**
 * The seven commodity classes EUDR (Regulation 2023/1115, Annex I)
 * actually regulates, each tagged with its real HS chapter heading — a
 * detail a compliance officer will recognize instantly and a generic
 * "logos of happy customers" strip could never earn. Rendered as an
 * infinite CSS marquee (see .mkt-marquee in globals.css): the track is
 * duplicated once so the -50% translate loops seamlessly, pauses on
 * hover, and is fully static under prefers-reduced-motion.
 */
const COMMODITIES = [
  { name: "Cattle", hs: "HS 0102" },
  { name: "Cocoa", hs: "HS 1801" },
  { name: "Coffee", hs: "HS 0901" },
  { name: "Oil palm", hs: "HS 1511" },
  { name: "Rubber", hs: "HS 4001" },
  { name: "Soya", hs: "HS 1201" },
  { name: "Wood", hs: "HS 4403" },
];

function MarqueeTrack({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      aria-hidden={ariaHidden}
      className="mkt-marquee-track flex w-max shrink-0 items-center"
    >
      {COMMODITIES.map((commodity) => (
        <li key={commodity.name} className="flex items-center">
          <span className="mx-7 flex items-baseline gap-2.5 whitespace-nowrap sm:mx-10">
            <span className="font-[family-name:var(--font-manrope)] text-xl font-semibold tracking-tight text-[var(--mkt-ink)] sm:text-2xl">
              {commodity.name}
            </span>
            <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--mkt-muted)]">
              {commodity.hs}
            </span>
          </span>
          <span className="size-1 rounded-full bg-[var(--mkt-forest)]/40" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
}

export function CommodityMarquee() {
  return (
    <section
      aria-label="Commodities covered under EUDR"
      className="border-t border-[var(--mkt-border)] py-10 sm:py-12"
    >
      <Reveal y={12}>
        <p className="mx-auto max-w-7xl px-5 text-center font-mono text-xs font-medium uppercase tracking-[0.14em] text-[var(--mkt-muted)] sm:px-8 lg:px-10">
          Every Annex I commodity class — and its derived products — covered
        </p>
      </Reveal>

      <div className="mkt-marquee relative mt-7 flex overflow-hidden">
        {/* Edge fades so the loop dissolves into the canvas instead of clipping */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--mkt-canvas)] to-transparent sm:w-28" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[var(--mkt-canvas)] to-transparent sm:w-28" />

        <MarqueeTrack />
        <MarqueeTrack ariaHidden />
      </div>
    </section>
  );
}
