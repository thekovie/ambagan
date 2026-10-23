import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

export const metadata: Metadata = { title: "Page not found" };

/** A missing page inside the admin area keeps the header and dock instead of replacing them. */
export default function AdminNotFound() {
  return <NotFoundView inShell />;
}
