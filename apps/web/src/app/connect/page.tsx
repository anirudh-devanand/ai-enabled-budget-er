"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatedToast } from "@/components/AnimatedToast";
import { Segmented } from "@/components/Segmented";
import { ConnectCardSkeleton } from "@/components/Skeleton";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";
import { userFacingError } from "@/lib/errors";

const EASE = [0.22, 1, 0.36, 1] as const;

type Tab = "plaid" | "brokerages" | "csv" | "demo";
type Status = "idle" | "ready" | "syncing" | "error";

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (publicToken: string) => void;
        onExit?: (err: unknown) => void;
      }) => { open: () => void };
    };
  }
}

function loadPlaidScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-plaid="link"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Plaid Link script failed to load (CSP or network)")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.plaid = "link";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Plaid Link script failed to load (CSP or network)"));
    document.body.appendChild(script);
  });
}

function formatPlaidStartError(err: unknown): string {
  if (err instanceof Error && /plaid link script/i.test(err.message)) {
    return "Could not load the bank connection screen. Check your connection and try again.";
  }
  return userFacingError(err, "Could not start bank connection. Please try again.");
}

function ConnectInner() {
  const router = useRouter();
  const params = useSearchParams();
  const reduceMotion = useReducedMotion();
  const householdId = params.get("household");
  const reconnectId = params.get("reconnect");
  const snaptradeReturn = params.get("snaptrade");
  const snaptradeConnectionId =
    params.get("connection_id") || params.get("authorization_id");
  const snapStatus = params.get("status");
  const [tab, setTab] = useState<Tab>(
    snaptradeReturn || snaptradeConnectionId ? "brokerages" : "plaid",
  );
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [updateMode, setUpdateMode] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const submitted = useRef(false);
  const snaptradeDone = useRef(false);

  const [accountName, setAccountName] = useState("Neo Everyday");
  const [accountType, setAccountType] = useState("chequing");
  const [institutionName, setInstitutionName] = useState("Neo Financial");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (cancelled) return;
        setMfaEnabled(me.mfa_enabled);
        if (!me.mfa_enabled) {
          setStatus("idle");
          setError(null);
          return;
        }
        // Brokerage return from SnapTrade portal — complete connection.
        if (
          !snaptradeDone.current &&
          snaptradeConnectionId &&
          (snaptradeReturn === "return" || snapStatus === "SUCCESS" || !snapStatus)
        ) {
          if (snapStatus === "ERROR" || snapStatus === "ABANDONED") {
            setTab("brokerages");
            setStatus("error");
            setError(
              snapStatus === "ABANDONED"
                ? "Brokerage connection was cancelled."
                : "Brokerage connection failed. Please try again.",
            );
            return;
          }
          snaptradeDone.current = true;
          setTab("brokerages");
          setStatus("syncing");
          await api.completeSnapTradeConnection(householdId, snaptradeConnectionId);
          if (!cancelled) router.replace("/dashboard");
          return;
        }
        await loadPlaidScript();
        const { link_token, update_mode } = await api.createPlaidLinkToken(
          householdId,
          reconnectId || undefined,
        );
        if (!cancelled) {
          setLinkToken(link_token);
          setUpdateMode(Boolean(update_mode || reconnectId));
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(
            snaptradeConnectionId
              ? userFacingError(err, "Could not finish brokerage connection. Please try again.")
              : formatPlaidStartError(err),
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    householdId,
    reconnectId,
    router,
    snapStatus,
    snaptradeConnectionId,
    snaptradeReturn,
  ]);

  const openBrokerage = useCallback(
    async (broker?: string) => {
      if (!householdId || submitted.current) return;
      setError(null);
      setStatus("syncing");
      try {
        const redirect = `${window.location.origin}/connect?household=${householdId}&snaptrade=return`;
        const { portal_url } = await api.createSnapTradePortal(householdId, {
          broker,
          customRedirect: redirect,
        });
        window.location.assign(portal_url);
      } catch (err) {
        setStatus("error");
        setError(
          userFacingError(err, "Could not open brokerage connection. Please try again."),
        );
      }
    },
    [householdId],
  );

  const openPlaid = useCallback(() => {
    if (!householdId || !linkToken || !window.Plaid || submitted.current) return;
    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken) => {
        if (submitted.current) return;
        submitted.current = true;
        setStatus("syncing");
        setError(null);
        try {
          if (updateMode && reconnectId) {
            // Update mode restores the existing Item — no new public_token exchange.
            await api.completePlaidReauth(reconnectId);
          } else {
            await api.createPlaidConnection(householdId, publicToken);
          }
          router.replace("/dashboard");
        } catch (err) {
          submitted.current = false;
          setStatus("error");
          setError(userFacingError(err, "Could not connect your bank. Please try again."));
        }
      },
      onExit: (err) => {
        if (err) {
          setStatus("error");
          setError("Bank link was closed before finishing.");
        }
      },
    });
    handler.open();
  }, [householdId, linkToken, router, updateMode, reconnectId]);

  async function onCsvSubmit(e: FormEvent) {
    e.preventDefault();
    if (!householdId || !file || submitted.current) return;
    submitted.current = true;
    setStatus("syncing");
    setError(null);
    try {
      await api.importCsvStatement({
        householdId,
        accountName,
        accountType,
        institutionName,
        file,
        fileName: file.name,
      });
      router.replace("/dashboard");
    } catch (err) {
      submitted.current = false;
      setStatus("error");
      setError(userFacingError(err, "Could not import that file. Please try again."));
    }
  }

  async function onDemo() {
    if (!householdId || submitted.current) return;
    submitted.current = true;
    setStatus("syncing");
    setError(null);
    try {
      await api.createConnection(householdId, "demo-seed:scotia:180");
      router.replace("/dashboard");
    } catch (err) {
      submitted.current = false;
      setStatus("error");
      setError(userFacingError(err, "Could not load demo data. Please try again."));
    }
  }

  if (!householdId) {
    return (
      <main className="auth">
        <section className="auth-panel" style={{ gridColumn: "1 / -1" }}>
          <div className="auth-card">
            <h1>Link a bank</h1>
            <p className="sub">Open this from your dashboard so we know which household to connect.</p>
            <button type="button" className="btn btn-primary btn-block" onClick={() => router.push("/dashboard")}>
              Back to home
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>{updateMode ? "Reconnect your bank" : "Link accounts"}</h1>
          <p>
            {updateMode
              ? "Your bank needs a fresh login (password, MFA, or security check). Complete Plaid Link to restore sync."
              : "Connect banks with Plaid, brokerages (Wealthsimple / IBKR) with SnapTrade, or import a CSV."}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => router.push("/dashboard")}>
            Cancel
          </button>
        </div>
      </div>

      <div className="connect-flow">
        <Segmented
          aria-label="Connection method"
          layoutId="connect-method-pill"
          value={tab}
          onChange={setTab}
          options={[
            { value: "plaid", label: "Plaid Link" },
            { value: "brokerages", label: "Brokerages" },
            { value: "csv", label: "CSV import" },
            { value: "demo", label: "Demo data" },
          ]}
        />

        <AnimatedToast
          message={
            status === "syncing"
              ? tab === "brokerages"
                ? "Connecting brokerage and syncing holdings…"
                : "Pulling accounts and transactions — this can take a minute…"
              : null
          }
        />
        <AnimatePresence>
          {status === "error" && error ? (
            <motion.p
              key="connect-error"
              className="error"
              role="alert"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
            >
              {error}
            </motion.p>
          ) : null}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {tab === "plaid" ? (
            mfaEnabled === null && status === "idle" ? (
              <motion.div
                key="plaid-sk"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
              >
                <ConnectCardSkeleton />
              </motion.div>
            ) : (
            <motion.section
              key="plaid"
              className="card connect-card"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
            >
              <h2>Secure bank link</h2>
              <p className="sub">
                Works with major Canadian banks via Plaid. Woney never sees your bank password.
                Neo is usually not on Plaid — use CSV import for that.
              </p>
              {mfaEnabled === false ? (
                <div>
                  <p className="error" style={{ marginTop: 0 }}>
                    Enable multi-factor authentication before linking a live bank.
                  </p>
                  <Link href="/account#security" className="btn btn-primary">
                    Open Account security
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!linkToken || status === "syncing"}
                  onClick={openPlaid}
                >
                  {linkToken
                    ? updateMode
                      ? "Reconnect with Plaid"
                      : "Open Plaid Link"
                    : "Preparing Link…"}
                </button>
              )}
              {updateMode && (
                <p className="muted" style={{ marginTop: 12 }}>
                  This updates your existing connection — it won’t create a duplicate bank link.
                </p>
              )}
            </motion.section>
            )
          ) : null}

          {tab === "brokerages" ? (
            mfaEnabled === null ? (
              <motion.div
                key="broker-sk"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
              >
                <ConnectCardSkeleton />
              </motion.div>
            ) : (
              <motion.section
                key="brokerages"
                className="card connect-card"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
              >
                <h2>Wealthsimple &amp; Interactive Brokers</h2>
                <p className="sub">
                  Brokerage holdings sync through SnapTrade (separate from Plaid banks). Read-only —
                  Woney never places trades. Two-factor authentication is required.
                </p>
                {mfaEnabled === false ? (
                  <div>
                    <p className="error" style={{ marginTop: 0 }}>
                      Enable multi-factor authentication before linking a brokerage.
                    </p>
                    <Link href="/account#security" className="btn btn-primary">
                      Open Account security
                    </Link>
                  </div>
                ) : (
                  <div className="stack" style={{ gap: 12 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={status === "syncing"}
                      onClick={() => openBrokerage("wealthsimple")}
                    >
                      Connect Wealthsimple
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={status === "syncing"}
                      onClick={() => openBrokerage("ibkr")}
                    >
                      Connect Interactive Brokers
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={status === "syncing"}
                      onClick={() => openBrokerage()}
                    >
                      Choose another brokerage
                    </button>
                    <p className="muted" style={{ marginTop: 4, fontSize: "0.88rem" }}>
                      <strong>IBKR:</strong> In Client Portal go to Settings → Account Settings →
                      Configure Third-Party Services, create a Flex Query, then paste the Query ID
                      and token when SnapTrade asks.{" "}
                      <a
                        href="https://snaptrade.com/brokerage-integrations/ibkr-api"
                        target="_blank"
                        rel="noreferrer"
                      >
                        IBKR setup help
                      </a>
                      .
                    </p>
                  </div>
                )}
              </motion.section>
            )
          ) : null}

          {tab === "csv" ? (
            mfaEnabled === null ? (
              <motion.div
                key="csv-sk"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
              >
                <ConnectCardSkeleton />
              </motion.div>
            ) : (
            <motion.section
              key="csv"
              className="card connect-card"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
            >
              <h2>Import a statement</h2>
              <p className="sub">
                Download a CSV from Neo (or any bank), then upload it here. Dates and amounts are
                detected automatically from common Canadian export formats. Two-factor authentication
                is required.
              </p>
              {mfaEnabled === false ? (
                <div>
                  <p className="error" style={{ marginTop: 0 }}>
                    Enable multi-factor authentication before importing statements.
                  </p>
                  <Link href="/account" className="btn btn-primary">
                    Open Account security
                  </Link>
                </div>
              ) : (
                <form onSubmit={onCsvSubmit} className="stack" style={{ gap: 14 }}>
                  <label>
                    Institution
                    <input
                      value={institutionName}
                      onChange={(e) => setInstitutionName(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Account name
                    <input
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Account type
                    <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                      <option value="chequing">Chequing</option>
                      <option value="savings">Savings</option>
                      <option value="credit">Credit</option>
                    </select>
                  </label>
                  <label>
                    CSV file
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      required
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!file || status === "syncing"}
                  >
                    Import statement
                  </button>
                </form>
              )}
            </motion.section>
            )
          ) : null}

          {tab === "demo" ? (
            mfaEnabled === null ? (
              <motion.div
                key="demo-sk"
                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
              >
                <ConnectCardSkeleton />
              </motion.div>
            ) : (
            <motion.section
              key="demo"
              className="card connect-card"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
            >
              <h2>Demo Scotiabank history</h2>
              <p className="sub">
                Seeds synthetic CAD accounts and ~180 days of transactions for QA. Two-factor
                authentication is required.
              </p>
              {mfaEnabled === false ? (
                <div>
                  <p className="error" style={{ marginTop: 0 }}>
                    Enable multi-factor authentication before loading demo data.
                  </p>
                  <Link href="/account" className="btn btn-primary">
                    Open Account security
                  </Link>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={status === "syncing"}
                  onClick={onDemo}
                >
                  Load demo data
                </button>
              )}
            </motion.section>
            )
          ) : null}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

export default function ConnectPage() {
  return (
    <Suspense>
      <ConnectInner />
    </Suspense>
  );
}
