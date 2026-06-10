import { NavLink, Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Settings, Scale, Users, ClipboardList, UserCog, Database, Shield, Bell, Brain, BookOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/rolesContext";

type Item = { label: string; to: string; icon: LucideIcon; roles?: Array<"admin" | "allocator" | "poc"> };

const ITEMS: Item[] = [
  { label: "General",          to: "/settings",             icon: Settings },
  { label: "Scoring Weights",  to: "/settings/scoring",     icon: Scale, roles: ["admin", "allocator"] },
  { label: "POC Domain Config",to: "/settings/poc-domains", icon: Users, roles: ["admin", "allocator"] },
  { label: "Feedback Forms",   to: "/settings/feedback",    icon: ClipboardList, roles: ["admin", "allocator"] },
  { label: "User Management",  to: "/settings/users",       icon: UserCog, roles: ["admin"] },
  { label: "AI Knowledge Base",to: "/settings/knowledge",   icon: Brain, roles: ["admin"] },
  { label: "LMP Guide",        to: "/settings/lmp-guide",   icon: BookOpen, roles: ["admin", "allocator"] },
  { label: "Notifications",    to: "/settings/notifications",icon: Bell, roles: ["admin", "allocator"] },
];

export function SettingsLayout() {
  const { pathname } = useLocation();
  const { role } = useRole();
  const items = ITEMS.filter(i => !i.roles || i.roles.includes(role));
  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
        className="relative overflow-hidden rounded-2xl surface-feature border border-orange-200/60 p-6 md:p-7 shadow-md"
      >
        <div className="pointer-events-none absolute -top-12 -right-10 h-44 w-44 rounded-full bg-orange-200/50 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/4 h-28 w-28 rounded-full bg-yellow-200/60 blur-3xl" />
        <div className="relative">
          <div className="label-eyebrow mb-2 text-orange-600">Admin</div>
          <h2 className="text-[34px] leading-[1.15] font-bold tracking-[-1px] text-n900">
            Platform <span className="font-display text-orange-500 text-[32px]">settings</span>
          </h2>
          <p className="mt-2 text-[14px] text-n700 leading-[1.6] max-w-2xl">
            Configure scoring weights, POC domains, roles, and access.
          </p>
        </div>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left nav */}
        <aside className="w-full lg:w-[240px] shrink-0 lg:sticky lg:top-[76px]">
          <div className="rounded-2xl bg-card border border-n200 shadow-sm p-3">
            <ul className="space-y-0.5">
              {items.map(item => {
                const active = item.to === "/settings"
                  ? pathname === "/settings"
                  : pathname.startsWith(item.to);
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[14px] transition-colors duration-150 ease-smooth",
                        active
                          ? "bg-orange-50 text-orange-600 font-medium"
                          : "text-n700 hover:bg-n50 hover:text-n900",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-orange-500" />
                      )}
                      <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        {/* Content */}
        <div className="w-full min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
