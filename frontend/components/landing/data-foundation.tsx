import { Reveal } from "@/components/landing/reveal";

/**
 * Trust band built from the verifiable things this product actually
 * stands on — the regulation text, the satellite data source, the
 * submission system, the storage guarantee — rather than a strip of
 * invented customer logos, which a pre-launch product cannot honestly
 * show and a compliance buyer would see through immediately.
 */
const FOUNDATIONS = [
  {
    label: "Built to the regulation",
    value: "EU 2023/1115",
    detail: "Article 4 due diligence and Article 10 risk assessment, implemented as written.",
  },
  {
    label: "Deforestation data",
    value: "Global Forest Watch",
    detail: "Tree-cover-loss screening on every plot, back to the Dec 31, 2020 cutoff.",
  },
  {
    label: "Submission target",
    value: "TRACES NT",
    detail: "Schema-valid XML generated for the EU's official declaration system.",
  },
  {
    label: "Evidence storage",
    value: "Append-only",
    detail: "Audit records can be added, never edited or deleted — enforced in the database.",
  },
] as const;

export function DataFoundation() {
  return (
    <section
      aria-label="What CanoryAI is built on"
      className="border-t border-[var(--mkt-border)] py-16 sm:py-20"
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-x-8 gap-y-10 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-10">
        {FOUNDATIONS.map((item, index) => (
          <Reveal key={item.value} delay={index * 0.06} y={16}>
            <div className="border-l-2 border-[var(--mkt-forest)]/25 pl-5">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--mkt-muted)]">
                {item.label}
              </p>
              <p className="mt-2 font-[family-name:var(--font-manrope)] text-xl font-semibold tracking-tight text-[var(--mkt-ink)]">
                {item.value}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--mkt-muted)]">{item.detail}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
