"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@woney/api-client";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";

type Tab = "plaid" | "csv" | "demo";
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
  if (err instanceof ApiError) return err.detail;
  if (err instanceof Error && /plaid link script/i.test(err.message)) {
    return err.message;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return (
    "Could not start Plaid Link. Confirm the Render API service has " +
    "WONEY_PLAID_CLIENT_ID + WONEY_PLAID_SECRET (or legacy LEDGER_PLAID_*), " +
    "redeployed, and GET /healthz shows plaid_configured: true. " +
    "Plaid secrets on Vercel alone do not configure the API."
  );
}

function ConnectInner() {
  const router = useRouter();
  const params = useSearchParams();
  const householdId = params.get("household");
  const reconnectId = params.get("reconnect");
  const [tab, setTab] = useState<Tab>("plaid");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [updateMode, setUpdateMode] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const submitted = useRef(false);

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
          setError(formatPlaidStartError(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId, reconnectId]);

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
          setError(err instanceof ApiError ? err.detail : "Plaid connection failed");
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
      setError(err instanceof ApiError ? err.detail : "Import failed");
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
      setError(err instanceof ApiError ? err.detail : "Demo seed failed");
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
          <h1>{updateMode ? "Reconnect your bank" : "Link a bank"}</h1>
          <p>
            {updateMode
              ? "Your bank needs a fresh login (password, MFA, or security check). Complete Plaid Link to restore sync."
              : "Connect with Plaid, or import a CSV for banks like Neo that need a manual path."}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => router.push("/dashboard")}>
            Cancel
          </button>
        </div>
      </div>

      <div className="connect-flow">
        <div className="segmented" role="tablist" aria-label="Connection method">
          <button type="button" className={`seg-btn${tab === "plaid" ? " active" : ""}`} onClick={() => setTab("plaid")}>
            Plaid Link
          </button>
          <button type="button" className={`seg-btn${tab === "csv" ? " active" : ""}`} onClick={() => setTab("csv")}>
            CSV import
          </button>
          <button type="button" className={`seg-btn${tab === "demo" ? " active" : ""}`} onClick={() => setTab("demo")}>
            Demo data
          </button>
        </div>

        {status === "syncing" && (
          <div className="toast">Pulling accounts and transactions — this can take a minute…</div>
        )}
        {status === "error" && error && <p className="error">{error}</p>}

        {tab === "plaid" && (
          <section className="card connect-card">
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
                {linkToken ? (updateMode ? "Reconnect with Plaid" : "Open Plaid Link") : "Preparing Link…"}
              </button>
            )}
            {updateMode && (
              <p className="muted" style={{ marginTop: 12 }}>
                This updates your existing connection — it won’t create a duplicate bank link.
              </p>
            )}
          </section>
        )}

        {tab === "csv" && (
          <section className="card connect-card">
            <h2>Import a statement</h2>
            <p className="sub">
              Download a CSV from Neo (or any bank), then upload it here. Dates and amounts are detected
              automatically from common Canadian export formats. Two-factor authentication is required.
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
                <input value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} required />
              </label>
              <label>
                Account name
                <input value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
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
              <button type="submit" className="btn btn-primary" disabled={!file || status === "syncing"}>
                Import statement
              </button>
            </form>
            )}
          </section>
        )}

        {tab === "demo" && (
          <section className="card connect-card">
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
              <button type="button" className="btn btn-primary" disabled={status === "syncing"} onClick={onDemo}>
                Load demo data
              </button>
            )}
          </section>
        )}
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
