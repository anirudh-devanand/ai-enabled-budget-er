"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type {
  CategoryResponse,
  ConnectionResponse,
  DeleteRequestResponse,
  UserResponse,
} from "@woney/api-client";
import { BankLogo } from "@/components/BankLogo";
import { CategoryGlyph } from "@/components/CategoryIcon";
import { CategoryIcon, AppShell } from "@/components/ui";
import { WoneyLoader } from "@/components/WoneyLoader";
import { api } from "@/lib/api";
import { getApiDetail, isUnauthorized } from "@/lib/errors";

function formatSynced(iso: string | null | undefined) {
  if (!iso) return "Never synced";
  try {
    return `Synced ${new Date(iso).toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}`;
  } catch {
    return `Synced ${iso.slice(0, 10)}`;
  }
}

type DeleteStep = "idle" | "confirm";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [connections, setConnections] = useState<ConnectionResponse[]>([]);
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [icons, setIcons] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [extrasAvailable, setExtrasAvailable] = useState(true);

  const [deleteStep, setDeleteStep] = useState<DeleteStep>("idle");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteChallenge, setDeleteChallenge] = useState<DeleteRequestResponse | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState("");
  const [deleteCode, setDeleteCode] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");

  const load = useCallback(async () => {
    const [me, households] = await Promise.all([api.me(), api.listHouseholds()]);
    setUser(me);
    setDisplayName(me.display_name);
    const hid = households[0]?.id ?? null;
    setHouseholdId(hid);
    if (!hid) return;

    try {
      setConnections(await api.listConnections(hid));
    } catch {
      setConnections([]);
    }

    try {
      const [cats, iconOpts] = await Promise.all([
        api.listCategories(hid),
        api.listCategoryIcons(),
      ]);
      setCategories(cats);
      setIcons(iconOpts.icons);
      setColors(iconOpts.colors);
      setExtrasAvailable(true);
    } catch {
      try {
        setCategories(await api.listCategories());
      } catch {
        setCategories([]);
      }
      setExtrasAvailable(false);
    }
  }, []);

  useEffect(() => {
    load().catch((err) => {
      if (isUnauthorized(err)) router.replace("/login");
    });
  }, [load, router]);

  async function saveProfile() {
    setBusy(true);
    try {
      const updated = await api.updateMe(displayName.trim());
      setUser(updated);
      setToast("Profile saved");
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      if (isUnauthorized(err)) router.replace("/login");
      else setToast("Could not save profile — redeploy API if this persists");
    } finally {
      setBusy(false);
    }
  }

  async function saveCategoryPref(cat: CategoryResponse, iconKey: string, color: string) {
    if (!householdId || !extrasAvailable) {
      setToast("Category styling needs the latest API deploy");
      return;
    }
    const updated = await api.updateCategoryPreference(cat.id, householdId, iconKey, color);
    setCategories((prev) => prev.map((c) => (c.id === cat.id ? updated : c)));
    setEditingCat(null);
    setToast(`Updated ${cat.name}`);
    setTimeout(() => setToast(null), 2500);
  }

  async function syncBank(connectionId: string) {
    setSyncingId(connectionId);
    try {
      await api.syncConnection(connectionId);
      setToast("Accounts refreshed");
      await load();
    } catch {
      setToast("Sync failed");
    } finally {
      setSyncingId(null);
      setTimeout(() => setToast(null), 2500);
    }
  }

  function resetDeleteForm() {
    setDeleteStep("idle");
    setDeleteChallenge(null);
    setDeletePassword("");
    setDeleteEmailConfirm("");
    setDeleteCode("");
    setDeletePhrase("");
    setDeleteError(null);
  }

  async function startDelete() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const challenge = await api.requestAccountDeletion();
      setDeleteChallenge(challenge);
      if (challenge.delivery === "inline" && challenge.code) {
        setDeleteCode(challenge.code);
      } else {
        setDeleteCode("");
      }
      setDeleteStep("confirm");
    } catch (err) {
      if (isUnauthorized(err)) router.replace("/login");
      else setDeleteError(getApiDetail(err, "Could not start deletion"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteChallenge) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.confirmAccountDeletion({
        code: deleteCode.trim(),
        confirm: "DELETE",
        password: deleteChallenge.requires_password ? deletePassword : undefined,
        email_confirm: deleteChallenge.requires_password ? undefined : deleteEmailConfirm.trim(),
      });
      router.replace("/login");
    } catch (err) {
      // Wrong password/code is 401 — keep the form unless the session is gone.
      const detail = getApiDetail(err, "Could not delete account");
      const lower = detail.toLowerCase();
      if (
        isUnauthorized(err) &&
        (lower.includes("not authenticated") ||
          lower.includes("credentials") ||
          lower.includes("token"))
      ) {
        router.replace("/login");
        return;
      }
      setDeleteError(detail);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="app-main">
        <WoneyLoader label="Loading account…" />
      </div>
    );
  }

  const initial = (displayName || user.email || "W").trim().charAt(0).toUpperCase();
  const codeLabel =
    deleteChallenge?.delivery === "totp"
      ? "Authenticator code"
      : deleteChallenge?.delivery === "email"
        ? "Email code"
        : "Confirmation code";

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>Account</h1>
          <p>
            Profile, linked banks, and category styling. The Assistant uses
            privacy-filtered summaries — full account numbers are never sent to the AI.
          </p>
        </div>
        {householdId && (
          <div className="page-actions">
            <Link href={`/connect?household=${householdId}`} className="btn btn-primary">
              Link a bank
            </Link>
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}

      <section className="account-hero">
        <div className="account-avatar" aria-hidden>
          {initial}
        </div>
        <div>
          <h2>{displayName || "Your account"}</h2>
          <p>{user.email}</p>
        </div>
      </section>

      <div className="account-grid">
        <section className="account-panel">
          <h3>Profile</h3>
          <p className="panel-lede">How your name appears across Woney.</p>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" value={user.email} disabled />
          </div>
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={saveProfile} disabled={busy}>
            Save profile
          </button>
        </section>
      </div>

      <div className="section-title">Linked banks</div>
      <div className="list-card" style={{ marginBottom: 28, overflow: "hidden" }}>
        {connections.map((c) => (
          <div className="bank-row" key={c.id}>
            <BankLogo institutionName={c.institution_name || c.provider} />
            <div className="bank-row-meta">
              <div className="name">{c.institution_name || `${c.provider} connection`}</div>
              <div className="sub">
                <span className={`status-pill${c.status === "error" ? " error" : ""}`}>
                  {c.status}
                </span>
                <span>{formatSynced(c.last_synced_at)}</span>
                <span style={{ textTransform: "capitalize" }}>{c.provider}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={c.provider === "csv" || syncingId === c.id}
              title={c.provider === "csv" ? "CSV imports can’t re-sync" : "Refresh accounts"}
              onClick={() => syncBank(c.id)}
            >
              {syncingId === c.id ? "Syncing…" : "Sync"}
            </button>
          </div>
        ))}
        {connections.length === 0 && (
          <div style={{ padding: 28 }}>
            <p className="muted" style={{ marginTop: 0 }}>
              No banks linked yet. Connect with Plaid or import a CSV for Neo.
            </p>
            {householdId && (
              <Link href={`/connect?household=${householdId}`} className="btn btn-primary">
                Link a bank
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="section-title">Category icons & colors</div>
      <p className="muted" style={{ marginTop: 0 }}>
        Pick an icon and chip color for each spending bucket.
      </p>
      <div className="list-card">
        {categories.map((c) => (
          <div key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="txn-row" style={{ borderBottom: "none" }}>
              <CategoryIcon name={c.name} pref={c} />
              <div className="txn-meta">
                <div className="name">{c.name}</div>
                <div className="sub">{c.slug}</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingCat(editingCat === c.id ? null : c.id)}
              >
                {editingCat === c.id ? "Close" : "Customize"}
              </button>
            </div>
            {editingCat === c.id && (
              <div style={{ padding: "0 16px 16px 74px" }}>
                {icons.length === 0 ? (
                  <p className="muted">Customization requires the latest API.</p>
                ) : (
                  <>
                    <div className="muted" style={{ marginBottom: 8, fontSize: "0.8rem" }}>
                      Icon
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {icons.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          className="cat-icon"
                          style={{
                            background: c.color || "#f3ead5",
                            border:
                              c.icon_key === icon
                                ? "2px solid var(--text)"
                                : "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                          onClick={() => saveCategoryPref(c, icon, c.color || "#f3ead5")}
                          title={icon}
                        >
                          <CategoryGlyph name={icon} />
                        </button>
                      ))}
                    </div>
                    <div className="muted" style={{ marginBottom: 8, fontSize: "0.8rem" }}>
                      Chip color
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {colors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: color,
                            border:
                              c.color === color
                                ? "2px solid var(--text)"
                                : "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                          onClick={() => saveCategoryPref(c, c.icon_key || "other", color)}
                          aria-label={color}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="section-title">Danger zone</div>
      <section className="account-panel account-danger">
        <h3>Delete account</h3>
        <p className="panel-lede">
          Permanently remove your account, bank links, transactions, and assistant history. This
          cannot be undone.
        </p>

        {deleteStep === "idle" && (
          <>
            {deleteError && <div className="error">{deleteError}</div>}
            <button
              type="button"
              className="btn btn-danger"
              onClick={startDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Preparing…" : "Delete account"}
            </button>
          </>
        )}

        {deleteStep === "confirm" && deleteChallenge && (
          <div className="delete-flow">
            <p className="muted" style={{ marginTop: 0 }}>
              {deleteChallenge.message}
            </p>
            {deleteChallenge.delivery === "inline" && deleteChallenge.code && (
              <p className="delete-inline-code">
                Your code: <strong>{deleteChallenge.code}</strong>
              </p>
            )}

            {deleteChallenge.requires_password ? (
              <div className="field">
                <label htmlFor="delete-password">Password</label>
                <input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
              </div>
            ) : (
              <div className="field">
                <label htmlFor="delete-email">Re-enter your email</label>
                <input
                  id="delete-email"
                  type="email"
                  autoComplete="email"
                  value={deleteEmailConfirm}
                  onChange={(e) => setDeleteEmailConfirm(e.target.value)}
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="delete-code">{codeLabel}</label>
              <input
                id="delete-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={deleteCode}
                onChange={(e) => setDeleteCode(e.target.value)}
                placeholder={deleteChallenge.delivery === "totp" ? "6-digit code" : "Code"}
              />
            </div>

            <div className="field">
              <label htmlFor="delete-phrase">
                Type <span className="mono">DELETE</span> to confirm
              </label>
              <input
                id="delete-phrase"
                value={deletePhrase}
                onChange={(e) => setDeletePhrase(e.target.value)}
                autoComplete="off"
              />
            </div>

            {deleteError && <div className="error">{deleteError}</div>}

            <div className="delete-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetDeleteForm}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={
                  deleteBusy ||
                  deletePhrase !== "DELETE" ||
                  !deleteCode.trim() ||
                  (deleteChallenge.requires_password
                    ? deletePassword.length < 8
                    : !deleteEmailConfirm.trim())
                }
              >
                {deleteBusy ? "Deleting…" : "Permanently delete"}
              </button>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
