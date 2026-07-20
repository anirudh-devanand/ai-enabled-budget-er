"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ApiError } from "@ledger/api-client";
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
      // Flinks Connect fires REDIRECT with the loginId once the user finishes.
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
        <div className="card">
          <h1>Connect a bank</h1>
          <p className="sub">Missing household - open this page from your dashboard.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="shell">
      <header>
        <h1>Connect your bank</h1>
        <button onClick={() => router.push("/dashboard")}>Back</button>
      </header>
      {status === "syncing" && (
        <p>Connected. Pulling your accounts and transactions - this can take a minute...</p>
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
            borderRadius: 12,
            background: "#fff",
          }}
        />
      )}
    </div>
  );
}

export default function ConnectPage() {
  return (
    <Suspense>
      <ConnectInner />
    </Suspense>
  );
}
