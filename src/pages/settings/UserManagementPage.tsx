import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, UserPlus, Pencil, Trash2, Loader2, ShieldCheck, ShieldOff } from "lucide-react";

import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { clearCachePrefix } from "@/lib/hooks/useDbData";

type DbRole = "admin" | "allocator" | "poc";
const ROLE_LABEL: Record<DbRole, string> = { admin: "Admin", allocator: "Allocator", poc: "POC" };
const ROLE_PILL: Record<DbRole, string> = {
  allocator: "bg-sky-400/10 text-sky-600 border-sky-400/30",
  poc: "bg-teal-50 text-teal-600 border-teal-200",
  admin: "bg-plum-400/10 text-plum-400 border-plum-400/30",
};

type UserRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  email: string;
  role: DbRole;
  is_active: boolean;
  access_status: string;
  last_login_at: string | null;
};

const isGranted = (u: { access_status: string; is_active: boolean }) =>
  u.access_status === "approved" && u.is_active !== false;


const FILTERS = ["All", "Admins", "Allocators", "POCs"] as const;
type Filter = typeof FILTERS[number];

const initialsOf = (n: string) =>
  n.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? "").join("");

function fmtLastActive(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "—";
  const days = Math.floor((Date.now() - +d) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

async function fetchUsers(): Promise<UserRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,user_id,display_name,email,role,is_active,access_status,last_login_at")
    .order("display_name", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r): UserRow => ({
    id: r.id as string,
    user_id: (r.user_id as string | null) ?? null,
    display_name: (r.display_name as string | null) ?? (r.email as string | null) ?? "—",
    email: (r.email as string | null) ?? "",
    role: (((r.role as string | null) ?? "poc").toLowerCase() as DbRole),
    is_active: (r.is_active as boolean | null) ?? true,
    access_status: ((r.access_status as string | null) ?? "approved").toLowerCase(),
    last_login_at: (r.last_login_at as string | null) ?? null,
  }));
}


