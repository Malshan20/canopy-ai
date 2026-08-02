"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";

import { MarketingButton } from "@/components/landing/marketing-button";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  links: { label: string; href: string }[];
}

/**
 * Full-screen mobile navigation drawer. Handles its own body scroll lock,
 * ESC-to-close, and outside-click-to-close so `navbar.tsx` only has to
 * own the open/closed boolean. The hamburger button itself lives in
 * `navbar.tsx` (it needs to stay in the same fixed position in both
 * states — see that file) but its open/closed visual state is driven by
 * the same `isOpen` prop passed here, so the two never fall out of sync.
 */
export function MobileMenu({ isOpen, onClose, links }: MobileMenuProps) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-[var(--mkt-ink)]/40 backdrop-blur-sm lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col bg-[var(--mkt-surface)] px-7 pb-8 pt-28 shadow-2xl lg:hidden"
          >
            <nav className="flex flex-1 flex-col gap-1" aria-label="Mobile">
              {links.map((link, index) => (
                <Link
                  key={link.href}
                  href={link.href}
                  ref={index === 0 ? firstLinkRef : undefined}
                  onClick={onClose}
                  className="border-b border-[var(--mkt-border)] py-4 text-2xl font-medium tracking-tight text-[var(--mkt-ink)] transition-colors hover:text-[var(--mkt-forest)]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 flex flex-col gap-3">
              <MarketingButton href="/login" variant="secondary" size="lg" className="w-full">
                Sign in
              </MarketingButton>
              <MarketingButton href="/#demo" variant="primary" size="lg" className="w-full" onClick={onClose}>
                Book Demo
              </MarketingButton>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
