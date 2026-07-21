"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Leaf } from "lucide-react";

import { MobileMenu } from "@/components/landing/mobile-menu";
import { MarketingButton } from "@/components/landing/marketing-button";

const NAV_LINKS = [
  { label: "Platform", href: "#platform" },
  { label: "How it works", href: "#workflow" },
  { label: "Pricing", href: "#pricing" },
  { label: "Security", href: "#security" },
  { label: "FAQ", href: "#faq" },
];

/**
 * Sticky nav that stays transparent over the hero and gains a soft white
 * surface + hairline border once the visitor scrolls past it — a subtler,
 * more "premium enterprise" read than a permanently-visible bar sitting on
 * top of the hero art from the first frame.
 */
export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 24);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          isScrolled
            ? "border-b border-[var(--mkt-border)] bg-[var(--mkt-surface)]/85 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--mkt-forest)]">
              <Leaf className="size-4 text-white" aria-hidden="true" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-[var(--mkt-ink)]">
              CanoryAI
            </span>
          </Link>

          <nav className="hidden items-center gap-8 lg:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="group relative text-sm font-medium text-[var(--mkt-body)] transition-colors hover:text-[var(--mkt-ink)]"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-[var(--mkt-forest)] transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/login"
              className="text-sm font-medium text-[var(--mkt-body)] transition-colors hover:text-[var(--mkt-ink)]"
            >
              Sign in
            </Link>
            <MarketingButton href="/#demo">Book Demo</MarketingButton>
          </div>

          {/* Morphing hamburger — three lines animate into an X in place, rather than
              swapping between two separate icon components (which would just cross-fade). */}
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            className="relative flex size-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mkt-forest)] lg:hidden"
          >
            <span className="relative flex h-3.5 w-5 flex-col justify-between">
              <motion.span
                animate={isMenuOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="h-[1.5px] w-full origin-center rounded-full bg-[var(--mkt-ink)]"
              />
              <motion.span
                animate={isMenuOpen ? { opacity: 0 } : { opacity: 1 }}
                transition={{ duration: 0.15 }}
                className="h-[1.5px] w-full rounded-full bg-[var(--mkt-ink)]"
              />
              <motion.span
                animate={isMenuOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="h-[1.5px] w-full origin-center rounded-full bg-[var(--mkt-ink)]"
              />
            </span>
          </button>
        </div>
      </header>

      <MobileMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} links={NAV_LINKS} />
    </>
  );
}
