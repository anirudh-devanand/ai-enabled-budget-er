"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ApiError } from "@ledger/api-client";
import { AppShell } from "@/components/ui";
import { api } from "@/lib/api";

const FLINKS_IFRAME_URL =
  process.env.NEXT_PUBLIC_FLINKS_IFRAME_URL ??
  "https://toolbox-iframe.private.fin.ag/?demo=true&consentEnable=true&daysOfTransactions=Days365&institutionFilterEnable=true";

function ConnectInner() {
  const router = useRouter();
  const params = useSearchParams();
  const householdId = params.get("household");
  const [status, setStatus] = useState<"widget" | "syncing" | "error">("widget");
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!householdId) return;

    async function onMessage(event: MessageEvent) {
      const data = event.data as { step?: string; loginId?: string };
      if (data?.step !== "REDIRECT" || !data.loginId || submitted.current) return;
      submitted.current = true;
      setStatus("syncing");
      try {
        await api.createConnection(householdId!, data.loginId);
        router.replace("/dashboard");
      } catch (err) {
        setStatus("error");
        setError(err instanceof ApiError ? err.detail : "Connection failed");
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [householdId, router]);

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
          <p>Secure connection through Flinks — Woney never sees your bank password.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={() => router.push("/dashboard")}>
            Cancel
          </button>
        </div>
      </div>

      {status === "syncing" && (
        <div className="toast">Connected. Pulling accounts and transactions — this can take a minute…</div>
      )}
      {status === "error" && <p className="error">{error}</p>}
      {status === "widget" && (
        <iframe
          title="Flinks Connect"
          src={FLINKS_IFRAME_URL}
          style={{
            width: "100%",
            height: 760,
            border: "1px solid var(--border)",
            borderRadius: 16,
            background: "#fff",
            boxShadow: "var(--shadow)",
          }}
        />
      )}
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
