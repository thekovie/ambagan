import {
  BadgeCheck,
  CircleUser,
  History,
  House,
  LayoutDashboard,
  Mail,
  ReceiptText,
  Repeat,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shows a count (payments waiting for the admin) on the dock item. */
  badge?: "pending";
}

export type ShellVariant = "member" | "admin";

/**
 * `primary` items sit in the floating dock. Anything in `more` opens from the dock's "More" bubble, so the admin's
 * seven destinations fit in four dock slots.
 */
export const NAV: Record<ShellVariant, { primary: NavItem[]; more: NavItem[] }> = {
  member: {
    primary: [
      { href: "/dashboard", label: "Home", icon: House },
      { href: "/statements", label: "Statements", icon: ReceiptText },
      { href: "/payments", label: "History", icon: History },
      { href: "/settings", label: "Me", icon: CircleUser },
    ],
    more: [],
  },
  admin: {
    primary: [
      { href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/payments", label: "Verify", icon: BadgeCheck, badge: "pending" },
      { href: "/admin/statements", label: "Statements", icon: ReceiptText },
    ],
    more: [
      { href: "/admin/members", label: "Members", icon: Users },
      { href: "/admin/subscriptions", label: "Plans", icon: Repeat },
      { href: "/admin/notifications", label: "Emails", icon: Mail },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
};

/** Where the wordmark takes you. */
export const HOME: Record<ShellVariant, string> = { member: "/dashboard", admin: "/admin/dashboard" };
