"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { dismissBankReauth } from "@/lib/bankSync";
import { reconnectPath, type BankReauthTarget } from "@/lib/errors";

const EASE = [0.22, 1, 0.36, 1] as const;

export function BankReauthPrompt({ targets }: { targets: BankReauthTarget[] }) {
  const reduce = useReducedMotion();
  const open = targets.length > 0;
  const primary = targets[0];
  const bankLabel = primary?.institutionName?.trim() || "your bank";
  const extra =
    targets.length > 1 ? ` (${targets.length} connections need a fresh login)` : "";

  return (
    <AnimatePresence>
      {open && primary ? (
        <motion.div
          key="reauth-overlay"
          className="reauth-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reauth-title"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissBankReauth();
          }}
        >
          <motion.div
            className="reauth-dialog card"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 10 }}
            transition={{ duration: reduce ? 0 : 0.26, ease: EASE }}
          >
            <h2 id="reauth-title">Bank login required</h2>
            <p className="sub">
              Sync can’t continue for <strong>{bankLabel}</strong>
              {extra} until you sign in again (password, MFA, or a security check).
              Reconnecting updates your existing link — it won’t create a duplicate.
            </p>
            <div className="reauth-actions">
              <button type="button" className="btn btn-ghost" onClick={() => dismissBankReauth()}>
                Not now
              </button>
              <Link
                href={reconnectPath(primary)}
                className="btn btn-primary"
                onClick={() => dismissBankReauth()}
              >
                Reconnect with Plaid
              </Link>
            </div>
            {targets.length > 1 && (
              <ul className="reauth-list muted">
                {targets.map((t) => (
                  <li key={t.connectionId}>
                    <Link href={reconnectPath(t)} onClick={() => dismissBankReauth()}>
                      {t.institutionName?.trim() || "Bank connection"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
