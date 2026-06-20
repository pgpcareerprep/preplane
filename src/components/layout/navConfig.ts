import {
  LayoutDashboard,
  PlusCircle,
  Target,
  Database,
  Settings,
  Users,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/rolesContext";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: Role[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
  roles?: Role[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
      { label: "Last Mile Prep", to: "/lmp", icon: Target },
      { label: "Create Process", to: "/processes/new", icon: PlusCircle, roles: ["admin", "allocator"] },
      { label: "Mentors", to: "/mentors", icon: Users },
      { label: "LMP Copilot", to: "/copilot", icon: Sparkles },
    ],
  },
  {
    label: "Admin",
    roles: ["admin"],
    items: [{ label: "Data Sources", to: "/data-sources", icon: Database }],
  },
  {
    label: "Repository",
    roles: ["allocator", "poc"],
    items: [{ label: "Repository", to: "/data-sources", icon: Database }],
  },
  {
    label: "Account",
    roles: ["admin", "allocator", "poc"],
    items: [{ label: "Settings", to: "/settings", icon: Settings }],
  },
];

export type FilteredNavGroup = { group: NavGroup; items: NavItem[] };

/** Role-filtered nav — shared by desktop sidebar and mobile drawer. */
export function filterNavGroups(role: Role): FilteredNavGroup[] {
  return NAV_GROUPS
    .filter((g) => !g.roles || g.roles.includes(role))
    .map((group) => ({
      group,
      items: group.items.filter((i) => !i.roles || i.roles.includes(role)),
    }))
    .filter(({ items }) => items.length > 0);
}

export function roleBadgeClass(role: Role): string {
  switch (role) {
    case "admin":
      return "bg-plum-400/15 text-plum-400 border-plum-400/30";
    case "allocator":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "poc":
      return "bg-teal-400/15 text-teal-400 border-teal-400/30";
  }
}
