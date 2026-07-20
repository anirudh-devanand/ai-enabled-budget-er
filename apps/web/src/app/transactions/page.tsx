"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CategoryResponse, TransactionResponse } from "@ledger/api-client";
import { api } from "@/lib/api";

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(amount));
}

function CorrectionForm({
  transaction,
  categories,
  onDone,
}: {
  transaction: TransactionResponse;
  categories: CategoryResponse[];
  onDone: (message: string) => void;
}) {
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? "");
  const [merchant, setMerchant] = useState(
    transaction.merchant_name ?? transaction.display_name,
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!categoryId) return;
    setBusy(true);
    try {
      const result = await api.correctTransaction(
        transaction.id,
        categoryId,
        merchant.trim() || undefined,
      );
      onDone(
        result.reapplied_count > 0
          ? `Saved - also fixed ${result.reapplied_count} matching transaction${result.reapplied_count === 1 ? "" : "s"}`
          : "Saved",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input
        aria-label="Merchant name"
        value={merchant}
        onChange={(e) => setMerchant(e.target.value)}
        style={{ maxWidth: 220 }}
      />
      <select
        aria-label="Category"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 12px",
        }}
      >
        <option value="" disabled>
          Pick a category
        </option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        className="primary"
        style={{ width: "auto", marginTop: 0, padding: "10px 18px" }}
        onClick={save}
        disabled={busy || !categoryId}
      >
        Save
      </button>
    </div>
  );
}

export default function TransactionsPage() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(
    async (hid: string, review: boolean) => {
      const result = await api.listTransactions(hid, 100, 0, review ? true : undefined);
      setTransactions(result.items);
    },
    [],
  );

  useEffect(() => {
    (async () => {
      try {
        const [households, cats] = await Promise.all([api.listHouseholds(), api.listCategories()]);
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        setCategories(cats);
        if (hid) await load(hid, reviewOnly);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router, load, reviewOnly]);

  const reviewCount = transactions.filter((t) => t.needs_review).length;

  return (
    <div className="shell">
      <header>
        <h1>Transactions</h1>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setReviewOnly(!reviewOnly)}>
            {reviewOnly ? "Show all" : "Needs review"}
          </button>
          <button onClick={() => router.push("/dashboard")}>Dashboard</button>
        </div>
      </header>

      {toast && (
        <p style={{ color: "#4fc37f", marginTop: 0 }}>{toast}</p>
      )}
      {!reviewOnly && reviewCount > 0 && (
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          {reviewCount} transaction{reviewCount === 1 ? "" : "s"} need a quick review - fixing one
          teaches Ledger the merchant forever.
        </p>
      )}

      <div className="tile" style={{ padding: 0 }}>
        {transactions.map((t) => (
          <div
            key={t.id}
            style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "var(--muted)", flexShrink: 0, width: 90 }}>{t.date}</span>
              <span style={{ flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.display_name}
                {t.category_name && <span className="badge" style={{ marginLeft: 10, marginTop: 0 }}>{t.category_name}</span>}
                {t.needs_review && (
                  <button
                    onClick={() => setEditing(editing === t.id ? null : t.id)}
                    style={{
                      marginLeft: 10,
                      background: "none",
                      border: "1px solid var(--danger)",
                      color: "var(--danger)",
                      borderRadius: 999,
                      padding: "2px 10px",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    {editing === t.id ? "Cancel" : "Fix category"}
                  </button>
                )}
              </span>
              <span
                style={{
                  color: Number(t.amount) >= 0 ? "#4fc37f" : "var(--text)",
                  flexShrink: 0,
                }}
              >
                {formatMoney(t.amount, t.currency)}
              </span>
            </div>
            {editing === t.id && (
              <div style={{ marginTop: 10 }}>
                <CorrectionForm
                  transaction={t}
                  categories={categories}
                  onDone={async (message) => {
                    setEditing(null);
                    setToast(message);
                    if (householdId) await load(householdId, reviewOnly);
                    setTimeout(() => setToast(null), 4000);
                  }}
                />
              </div>
            )}
          </div>
        ))}
        {transactions.length === 0 && (
          <p style={{ padding: 20, color: "var(--muted)" }}>
            {reviewOnly ? "Nothing needs review." : "No transactions yet - connect a bank first."}
          </p>
        )}
      </div>
    </div>
  );
}
