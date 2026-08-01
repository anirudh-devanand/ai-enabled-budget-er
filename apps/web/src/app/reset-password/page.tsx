"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Suspense, useMemo, useState } from "react";
import { AuthBrand } from "@/components/AuthBrand";
import { AuthAlert, ENTER_EASE, FadeIn } from "@/components/MotionEnter";
import { PasswordStrength } from "@/components/ui";
import { api } from "@/lib/api";
import { authErrorMessage } from "@/lib/errors";
import { passwordScore } from "@/lib/ui";

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const token = (params.get("token") || "").trim();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const strength = useMemo(() => passwordScore(password), [password]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("This reset link is missing a token. Request a new one from the sign-in page.");
      return;
    }
    if (strength.score < 3) {
      setError("Choose a stronger password before continuing.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await api.confirmPasswordReset(token, password);
      setDone(true);
      setTimeout(() => router.replace("/login"), 1600);
    } catch (err) {
      setError(authErrorMessage(err, "Could not reset password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-shell">
        <AuthBrand
          headline="Choose a new password."
          lede="Use something strong and unique — then sign in with your new credentials."
        />
        <section className="auth-panel">
          <FadeIn y={10} className="auth-card">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={done ? "done" : "form"}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: reduce ? 0 : 0.28, ease: ENTER_EASE }}
              >
                <h1>{done ? "Password updated" : "Reset password"}</h1>
                <p className="sub">
                  {done
                    ? "You’re all set. Redirecting you to sign in…"
                    : token
                      ? "Enter a new password for your account."
                      : "This link is incomplete."}
                </p>
                {!done && token && (
                  <form onSubmit={submit}>
                    <div className="field">
                      <label htmlFor="password">New password</label>
                      <input
                        id="password"
                        name="new-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoFocus
                      />
                      <PasswordStrength password={password} />
                    </div>
                    <div className="field">
                      <label htmlFor="confirm">Confirm password</label>
                      <input
                        id="confirm"
                        name="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        minLength={10}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                      />
                    </div>
                    <button
                      className="btn btn-primary btn-block"
                      disabled={busy || strength.score < 3}
                    >
                      {busy ? "Saving…" : "Update password"}
                    </button>
                  </form>
                )}
              </motion.div>
            </AnimatePresence>
            <AuthAlert message={error} />
            <p className="alt">
              <Link href="/login">Back to sign in</Link>
              {" · "}
              <Link href="/forgot-password">Request a new link</Link>
            </p>
          </FadeIn>
        </section>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}
