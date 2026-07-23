"use client";

export function WoneyLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="woney-loader" role="status" aria-live="polite" aria-label={label}>
      <div className="woney-loader-mark" aria-hidden>
        <span className="woney-loader-word">Woney</span>
        <span className="woney-loader-ring" />
      </div>
    </div>
  );
}
