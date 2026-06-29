import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, Trash2 } from "lucide-react";
import { ACCESS_LABEL, type PocAccessLevel } from "@/lib/pocDomains";
import { useCreatePoc, useUpdatePoc, type PocFormValues } from "@/lib/hooks/usePocMutations";
import { useDomainOptions } from "@/lib/hooks/useDomainOptions";
import { PocDeleteDialog } from "./PocDeleteDialog";
import { isOutreachOnlyPoc } from "@/lib/prepPocEligibility";

const ROLE_OPTIONS = [
  { value: "prep_poc", label: "Prep POC" },
  { value: "outreach_poc", label: "Outreach POC" },
  { value: "admin", label: "Admin" },
];

const ACCESS_OPTIONS: PocAccessLevel[] = ["admin", "allocator", "poc"];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  poc?: any | null; // null/undefined = create mode
};

const empty: PocFormValues = {
  name: "",
  email: "",
  role_type: "prep_poc",
  status: "active",
  primary_domain: "",
  domain_tags: [],
  max_threshold: 8,
  access_level: "poc",
};

export function PocEditDrawer({ open, onOpenChange, poc }: Props) {
  const isEdit = !!poc?.id;
  const [values, setValues] = useState<PocFormValues>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof PocFormValues, string>>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const { names: KNOWN_DOMAINS, isLoading: domainsLoading } = useDomainOptions();

  const create = useCreatePoc();
  const update = useUpdatePoc();
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (open) {
      setValues(
        isEdit
          ? {
              name: poc.name ?? "",
              email: poc.email ?? "",
              role_type: poc.role_type ?? "prep_poc",
              status: (poc.status === "inactive" ? "inactive" : "active"),
              primary_domain: poc.primary_domain ?? "",
              domain_tags: poc.domain_tags ?? [],
              max_threshold: isOutreachOnlyPoc(poc.role_type) ? null : (poc.max_threshold ?? 8),
              access_level: (poc.access_level as PocAccessLevel) ?? "poc",
            }
          : empty,
      );
      setErrors({});
    }
  }, [open, isEdit, poc]);

  const set = <K extends keyof PocFormValues>(k: K, v: PocFormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));

  const isOutreach = isOutreachOnlyPoc(values.role_type);

  const validate = () => {
    const e: typeof errors = {};
    if (!values.name.trim()) e.name = "Name is required";
    if (values.name.length > 100) e.name = "Name must be < 100 chars";
    const emailTrimmed = (values.email ?? "").trim();
    if (!emailTrimmed) e.email = "Email is required so the user can sign in";
    else if (emailTrimmed.length > 255) e.email = "Email too long";
    else if (!/^\S+@\S+\.\S+$/.test(emailTrimmed)) e.email = "Invalid email";
    if (!isOutreach) {
      if (values.max_threshold == null || values.max_threshold < 1 || values.max_threshold > 50) {
        e.max_threshold = "1–50";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const payload: PocFormValues = {
      ...values,
      name: values.name.trim(),
      email: values.email?.trim() || null,
      primary_domain: values.primary_domain || null,
      max_threshold: isOutreach ? null : values.max_threshold,
    };
    if (isEdit) {
      await update.mutateAsync({ id: poc.id, values: payload, previousName: poc.name });
    } else {
      await create.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  const addTag = (d: string) => {
    if (!values.domain_tags.includes(d)) set("domain_tags", [...values.domain_tags, d]);
    setAddDomainOpen(false);
  };
  const removeTag = (d: string) =>
    set("domain_tags", values.domain_tags.filter((x) => x !== d));

  const availableDomains = KNOWN_DOMAINS.filter(
    (d) => !values.domain_tags.includes(d) && d !== values.primary_domain,
  );


  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{isEdit ? "Edit POC" : "Add POC"}</SheetTitle>
            <SheetDescription>
              {isEdit ? "Update POC profile, domains, and capacity." : "Create a new POC profile."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            {/* Identity */}
            <div className="space-y-3">
              <div>
                <Label className="text-[12px]">Name *</Label>
                <Input
                  value={values.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Full name"
                  maxLength={100}
                  className="mt-1"
                />
                {errors.name && <p className="text-[11px] text-red-600 mt-1">{errors.name}</p>}
              </div>
              <div>
                <Label className="text-[12px]">Email</Label>
                <Input
                  type="email"
                  value={values.email ?? ""}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="poc@example.com"
                  maxLength={255}
                  className="mt-1"
                />
                {errors.email && <p className="text-[11px] text-red-600 mt-1">{errors.email}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[12px]">POC Type</Label>
                  <select
                    value={values.role_type}
                    onChange={(e) => {
                      const next = e.target.value;
                      setValues((s) => ({
                        ...s,
                        role_type: next,
                        ...(isOutreachOnlyPoc(next) ? { max_threshold: null } : {}),
                      }));
                    }}
                    className="mt-1 w-full h-9 rounded-md border bg-card px-3 text-[13px]"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-[12px]">Platform Role</Label>
                  <select
                    value={values.access_level ?? "poc"}
                    onChange={(e) => set("access_level", e.target.value as PocAccessLevel)}
                    className="mt-1 w-full h-9 rounded-md border bg-card px-3 text-[13px]"
                  >
                    {ACCESS_OPTIONS.map((a) => (
                      <option key={a} value={a}>{ACCESS_LABEL[a]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-n500 -mt-1">
                Eligibility for POC allocation depends on assigned domains, not access level. A POC with no primary or secondary domain is not eligible for any LMP.
              </p>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-[13px] font-medium text-n800">Active</div>
                <div className="text-[11px] text-n500">Inactive POCs are excluded from allocation.</div>
              </div>
              <Switch
                checked={values.status === "active"}
                onCheckedChange={(c) => set("status", c ? "active" : "inactive")}
              />
            </div>

            {/* Domains */}
            <div className="space-y-2">
              <Label className="text-[12px]">Primary domain</Label>
              <select
                value={values.primary_domain ?? ""}
                onChange={(e) => {
                  const next = e.target.value;
                  setValues((s) => ({
                    ...s,
                    primary_domain: next,
                    domain_tags: s.domain_tags.filter((t) => t !== next),
                  }));
                }}
                disabled={domainsLoading}
                className="w-full h-9 rounded-md border bg-card px-3 text-[13px] disabled:opacity-60"
              >
                <option value="">{domainsLoading ? "Loading…" : "— None —"}</option>
                {KNOWN_DOMAINS.filter((d) => d === values.primary_domain || !values.domain_tags.includes(d)).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-[12px]">Secondary domains</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px] rounded-md border p-2">
                {values.domain_tags.length === 0 && (
                  <span className="text-[11px] text-n400">No domains added</span>
                )}
                {values.domain_tags.map((d) => (
                  <Badge key={d} variant="secondary" className="gap-1 pl-2 pr-1 text-[11px]">
                    {d}
                    <button
                      onClick={() => removeTag(d)}
                      className="hover:bg-n200 rounded-sm"
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {availableDomains.length > 0 && (
                  <Popover open={addDomainOpen} onOpenChange={setAddDomainOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed text-n500 hover:text-n800 hover:border-n400"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-1">
                      <div className="max-h-60 overflow-y-auto">
                        {availableDomains.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => addTag(d)}
                            className="block w-full text-left px-2 py-1.5 text-[12px] rounded hover:bg-n100"
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {/* Capacity — operational POCs only */}
            {!isOutreach && (
            <div>
              <Label className="text-[12px]">Max active LMP threshold</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={values.max_threshold ?? 8}
                onChange={(e) => set("max_threshold", parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-32"
              />
              {errors.max_threshold && <p className="text-[11px] text-red-600 mt-1">{errors.max_threshold}</p>}
            </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                {isEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteOpen(true)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : isEdit ? "Save changes" : "Create POC"}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {isEdit && (
        <PocDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          poc={poc}
          onDeleted={() => {
            setDeleteOpen(false);
            onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
