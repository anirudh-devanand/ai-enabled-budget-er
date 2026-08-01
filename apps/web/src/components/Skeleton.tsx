"use client";

import type { CSSProperties, ReactNode } from "react";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  /** Decorative — parent should set aria-busy / role=status. */
  "aria-hidden"?: boolean;
};

/** Soft pulse block using theme surface tokens. */
export function Skeleton({
  className,
  style,
  width,
  height,
  radius,
  "aria-hidden": ariaHidden = true,
}: SkeletonProps) {
  const merged: CSSProperties = {
    width,
    height,
    borderRadius: radius,
    ...style,
  };
  return (
    <span
      className={["sk", className].filter(Boolean).join(" ")}
      style={merged}
      aria-hidden={ariaHidden}
    />
  );
}

export function SkeletonText({
  lines = 1,
  widths,
  className,
}: {
  lines?: number;
  widths?: Array<string | number>;
  className?: string;
}) {
  return (
    <div className={["sk-text", className].filter(Boolean).join(" ")} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="sk-line"
          width={widths?.[i] ?? (i === lines - 1 && lines > 1 ? "68%" : "100%")}
        />
      ))}
    </div>
  );
}

/** Transaction / budget list row placeholder. */
export function SkeletonRow() {
  return (
    <div className="txn-row sk-row" aria-hidden>
      <Skeleton className="sk-avatar" />
      <div className="txn-meta">
        <Skeleton className="sk-line" width="42%" height={14} />
        <Skeleton className="sk-line" width="28%" height={11} style={{ marginTop: 8 }} />
      </div>
      <Skeleton className="sk-amount" width={72} height={16} />
    </div>
  );
}

