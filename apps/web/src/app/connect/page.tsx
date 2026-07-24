"use client";

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
      existing.addEventListener("error", () => reject(new Error("Plaid script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.plaid = "link";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid script failed to load"));
    document.body.appendChild(script);
  });
}

function ConnectInner() {
  const router = useRouter();
  const params = useSearchParams();
  const householdId = params.get("household");
  const [tab, setTab] = useState<Tab>("plaid");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
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
        await loadPlaidScript();
        const { link_token } = await api.createPlaidLinkToken(householdId);
        if (!cancelled) {
          setLinkToken(link_token);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError(
            err instanceof ApiError
              ? err.detail
              : "Could not start Plaid Link. Check WONEY_PLAID_* on the API.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId]);

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
          await api.createPlaidConnection(householdId, publicToken);
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
  }, [householdId, linkToken, router]);

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
          <h1>Link a bank</h1>
          <p>Connect with Plaid, or import a CSV for banks like Neo that need a manual path.</p>
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
            <button
              type="button"
              className="btn btn-primary"
              disabled={!linkToken || status === "syncing"}
              onClick={openPlaid}
            >
              {linkToken ? "Open Plaid Link" : "Preparing Link…"}
            </button>
          </section>
        )}

        {tab === "csv" && (
          <section className="card connect-card">
            <h2>Import a statement</h2>
            <p className="sub">
              Download a CSV from Neo (or any bank), then upload it here. Dates and amounts are detected
              automatically from common Canadian export formats.
            </p>
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
          </section>
        )}

        {tab === "demo" && (
          <section className="card connect-card">
            <h2>Demo Scotiabank history</h2>
            <p className="sub">
              Seeds synthetic CAD accounts and ~180 days of transactions for QA — no Plaid keys required.
            </p>
            <button type="button" className="btn btn-primary" disabled={status === "syncing"} onClick={onDemo}>
              Load demo data
            </button>
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
