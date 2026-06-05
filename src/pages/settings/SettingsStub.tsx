import type { LucideIcon } from "lucide-react";

export function SettingsStub({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900">{title}</h3>
        <p className="text-[13px] text-n500 mt-1">{description}</p>
      </header>
      <div className="rounded-lg border border-dashed border-n300 bg-card p-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-md bg-orange-50 text-orange-500 grid place-items-center mb-3">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <p className="text-[14px] text-n600">This section is part of the Lumina spec — coming up in a follow-up prompt.</p>
      </div>
    </div>
  );
}
