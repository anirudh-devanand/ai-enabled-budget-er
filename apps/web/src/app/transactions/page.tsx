"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import type {
  AccountResponse,
  CategoryResponse,
  TransactionResponse,
} from "@woney/api-client";
import { AnimatedToast } from "@/components/AnimatedToast";
import { AppShell, CategoryIcon, FilterBar } from "@/components/ui";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";
import { formatMoney } from "@/lib/ui";

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
          ? `Saved — also fixed ${result.reapplied_count} matching transaction${result.reapplied_count === 1 ? "" : "s"}`
          : "Saved",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
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
          background: "#fff",
          color: "var(--text)",
          border: "1px solid var(--border-strong)",
          borderRadius: 10,
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
      <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !categoryId}>
        Save
      </button>
    </div>
  );
}

const ROW_EASE = [0.22, 1, 0.36, 1] as const;

export default function TransactionsPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [accounts, setAccounts] = useState<AccountResponse[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);

  const load = useCallback(
    async (hid: string) => {
      const result = await api.listTransactions(hid, {
        limit: 100,
        q: q || undefined,
        accountId: accountId || undefined,
        categoryId: categoryId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        needsReview: reviewOnly ? true : undefined,
      });
      setTransactions(result.items);
    },
    [q, accountId, categoryId, dateFrom, dateTo, reviewOnly],
  );

  useEffect(() => {
    (async () => {
      try {
        const households = await api.listHouseholds();
        const hid = households[0]?.id ?? null;
        setHouseholdId(hid);
        if (!hid) return;
        const [cats, accs] = await Promise.all([
          api.listCategories(hid),
          api.listAccounts(hid),
        ]);
        setCategories(cats);
        setAccounts(accs);
        await load(hid);
      } catch (err) {
        if (isUnauthorized(err)) router.replace("/login");
      }
    })();
  }, [router, load]);

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  const reload = useCallback(async () => {
    if (householdId) await load(householdId);
  }, [householdId, load]);

  return (
    <AppShell householdId={householdId} onRefresh={reload}>
      <div className="page-header">
        <div>
          <h1>Activity</h1>
          <p>Filter, review, and correct categories — Woney learns from every fix.</p>
        </div>
      </div>

      <FilterBar>
        <div>
          <label htmlFor="q">Search</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Merchant…" />
        </div>
        <div>
          <label htmlFor="acc">Account</label>
          <select id="acc" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name || a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cat">Category</label>
          <select id="cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from">From</label>
          <input id="from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="to">To</label>
          <input id="to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div style={{ display: "flex", alignItems: "end" }}>
          <button
            type="button"
            className={`btn ${reviewOnly ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setReviewOnly(!reviewOnly)}
          >
            {reviewOnly ? "Needs review ✓" : "Needs review"}
          </button>
        </div>
      </FilterBar>

      <AnimatedToast message={toast} />

      <div className="list-card">
        <AnimatePresence mode="popLayout" initial={false}>
          {transactions.map((t) => {
            const pref = t.category_id ? catMap[t.category_id] : undefined;
            return (
              <motion.div
                key={t.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: ROW_EASE }}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="txn-row" style={{ borderBottom: "none" }}>
                  <CategoryIcon name={t.category_name} pref={pref} />
                  <div className="txn-meta">
                    <div className="name">{t.display_name}</div>
                    <div className="sub">
                      {t.date}
                      {t.category_name ? ` · ${t.category_name}` : ""}
                      {t.needs_review ? " · needs review" : ""}
                      <button
                        type="button"
                        onClick={() => setEditing(editing === t.id ? null : t.id)}
                        style={{
                          marginLeft: 8,
                          background: "none",
                          border: "none",
                          color: "var(--accent)",
                          fontWeight: 700,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {editing === t.id ? "Cancel" : "Edit type"}
                      </button>
                    </div>
                  </div>
                  <div className={`txn-amount${Number(t.amount) >= 0 ? " in" : ""}`}>
                    {formatMoney(t.amount, t.currency)}
                  </div>
                </div>
                {editing === t.id && (
                  <div style={{ padding: "0 16px 16px 74px" }}>
                    <CorrectionForm
                      transaction={t}
                      categories={categories}
                      onDone={async (message) => {
                        setEditing(null);
                        setToast(message);
                        if (householdId) await load(householdId);
                        setTimeout(() => setToast(null), 4000);
                      }}
                    />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {transactions.length === 0 && (
          <p style={{ padding: 24 }} className="muted">
            No transactions match these filters.
          </p>
        )}
      </div>
    </AppShell>
  );
}
