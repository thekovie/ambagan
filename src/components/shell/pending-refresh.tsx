"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_EVERY_MS = 60_000;

/**
 * Keeps the dock's "waiting for you" count honest when a member reports a payment in their own browser: it refreshes
 * the server-rendered shell when the tab becomes visible again and once a minute while it is. Form fields keep their
 * values (a refresh re-renders server output, it does not reload the page).
 */
export function PendingRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, REFRESH_EVERY_MS);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
