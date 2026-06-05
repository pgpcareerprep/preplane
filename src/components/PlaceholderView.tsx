import { Sparkles, type LucideIcon } from "lucide-react";
import { useRole, type Role } from "@/lib/rolesContext";

type Props = {
  eyebrow: string;
  title: string;
  tagline?: string;
  description: string;
  icon?: LucideIcon;
  scopedTo?: Role[];
  primaryAction?: { label: string; icon?: LucideIcon };
  upcoming?: string[];
};

export function PlaceholderView({
  eyebrow,
  title,
  tagline,
  description,
  icon: Icon = Sparkles,
  scopedTo,
  primaryAction,
  upcoming,
}: Props) {
  const { viewAsRole: role } = useRole();
  const inScope = !scopedTo || scopedTo.includes(role);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="max-w-2xl">
          <div className="label-eyebrow mb-2">{eyebrow}</div>
          <h2 className="text-[36px] leading-[1.15] font-bold tracking-[-1px] text-n900">
            {title}
            {tagline && (
              <>
                {" "}
                <span className="font-display text-orange-500 text-[34px]">{tagline}</span>
              </>
            )}
          </h2>
          <p className="mt-2 text-[14px] text-n500 leading-[1.6]">{description}</p>
        </div>

        {primaryAction && inScope && (
          <button className="inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[14px] font-medium px-4 py-2.5 shadow-sm transition-colors duration-150 ease-smooth">
            {primaryAction.icon && <primaryAction.icon className="h-4 w-4" strokeWidth={1.75} />}
            {primaryAction.label}
          </button>
        )}
      </div>

      {/* Body */}
      {!inScope ? (
        <div className="rounded-lg border border-n200 bg-white p-8 shadow-sm">
          <div className="label-eyebrow text-coral-600 mb-2">Restricted</div>
          <p className="text-[14px] text-n600">
            This view is scoped to {scopedTo!.join(" / ")}. Switch role from the sidebar to preview it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-lg border border-n200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-md bg-orange-50 text-orange-500 grid place-items-center">
                <Icon className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <div className="text-[16px] font-medium text-n900">Coming next</div>
                <div className="text-[12px] text-n500">This view will be built in a follow-up step.</div>
              </div>
            </div>
            <p className="text-[14px] leading-[1.65] text-n600">
              The Lumina shell, design tokens, role-aware navigation and routing are wired up.
              Each individual screen (KPIs, tables, drag-and-drop boards, AI panels) is a focused
              follow-up so we can keep quality high.
            </p>
          </div>

          <div className="rounded-lg border border-n200 bg-white p-6 shadow-sm">
            <div className="label-eyebrow mb-3">What lands here</div>
            <ul className="space-y-2.5">
              {(upcoming ?? ["Hero KPI bento", "Filterable table", "AI assist panel"]).map(item => (
                <li key={item} className="flex items-start gap-2 text-[13px] text-n700">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}