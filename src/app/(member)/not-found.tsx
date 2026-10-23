import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

export const metadata: Metadata = { title: "Page not found" };

/** A missing statement or page inside the member area keeps the header and dock instead of replacing them. */
export default function MemberNotFound() {
  return <NotFoundView inShell />;
}
