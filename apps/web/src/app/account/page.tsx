"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CategoryResponse, ConnectionResponse, UserResponse } from "@ledger/api-client";
import { BankLogo } from "@/components/BankLogo";
import { CategoryGlyph } from "@/components/CategoryIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CategoryIcon, AppShell } from "@/components/ui";
import { WoneyLoader } from "@/components/WoneyLoader";
import { api } from "@/lib/api";
import { isUnauthorized } from "@/lib/errors";

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

  if (!user) {
    return (
      <div className="app-main">
        <WoneyLoader label="Loading account…" />
      </div>
    );
  }

  const initial = (displayName || user.email || "W").trim().charAt(0).toUpperCase();

  return (
    <AppShell householdId={householdId}>
      <div className="page-header">
        <div>
          <h1>Account</h1>
          <p>Your profile, linked banks, and how Woney looks.</p>
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
        <ThemeToggle />
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

        <section className="account-panel">
          <h3>Appearance</h3>
          <p className="panel-lede">
            Light mode is gold on white. Dark mode is gold on black. Your choice is saved on this
            device.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "14px 16px",
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--surface-muted)",
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>Theme</div>
              <div className="muted" style={{ fontSize: "0.85rem", marginTop: 2 }}>
                Switch between light and dark
              </div>
            </div>
            <ThemeToggle />
          </div>
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
                                ? "2px solid var(--gold)"
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
                                ? "2px solid var(--gold)"
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
    </AppShell>
  );
}
