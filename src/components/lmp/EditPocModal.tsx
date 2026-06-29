import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import type { Requisition } from "@/lib/lmpProcessMutations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, Shuffle, Check } from "lucide-react";
import { classifyAssignment } from "@/lib/pocCapability";
import { usePocCapabilityList } from "@/lib/hooks/usePocCapabilityLive";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { TAG_STYLES, type AllocationTag } from "@/lib/pocAllocation";

type Slot = "domain" | "behavioral";

export function EditPocModal({
  req, open, onOpenChange,
}: { req: Requisition | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [slot, setSlot] = useState<Slot>("domain");
  const [domainPick, setDomainPick] = useState<string | null>(null);
  const [behavioralPick, setBehavioralPick] = useState<string | null>(null);
  const { list: pocList } = usePocCapabilityList();
  const { pocs: eligiblePrepPocs } = useEligiblePrepPocs();
  const eligibleIds = useMemo(() => new Set(eligiblePrepPocs.map((p) => p.pocId)), [eligiblePrepPocs]);

  const candidates = useMemo(() => {
    if (!req) return [];
    const operational = pocList.filter((p) => p.id && eligibleIds.has(p.id));
    if (slot === "behavioral") {
      return operational.filter((p) => p.behavioralPoolMember);
    }
    return operational.filter((p) => p.pocType === "domain" || p.pocType === "cross");
  }, [slot, req, pocList, eligibleIds]);

  if (!req) return null;

  const currentDomain = domainPick ?? (req.prepPoc?.name || req.domainPrepPoc.name);
  const currentBehavioral = behavioralPick ?? req.supportPoc?.name ?? "";
  const fit = classifyAssignment(currentDomain, req.domain);
  const isCross = slot === "domain" && fit === "cross";

  const confirm = () => {
    const changes: AllocationTag[] = [];
    if (domainPick && domainPick !== (req.prepPoc?.name || req.domainPrepPoc.name)) changes.push("Manual Override");
    if (behavioralPick && behavioralPick !== (req.supportPoc?.name ?? "") && !changes.length) {
      changes.push("Manual Override");
    }
    if (changes.length === 0) {
      toast.info("No changes to save");
    } else {
      toast.success("POC assignment updated", {
        description: "Manual Override tag will be added to allocation tags.",
      });
    }
    onOpenChange(false);
    setDomainPick(null);
    setBehavioralPick(null);
    setSlot("domain");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] p-0 rounded-2xl shadow-xl border-n200 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="p-6 pb-2">
          <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">Edit Assignment</div>
          <DialogTitle className="text-[20px] font-semibold text-n900 tracking-[-0.3px]">
            {req.role} <span className="text-n500 font-normal">@</span> {req.company}
          </DialogTitle>
          <div className="mt-1 text-[12px] text-n500">
            Requisition domain: <span className="font-medium text-n700">{req.domain}</span>
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Slot toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-n100 border border-n200 w-fit">
            <button
              onClick={() => setSlot("domain")}
              className={cn(
                "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                slot === "domain" ? "bg-card shadow-sm text-n900" : "text-n600 hover:text-n900",
              )}
            >
              Prep POC
            </button>
            <button
              onClick={() => setSlot("behavioral")}
              className={cn(
                "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                slot === "behavioral" ? "bg-card shadow-sm text-n900" : "text-n600 hover:text-n900",
              )}
            >
              Support POC
            </button>
          </div>

          {/* Current assignment summary */}
          <CurrentSlotCard
            slotLabel={slot === "domain" ? "Prep" : "Support"}
            poc={slot === "domain" ? (req.prepPoc || req.domainPrepPoc) : (req.supportPoc ?? req.prepPoc ?? req.domainPrepPoc)}
            picked={slot === "domain" ? domainPick : behavioralPick}
          />

          {isCross && (
            <div className="flex items-start gap-2 rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-[12.5px] text-yellow-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600" strokeWidth={2} />
              <div className="leading-snug">
                <div className="font-semibold">Cross-domain assignment</div>
                <div className="mt-0.5 text-yellow-800">
                  <span className="font-medium">{currentDomain}</span> doesn't own
                  {" "}<span className="font-medium">{req.domain}</span>. Will be tagged
                  <span className="font-medium"> Cross-Domain</span> and won't affect ranking.
                </div>
              </div>
            </div>
          )}

          {/* Candidate list */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.5px] text-n500 font-semibold mb-2">
              Choose a {slot === "domain" ? "domain" : "behavioral"} POC
            </div>
            <div className="max-h-[260px] overflow-y-auto rounded-lg border border-n200 divide-y divide-n100">
              {candidates.map((p) => {
                const selected =
                  slot === "domain"
                    ? currentDomain === p.name
                    : currentBehavioral === p.name;
                const overload = p.maxThreshold > 0 && p.currentLoad >= p.maxThreshold;
                const showLoad = p.maxThreshold > 0;
                return (
                  <button
                    key={p.name}
                    onClick={() =>
                      slot === "domain" ? setDomainPick(p.name) : setBehavioralPick(p.name)
                    }
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-n50 transition-colors",
                      selected && "bg-orange-50 hover:bg-orange-50",
                    )}
                  >
                    <span
                      className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                        p.color,
                      )}
                    >
                      {p.initials}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-n900 truncate">{p.name}</div>
                      <div className="text-[11px] text-n500 truncate">
                        {p.domains.length ? p.domains.join(", ") : "—"}
                      </div>
                    </div>
                    {showLoad && (
                    <div className="text-right text-[11px] text-n600 shrink-0 tabular-nums">
                      {p.currentLoad}/{p.maxThreshold}
                      {overload && (
                        <span className="block text-[10px] text-coral-600 font-medium">
                          Overloaded
                        </span>
                      )}
                    </div>
                    )}
                    {selected && <Check className="h-4 w-4 text-orange-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Manual Override preview */}
          {((domainPick && domainPick !== req.domainPrepPoc.name) ||
            (behavioralPick && behavioralPick !== (req.supportPoc?.name ?? ""))) && (
            <div className="rounded-lg border border-sky-400/30 bg-sky-400/10 p-3 flex items-start gap-2">
              <Shuffle className="h-4 w-4 text-sky-500 mt-0.5" />
              <div className="text-[12px] text-n700 leading-snug">
                <span className="font-semibold">Manual Override</span> tag will be added to this requisition.
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className={cn("inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium", TAG_STYLES["Manual Override"])}>
                    Manual Override
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md text-n600 hover:text-n900 hover:bg-n100 text-[13px] font-medium px-3 h-9"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              className="rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 h-9 shadow-sm transition-colors"
            >
              Save Assignment
            </button>
          </div>
        </div>

        <DialogFooter className="hidden" />
      </DialogContent>
    </Dialog>
  );
}

function CurrentSlotCard({
  slotLabel, poc, picked,
}: { slotLabel: string; poc: { name: string; initials: string; color: string }; picked: string | null }) {
  return (
    <div className="rounded-xl border border-n200 bg-n50 p-3 flex items-center gap-3">
      <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-semibold", poc.color)}>
        {poc.initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">
          Current {slotLabel}
        </div>
        <div className="text-[14px] font-medium text-n900 truncate">{poc.name}</div>
        {picked && picked !== poc.name && (
          <div className="mt-0.5 text-[11px] text-orange-600">
            → Will change to <b>{picked}</b>
          </div>
        )}
      </div>
    </div>
  );
}