"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { HouseholdResponse, UserResponse } from "@ledger/api-client";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [households, setHouseholds] = useState<HouseholdResponse[]>([]);

  useEffect(() => {
    Promise.all([api.me(), api.listHouseholds()])
      .then(([me, hh]) => {
        setUser(me);
        setHouseholds(hh);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api.logout();
    router.replace("/login");
  }

  if (!user) return null;

  return (
    <div className="shell">
      <header>
        <h1>Welcome back, {user.display_name}</h1>
        <button onClick={logout}>Sign out</button>
      </header>
      <div className="grid">
        {households.map((h) => (
          <div className="tile" key={h.id}>
            <h2>{h.name}</h2>
            <p>Connect a bank to start syncing transactions.</p>
            <span className="badge">No accounts linked yet</span>
          </div>
        ))}
        <div className="tile">
          <h2>Security</h2>
          <p>
            {user.mfa_enabled
              ? "Two-factor authentication is on."
              : "Two-factor authentication is off - enable it in settings."}
          </p>
          <span className="badge">{user.mfa_enabled ? "MFA enabled" : "MFA disabled"}</span>
        </div>
      </div>
    </div>
  );
}
