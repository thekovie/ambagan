import {
  BadgeCheck,
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
}

export type ShellVariant = "member" | "admin";

export const NAV: Record<ShellVariant, NavItem[]> = {
  member: [
    { href: "/dashboard", label: "Home", icon: House },
    { href: "/statements", label: "Statements", icon: ReceiptText },
    { href: "/payments", label: "History", icon: History },
    { href: "/settings", label: "Settings", icon: Settings },
  ],
  admin: [
    { href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/payments", label: "Verify", icon: BadgeCheck },
    { href: "/admin/statements", label: "Statements", icon: ReceiptText },
    { href: "/admin/members", label: "Members", icon: Users },
    { href: "/admin/subscriptions", label: "Plans", icon: Repeat },
    { href: "/admin/notifications", label: "Emails", icon: Mail },
    { href: "/admin/settings", label: "Settings", icon: Settings },
  ],
};