/** Account / goal card placeholder. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={["account-card", "sk-card", className].filter(Boolean).join(" ")} aria-hidden>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <Skeleton className="sk-avatar" />
        <Skeleton className="sk-line" width="55%" height={12} />
      </div>
      <Skeleton className="sk-line" width="48%" height={28} style={{ marginBottom: 10 }} />
      <Skeleton className="sk-line" width="36%" height={11} />
    </div>
  );
}

export function SkeletonChart({ height = 220 }: { height?: number }) {
  return (
    <div className="sk-chart" style={{ height }} aria-hidden>
      <Skeleton className="sk-chart-area" />
    </div>
  );
}

function SkeletonStatus({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sk-page" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <SkeletonStatus label="Loading dashboard">
      <div className="page-header">
        <div>
          <Skeleton width={180} height={32} radius={8} />
          <Skeleton width={260} height={14} radius={6} style={{ marginTop: 12 }} />
        </div>
      </div>
      <div className="hero-balance sk-hero">
        <Skeleton width={88} height={12} radius={4} />
        <Skeleton width={200} height={40} radius={8} style={{ marginTop: 14 }} />
        <Skeleton width={140} height={12} radius={4} style={{ marginTop: 14 }} />
      </div>
      <div className="section-title">
        <Skeleton width={64} height={14} radius={4} />
      </div>
      <div className="grid">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="section-title">
        <Skeleton width={120} height={14} radius={4} />
      </div>
      <div className="list-card">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </SkeletonStatus>
  );
}

export function TransactionsSkeleton() {
  return (
    <SkeletonStatus label="Loading activity">
      <div className="list-card">
        {Array.from({ length: 8 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </SkeletonStatus>
  );
}

export function InsightsSkeleton() {
  return (
    <SkeletonStatus label="Loading insights">
      <div className="insight-summary">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="insight-stat sk-stat" key={i}>
            <Skeleton width={64} height={11} radius={4} />
            <Skeleton width="70%" height={26} radius={6} style={{ marginTop: 12 }} />
          </div>
        ))}
      </div>
      <div className="tile chart-tile">
        <Skeleton width={100} height={20} radius={6} />
        <Skeleton width="55%" height={12} radius={4} style={{ marginTop: 10 }} />
        <SkeletonChart height={240} />
      </div>
      <div className="insight-split">
        <div className="tile chart-tile">
          <Skeleton width={160} height={20} radius={6} />
          <Skeleton width="60%" height={12} radius={4} style={{ marginTop: 10 }} />
          <SkeletonChart height={200} />
        </div>
        <div className="tile chart-tile">
          <Skeleton width={150} height={20} radius={6} />
          <Skeleton width="55%" height={12} radius={4} style={{ marginTop: 10 }} />
          <SkeletonChart height={200} />
        </div>
      </div>
    </SkeletonStatus>
  );
}

export function AccountSkeleton() {
  return (
    <SkeletonStatus label="Loading account">
      <div className="page-header">
        <div>
          <Skeleton width={140} height={32} radius={8} />
          <Skeleton width="70%" height={14} radius={6} style={{ marginTop: 12 }} />
        </div>
      </div>
      <section className="account-hero sk-account-hero">
        <Skeleton className="sk-avatar-lg" />
        <div style={{ flex: 1 }}>
          <Skeleton width="40%" height={22} radius={6} />
          <Skeleton width="55%" height={12} radius={4} style={{ marginTop: 10 }} />
        </div>
      </section>
      <div className="tile" style={{ marginBottom: 16 }}>
        <Skeleton width={120} height={18} radius={6} />
        <Skeleton width="100%" height={44} radius={10} style={{ marginTop: 14 }} />
        <Skeleton width="100%" height={44} radius={10} style={{ marginTop: 10 }} />
      </div>
      <div className="list-card">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </SkeletonStatus>
  );
}

export function AccountDetailSkeleton() {
  return (
    <SkeletonStatus label="Loading account details">
      <div className="page-header">
        <div>
          <Skeleton width={200} height={32} radius={8} />
          <Skeleton width={180} height={14} radius={6} style={{ marginTop: 12 }} />
        </div>
      </div>
      <div className="hero-balance sk-hero">
        <Skeleton width={64} height={12} radius={4} />
        <Skeleton width={180} height={40} radius={8} style={{ marginTop: 14 }} />
        <Skeleton width={48} height={12} radius={4} style={{ marginTop: 14 }} />
      </div>
      <div className="tile" style={{ maxWidth: 480, marginBottom: 24 }}>
        <Skeleton width={130} height={20} radius={6} />
        <Skeleton width="100%" height={44} radius={10} style={{ marginTop: 14 }} />
        <Skeleton width="100%" height={44} radius={10} style={{ marginTop: 10 }} />
      </div>
      <div className="section-title">
        <Skeleton width={120} height={14} radius={4} />
      </div>
      <div className="list-card">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </SkeletonStatus>
  );
}

export function BudgetsSkeleton() {
  return (
    <SkeletonStatus label="Loading budgets">
      <div className="list-card">
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    </SkeletonStatus>
  );
}

export function GoalsSkeleton() {
  return (
    <SkeletonStatus label="Loading goals">
      <div className="tile" style={{ marginBottom: 20 }}>
        <Skeleton width={100} height={20} radius={6} />
        <div className="goal-form-grid" style={{ marginTop: 14 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} width="100%" height={44} radius={10} />
          ))}
        </div>
      </div>
      <div className="grid">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </SkeletonStatus>
  );
}

export function AssistantSkeleton() {
  return (
    <SkeletonStatus label="Starting assistant">
      <div className="list-card sk-assistant" style={{ minHeight: 360, padding: 20 }}>
        <Skeleton width="62%" height={64} radius={16} style={{ marginBottom: 16 }} />
        <Skeleton
          width="48%"
          height={56}
          radius={16}
          style={{ marginLeft: "auto", marginBottom: 16 }}
        />
        <Skeleton width="55%" height={64} radius={16} />
      </div>
    </SkeletonStatus>
  );
}

export function ConnectCardSkeleton() {
  return (
    <div className="card connect-card sk-connect" role="status" aria-live="polite" aria-busy="true">
      <Skeleton width={160} height={22} radius={6} />
      <Skeleton width="90%" height={12} radius={4} style={{ marginTop: 12 }} />
      <Skeleton width="75%" height={12} radius={4} style={{ marginTop: 8 }} />
      <Skeleton width={160} height={44} radius={999} style={{ marginTop: 20 }} />
    </div>
  );
}