export default function UserManagementPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      setUsers(await fetchUsers());
    } catch (e: any) {
      toast.error("Failed to load users", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("profiles-rt-users-page")
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "profiles" }, () => {
        reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(u => {
      if (filter === "Allocators" && u.role !== "allocator") return false;
      if (filter === "POCs" && u.role !== "poc") return false;
      if (filter === "Admins" && u.role !== "admin") return false;
      if (!q) return true;
      return u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [users, filter, query]);

  const deleteUser = async (u: UserRow) => {
    const { error } = await supabase.from("profiles").delete().eq("id", u.id);
    if (error) { toast.error("Failed to delete", { description: error.message }); return; }
    toast.success(`${u.display_name} deleted`);
    setUsers(prev => prev.filter(x => x.id !== u.id));
  };

  const bustPocCache = () => {
    clearCachePrefix('["db-all-poc-profiles"');
    clearCachePrefix('["db-poc-profiles"');
    clearCachePrefix('["db-poc-switcher-list"');
  };

  const setAccess = async (u: UserRow, grant: boolean) => {
    const patch = grant
      ? { access_status: "approved", is_active: true }
      : { access_status: "revoked", is_active: false };
    const { error } = await supabase.from("profiles").update(patch).eq("id", u.id);
    if (error) { toast.error("Failed to update access", { description: error.message }); return; }
    toast.success(grant ? `Granted access to ${u.display_name}` : `Revoked access for ${u.display_name}`);
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...patch } : x));
    bustPocCache();
  };



  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900">User Management</h3>
          <p className="text-[13px] text-n500 mt-1">Invite, edit, and deactivate platform users.</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[14px] font-medium px-4 py-2.5 shadow-sm transition-colors duration-150">
              <UserPlus className="h-4 w-4" strokeWidth={1.75} />
              Invite User
            </button>
          </DialogTrigger>
          <InviteDialog
            onSent={() => { setInviteOpen(false); reload(); }}
          />
        </Dialog>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" strokeWidth={1.5} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full h-10 rounded-md border border-n300 bg-card pl-9 pr-9 text-[14px] focus:outline-none focus-visible:shadow-focus focus:border-orange-400 transition-colors duration-150"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-md text-n400 hover:text-n700 hover:bg-n100 transition-colors duration-150">
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "text-[13px] rounded-full px-3 py-1.5 border transition-colors duration-150 ease-smooth",
              filter === f
                ? "bg-orange-50 border-orange-500 text-orange-600 font-medium"
                : "bg-card border-n200 text-n600 hover:text-n900 hover:border-n300",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <section className="rounded-lg bg-card border border-n200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-n500 text-[11px] uppercase tracking-[0.5px] border-b border-n200 bg-n50">
                <th className="font-medium px-5 py-2.5">User</th>
                <th className="font-medium px-3 py-2.5">Email</th>
                <th className="font-medium px-3 py-2.5">Role</th>
                <th className="font-medium px-3 py-2.5">Status</th>
                <th className="font-medium px-3 py-2.5">Last Active</th>
                <th className="font-medium px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-n500">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading users…
                </td></tr>
              )}
              <AnimatePresence initial={false}>
                {!loading && filtered.map(u => (
                  <motion.tr
                    key={u.id}
                    layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="border-b border-n100 hover:bg-n50 transition-colors duration-150"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-n900 text-white grid place-items-center text-[10px] font-medium">
                          {initialsOf(u.display_name)}
                        </div>
                        <span className="text-n900 font-medium">{u.display_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-n600">{u.email}</td>
                    <td className="px-3 py-3">
                      <span className={cn("pill", ROLE_PILL[u.role])}>{ROLE_LABEL[u.role]}</span>
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const granted = isGranted(u);
                        return (
                          <span className={cn(
                            "inline-flex items-center gap-1.5 text-[12px] rounded-full border px-2 py-0.5",
                            granted
                              ? "bg-sage-50 text-sage-700 border-sage-200"
                              : "bg-coral-50 text-coral-700 border-coral-200",
                          )}>
                            <span className={cn("h-2 w-2 rounded-full", granted ? "bg-sage-500" : "bg-coral-500")} />
                            {granted ? "Granted" : "Revoked"}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-n500 text-[12px]">{fmtLastActive(u.last_login_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {isGranted(u) ? (
                          <button
                            onClick={() => setAccess(u, false)}
                            className="inline-flex items-center gap-1 text-[12px] text-coral-600 hover:bg-coral-50 rounded-md px-2 py-1 transition-colors duration-150"
                          >
                            <ShieldOff className="h-3.5 w-3.5" strokeWidth={1.5} /> Revoke
                          </button>
                        ) : (
                          <button
                            onClick={() => setAccess(u, true)}
                            className="inline-flex items-center gap-1 text-[12px] text-sage-700 hover:bg-sage-50 rounded-md px-2 py-1 transition-colors duration-150"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.5} /> Grant
                          </button>
                        )}
                        <button
                          onClick={() => setEditing(u)}
                          className="inline-flex items-center gap-1 text-[12px] text-n600 hover:text-n900 hover:bg-n100 rounded-md px-2 py-1 transition-colors duration-150"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} /> Edit
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="inline-flex items-center gap-1 text-[12px] text-coral-600 hover:bg-coral-50 rounded-md px-2 py-1 transition-colors duration-150">
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Delete
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {u.display_name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This removes the user from User Management. Their POC Database record (if any) is unaffected. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUser(u)}
                                className="bg-coral-500 hover:bg-coral-600 text-white"
                              >
                                Delete permanently
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-n500 text-[13px]">
                    No users match your filters.
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditUserDialog
            user={editing}
            onCancel={() => setEditing(null)}
            onSaved={(updated) => {
              setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function InviteDialog({ onSent }: { onSent: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DbRole>("allocator");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: { name: name.trim(), email: email.trim(), role },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error ?? error?.message ?? "Invite failed");
      }
      toast.success(`Invite sent to ${email.trim()}`);
      setName(""); setEmail("");
      onSent();
    } catch (err: any) {
      toast.error("Invite failed", { description: err?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader><DialogTitle className="text-[18px] font-medium">Invite a new user</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4 py-2">
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full h-9 rounded-md border border-n300 bg-card px-3 text-[14px] focus:outline-none focus-visible:shadow-focus focus:border-orange-400" />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="w-full h-9 rounded-md border border-n300 bg-card px-3 text-[14px] focus:outline-none focus-visible:shadow-focus focus:border-orange-400" />
        </Field>
        <Field label="Role">
          <div className="grid grid-cols-3 gap-2">
            {(["admin", "allocator", "poc"] as DbRole[]).map(r => (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={cn(
                  "text-[13px] rounded-md px-3 py-2 border transition-colors duration-150",
                  role === r
                    ? "bg-orange-50 border-orange-500 text-orange-600 font-medium"
                    : "bg-card border-n300 text-n700 hover:bg-n50",
                )}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </Field>

        <DialogFooter className="pt-2">
          <button type="submit" disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[14px] font-medium px-4 py-2.5 shadow-sm transition-colors duration-150">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Sending…" : "Send Invite"}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-medium text-n600">{label}</span>
        {hint && <span className="text-[11px] text-n400">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function EditUserDialog({ user, onSaved, onCancel }: { user: UserRow; onSaved: (u: UserRow) => void; onCancel: () => void }) {
  const [name, setName] = useState(user.display_name);
  const [role, setRole] = useState<DbRole>(user.role);
  const [granted, setGranted] = useState(isGranted(user));
  const [busy, setBusy] = useState(false);
  const [pocDomain, setPocDomain] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user.email) return;
      const { data } = await supabase
        .from("poc_profiles")
        .select("functional_domain, role_type")
        .ilike("email", user.email)
        .maybeSingle();
      if (!cancelled && data) {
        const d = (data as any).functional_domain || (data as any).role_type || null;
        setPocDomain(d);
      }
    })();
    return () => { cancelled = true; };
  }, [user.email]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const patch = {
      display_name: name.trim(),
      role,
      access_status: granted ? "approved" : "revoked",
      is_active: granted,
    };
    const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
    setBusy(false);
    if (error) { toast.error("Save failed", { description: error.message }); return; }
    toast.success("User updated");
    // Bust poc caches so POC Database reflects the role sync triggered by DB
    clearCachePrefix('["db-all-poc-profiles"');
    clearCachePrefix('["db-poc-profiles"');
    onSaved({ ...user, ...patch });
  };

  return (
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader><DialogTitle className="text-[18px] font-medium">Edit user</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4 py-2">
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full h-9 rounded-md border border-n300 bg-card px-3 text-[14px] focus:outline-none focus-visible:shadow-focus focus:border-orange-400" />
        </Field>
        <Field label="Email"><div className="text-[14px] text-n600 px-3 py-2 bg-n50 rounded-md border border-n200">{user.email}</div></Field>
        {user.role === "poc" && (
          <Field label="Domain" hint="From POC Database (read-only)">
            <div className="text-[14px] text-n600 px-3 py-2 bg-n50 rounded-md border border-n200">
              {pocDomain || <span className="text-n400">Not set in POC Database</span>}
            </div>
          </Field>
        )}
        <Field label="Role">
          <div className="grid grid-cols-3 gap-2">
            {(["admin", "allocator", "poc"] as DbRole[]).map(r => (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={cn(
                  "text-[13px] rounded-md px-3 py-2 border transition-colors duration-150",
                  role === r ? "bg-orange-50 border-orange-500 text-orange-600 font-medium" : "bg-card border-n300 text-n700 hover:bg-n50",
                )}>
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Access">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setGranted(true)}
              className={cn(
                "text-[13px] rounded-md px-3 py-2 border transition-colors duration-150",
                granted ? "bg-sage-50 border-sage-500 text-sage-700 font-medium" : "bg-card border-n300 text-n700 hover:bg-n50",
              )}>
              Granted
            </button>
            <button type="button" onClick={() => setGranted(false)}
              className={cn(
                "text-[13px] rounded-md px-3 py-2 border transition-colors duration-150",
                !granted ? "bg-coral-50 border-coral-500 text-coral-700 font-medium" : "bg-card border-n300 text-n700 hover:bg-n50",
              )}>
              Revoked
            </button>
          </div>
        </Field>
        <DialogFooter className="pt-2 gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-n300 px-4 py-2 text-[14px] text-n700 hover:bg-n50">Cancel</button>
          <button type="submit" disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[14px] font-medium px-4 py-2 shadow-sm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

