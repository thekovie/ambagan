import type { Metadata } from "next";
import { NotFoundView } from "@/components/not-found-view";

export const metadata: Metadata = { title: "Page not found" };

/** Any address that doesn't exist (and the private-link 404s): a full page, still answered with a real 404. */
export default function NotFound() {
  return <NotFoundView />;
}
