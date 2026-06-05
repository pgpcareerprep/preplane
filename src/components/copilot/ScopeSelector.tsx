import { ChevronDown, Globe, Briefcase, GraduationCap, UserCircle2, Users, Award, BarChart3, Zap, type LucideIcon } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type CopilotScope =
  | "auto" | "lmp" | "student" | "poc" | "mentor" | "alumni" | "analytics" | "action";

export const SCOPES: { id: CopilotScope; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "auto",      label: "Auto",      hint: "Let Copilot pick the best scope",     icon: Globe },
  { id: "lmp",       label: "LMP",       hint: "Bias to LMP processes / companies",   icon: Briefcase },
  { id: "student",   label: "Student",   hint: "Bias to candidates / students",       icon: GraduationCap },
  { id: "poc",       label: "POC",       hint: "Bias to Prep / Outreach POCs",        icon: UserCircle2 },
  { id: "mentor",    label: "Mentor",    hint: "Bias to mentors",                     icon: Users },
  { id: "alumni",    label: "Alumni",    hint: "Bias to alumni records",              icon: Award },
  { id: "analytics", label: "Analytics", hint: "Trends, breakdowns, comparisons",     icon: BarChart3 },
  { id: "action",    label: "Action",    hint: "Updates, assignments, writes",        icon: Zap },
];

export function ScopeSelector({ scope, onChange }: { scope: CopilotScope; onChange: (s: CopilotScope) => void }) {
  const active = SCOPES.find(s => s.id === scope) ?? SCOPES[0];
  const Icon = active.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[12px] font-medium hover:bg-n100",
            scope === "auto" ? "text-n700" : "text-orange-600 bg-orange-50 hover:bg-orange-100",
          )}
          aria-label="Scope"
        >
          <Icon className="h-3 w-3" /> {active.label} <ChevronDown className="h-3 w-3 text-n400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {SCOPES.map(s => {
          const I = s.icon;
          return (
            <DropdownMenuItem key={s.id} onClick={() => onChange(s.id)}>
              <div className="flex items-start gap-2">
                <I className="h-3.5 w-3.5 mt-0.5 text-n500" />
                <div className="flex flex-col">
                  <span className={cn("text-[12.5px]", s.id === scope ? "font-semibold text-n900" : "text-n800")}>{s.label}</span>
                  <span className="text-[10.5px] text-n500">{s.hint}</span>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
