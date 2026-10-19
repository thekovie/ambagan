import type { Role } from "@/lib/enums";

interface Actor {
  role: Role;
  isActive: boolean;
}

/** Admins can do everything members can; deactivated accounts can do nothing. */
export function canAccess(user: Actor | null | undefined, required: Role): boolean {
  if (!user || !user.isActive) return false;
  return required === "MEMBER" || user.role === "ADMIN";
}
