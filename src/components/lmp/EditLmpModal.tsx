import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLmpMutation } from "@/lib/sheets/hooks";
import { useRole } from "@/lib/rolesContext";
import { useLmpPermission } from "@/lib/hooks/usePermissions";
import { useDomainOptions } from "@/lib/hooks/useDomainOptions";
import type { LmpRecord } from "@/lib/lmpTypes";

interface EditLmpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rec: LmpRecord;
}

export function EditLmpModal({ open, onOpenChange, rec }: EditLmpModalProps) {
  const { role } = useRole();
  const { canEditField } = useLmpPermission({
    prep_poc: rec.prepPoc?.name,
    support_poc: rec.supportPoc?.name,
    outreach_poc: rec.outreachPoc?.name,
    allocator: rec.allocator,
  });
  const { update } = useLmpMutation();
  const { options: domainOptions } = useDomainOptions();

  const [company, setCompany] = useState(rec.company);
  const [roleName, setRoleName] = useState(rec.role);
  const [domain, setDomain] = useState(rec.domain ?? "");

  const canEditCompany = canEditField("company");
  const canEditRole = canEditField("role");
  const canEditDomain = canEditField("domain");

  const handleSave = () => {
    const patch: Record<string, unknown> = {};
    if (canEditCompany && company !== rec.company) patch.company = company;
    if (canEditRole && roleName !== rec.role) patch.role = roleName;
    if (canEditDomain && domain !== rec.domain) patch.domain = domain;
    if (Object.keys(patch).length > 0) {
      update.mutate({ id: rec.id, patch });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit LMP</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {canEditCompany && (
            <div className="flex flex-col gap-1.5">
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          )}
          {canEditRole && (
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} />
            </div>
          )}
          {canEditDomain && (
            <div className="flex flex-col gap-1.5">
              <Label>Domain</Label>
              {domainOptions.length > 0 ? (
                <Select value={domain} onValueChange={setDomain}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domainOptions.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
