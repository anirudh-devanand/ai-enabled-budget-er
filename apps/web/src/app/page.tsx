"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Landing } from "@/components/Landing";
import { hasSession } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (hasSession()) router.replace("/dashboard");
  }, [router]);

  return <Landing />;
}
