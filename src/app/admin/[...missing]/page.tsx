import { notFound } from "next/navigation";

/**
 * Any unknown address under /admin. Without this, Next answers an unmatched path with the root 404 and never enters the
 * admin layout, so a typo would lose the header and dock. (Non-admins still get the same 404: the layout checks first.)
 */
export default function UnknownAdminPage(): never {
  notFound();
}
