import { useEffect, useRef, useState } from "react";
import { Moon, Sun, Upload, Loader2, Mail, KeyRound, User as UserIcon, Briefcase, Shield } from "lucide-react";
import { useRole } from "@/lib/rolesContext";
import { useTheme } from "@/lib/themeContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useInvalidateAvatarUrls } from "@/lib/hooks/useAvatarUrls";
import { AvatarCropDialog } from "@/components/settings/AvatarCropDialog";
import { cn } from "@/lib/utils";

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-n200 bg-card p-6 shadow-sm">
      <header className="mb-5">
        <h4 className="text-[16px] font-semibold tracking-[-0.2px] text-n900">{title}</h4>
        {description && <p className="text-[13px] text-n500 mt-0.5">{description}</p>}
      </header>
      {children}
    </section>
  );
}

export default function GeneralPage() {
  const { user, role } = useRole();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidateAvatars = useInvalidateAvatarUrls();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user.name || "");
  const [savingName, setSavingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const [pocProfile, setPocProfile] = useState<{
    primary_domain: string | null;
    access_level: string | null;
    domain_tags: string[] | null;
  } | null>(null);

  useEffect(() => {
    if (!user.id) return;
    supabase
      .from("profiles")
      .select("avatar_url, display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
        if (data?.display_name) setDisplayName(data.display_name);
      });

    if (user.email) {
      supabase
        .from("poc_profiles")
        .select("primary_domain, access_level, domain_tags")
        .ilike("email", user.email)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPocProfile({
              primary_domain: data.primary_domain,
              access_level: data.access_level,
              domain_tags: data.domain_tags,
            });
          }
        });
    }
  }, [user.id, user.email]);

  const initials = (displayName || user.email || "U")
    .split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  function onPickFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function onUpload(blob: Blob) {
    if (!user.id) return;
    setUploading(true);
    try {
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, blob, {
        upsert: true,
        contentType: "image/jpeg",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", user.id);
      if (updErr) throw updErr;
      setAvatarUrl(url);
      setCropSrc(null);
      invalidateAvatars();
      toast({ title: "Profile photo updated" });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function saveName() {
    if (!user.id || !displayName.trim()) return;
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("user_id", user.id);
    setSavingName(false);
    if (error) toast({ title: "Save failed", description: error.message, variant: "destructive" });
    else toast({ title: "Name updated" });
  }

  async function changePassword() {
    if (pw1.length < 8) return toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
    if (pw1 !== pw2) return toast({ title: "Passwords don't match", variant: "destructive" });
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setChangingPw(false);
    if (error) toast({ title: "Couldn't change password", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Password updated" });
      setPw1(""); setPw2("");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900">General</h3>
        <p className="text-[13px] text-n500 mt-1">Manage your profile, appearance, and account credentials.</p>
      </header>

      <SectionCard title="Profile" description="Your photo and name shown across the app.">
        <div className="flex items-start gap-6">
          <div className="flex flex-col items-center gap-2">
            <Avatar className="h-20 w-20 ring-2 ring-orange-100">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
              <AvatarFallback className="bg-orange-50 text-orange-600 text-[18px] font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              {uploading ? "Uploading…" : "Change"}
            </Button>
            <AvatarCropDialog
              src={cropSrc}
              open={!!cropSrc}
              onCancel={() => setCropSrc(null)}
              onConfirm={onUpload}
              busy={uploading}
            />
          </div>

          <div className="flex-1 space-y-4 max-w-md">
            <div>
              <Label htmlFor="name" className="text-[13px] text-n700 flex items-center gap-1.5">
                <UserIcon className="h-3.5 w-3.5" /> Display name
              </Label>
              <div className="flex gap-2 mt-1.5">
                <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                <Button onClick={saveName} disabled={savingName || !displayName.trim()}>
                  {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[13px] text-n700 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <div className="mt-1.5 flex items-center justify-between rounded-md border border-n200 bg-n50 px-3 py-2 text-[14px] text-n800">
                <span>{user.email || "—"}</span>
                <span className="text-[11px] uppercase tracking-wide text-n500 font-medium">{role}</span>
              </div>
              <p className="text-[12px] text-n500 mt-1">Contact an admin to change your email.</p>
            </div>

            {pocProfile && (
              <>
                <div>
                  <Label className="text-[13px] text-n700 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" /> Domain
                  </Label>
                  <div className="mt-1.5 rounded-md border border-n200 bg-n50 px-3 py-2 text-[14px] text-n800">
                    {pocProfile.primary_domain
                      ? pocProfile.primary_domain
                      : pocProfile.domain_tags && pocProfile.domain_tags.length > 0
                        ? pocProfile.domain_tags.join(", ")
                        : "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-[13px] text-n700 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" /> Access level
                  </Label>
                  <div className="mt-1.5 rounded-md border border-n200 bg-n50 px-3 py-2 text-[14px] text-n800">
                    {pocProfile.access_level
                      ? pocProfile.access_level.charAt(0).toUpperCase() + pocProfile.access_level.slice(1)
                      : "—"}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Appearance" description="Choose how the interface looks for you.">
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {(["light","dark"] as const).map((t) => {
            const active = theme === t;
            const Icon = t === "light" ? Sun : Moon;
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                  active ? "border-orange-400 bg-orange-50/60 ring-2 ring-orange-200" : "border-n200 bg-card hover:border-n300",
                )}
              >
                <div className={cn(
                  "h-9 w-9 rounded-lg grid place-items-center",
                  active ? "bg-orange-500 text-white" : "bg-n100 text-n600",
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[14px] font-medium text-n900 capitalize">{t}</div>
                  <div className="text-[12px] text-n500">{t === "light" ? "Bright and clear" : "Easy on the eyes"}</div>
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Password" description="Change the password used to sign in.">
        <div className="space-y-3 max-w-md">
          <div>
            <Label htmlFor="pw1" className="text-[13px] text-n700 flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> New password
            </Label>
            <Input id="pw1" type="password" value={pw1} onChange={(e) => setPw1(e.target.value)} className="mt-1.5" placeholder="At least 8 characters" />
          </div>
          <div>
            <Label htmlFor="pw2" className="text-[13px] text-n700">Confirm new password</Label>
            <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="mt-1.5" />
          </div>
          <Button onClick={changePassword} disabled={changingPw || !pw1 || !pw2}>
            {changingPw ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Update password
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
