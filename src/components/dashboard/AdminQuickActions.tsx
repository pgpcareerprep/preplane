import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Users, Database, Scale, FileCode, Sliders, type LucideIcon } from "lucide-react";

type Action = { label: string; icon: LucideIcon; to: string };

const ACTIONS: Action[] = [
  { label: "Manage Users",   icon: Users,    to: "/settings/users" },
  { label: "Data Sources",   icon: Database, to: "/data-sources" },
  { label: "Scoring",        icon: Scale,    to: "/settings" },
  { label: "Role Ontology",  icon: FileCode, to: "/settings" },
  { label: "POC Config",     icon: Sliders,  to: "/settings" },
];

export function AdminQuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {ACTIONS.map((a, i) => (
        <motion.div
          key={a.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.4 + i * 0.04, ease: [0, 0, 0.2, 1] }}
          whileHover={{ scale: 1.02, transition: { duration: 0.22, ease: [0.34, 1.56, 0.64, 1] } }}
        >
          <Link
            to={a.to}
            className="group flex flex-col items-start gap-2 rounded-xl border border-dashed border-n300 p-4 hover:bg-card hover:border-n300 hover:border-solid hover:shadow-sm transition-all duration-150 ease-smooth"
          >
            <div className="h-9 w-9 rounded-md bg-n100 group-hover:bg-orange-50 text-n600 group-hover:text-orange-500 grid place-items-center transition-colors duration-150">
              <a.icon className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <span className="text-[13px] font-medium text-n800">{a.label}</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
