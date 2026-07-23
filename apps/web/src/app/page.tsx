"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthBrand } from "@/components/AuthBrand";
import { hasSession } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (hasSession()) router.replace("/dashboard");
  }, [router]);

  return (
    <main className="auth">
      <AuthBrand
        headline="Money that feels calm."
        lede="Canadian bank sync, clear categories, and a planner that never invents the math."
        footer="Built for trust. Tuned for everyday use."
      />
      <section className="auth-panel">
        <div className="auth-card">
          <h1>Welcome to Woney</h1>
          <p className="sub">Personal finance without the noise.</p>
          <Link href="/login" className="btn btn-primary btn-block" style={{ textDecoration: "none" }}>
            Sign in
          </Link>
          <Link
            href="/register"
            className="btn btn-ghost btn-block"
            style={{ textDecoration: "none", marginTop: 10 }}
          >
            Create an account
          </Link>
        </div>
      </section>
    </main>
  );
}
