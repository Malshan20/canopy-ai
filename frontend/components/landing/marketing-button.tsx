"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MarketingButtonProps {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  className?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

const VARIANT_STYLES: Record<NonNullable<MarketingButtonProps["variant"]>, string> = {
  primary:
    "bg-[var(--mkt-forest)] text-white shadow-[0_18px_40px_-14px_rgba(11,110,79,0.55)] hover:bg-[var(--mkt-forest-deep)] hover:shadow-[0_22px_50px_-14px_rgba(11,110,79,0.65)]",
  secondary:
    "border border-[var(--mkt-border)] bg-white text-[var(--mkt-ink)] hover:border-[var(--mkt-forest)]/40 hover:bg-[var(--mkt-forest)]/[0.04]",
  ghost: "text-[var(--mkt-ink)] hover:text-[var(--mkt-forest)]",
};

/**
 * The marketing page's single button primitive — three variants cover
 * every CTA on the page (primary conversion action, secondary/outline,
 * and a text-only ghost link), so hover/focus/tap behavior stays
 * identical everywhere rather than drifting between hand-rolled buttons.
 */
export function MarketingButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  icon,
  onClick,
}: MarketingButtonProps) {
  return (
    <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} className="inline-block">
      <Link
        href={href}
        onClick={onClick}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mkt-forest)] focus-visible:ring-offset-2",
          size === "lg" ? "px-7 py-3.5 text-[15px]" : "px-5 py-2.5 text-sm",
          VARIANT_STYLES[variant],
          className,
        )}
      >
        {children}
        {icon}
      </Link>
    </motion.div>
  );
}
