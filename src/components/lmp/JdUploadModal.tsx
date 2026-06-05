import { useState, useRef } from "react";
import { Upload, Link as LinkIcon, FileText, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn, runInBackground } from "@/lib/utils";
import { saveJd, saveJdToDb, mergeJd, extractSkillsFromText, extractSeniority, type JdData } from "@/lib/jdStore";
import { extractTextFromFile, parseJdViaAi } from "@/lib/jdExtract";
import { useLmpMutation } from "@/lib/sheets";
import { toast } from "sonner";

type Tab = "paste" | "file" | "link";

interface JdUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lmpId: string;
  role: string;
  company: string;
  domain?: string;
  seniority?: string;
  onUploaded: (data: JdData) => void;
}

export function JdUploadModal({
  open, onOpenChange, lmpId, role, company, domain, seniority, onUploaded,
}: JdUploadModalProps) {
  const [tab, setTab] = useState<Tab>("paste");
  const [pasteText, setPasteText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { update: lmpUpdate } = useLmpMutation();

  const reset = () => {
    setPasteText("");
    setLinkUrl("");
    setUploading(false);
  };

  const buildAndSave = async (
    rawText: string,
    source: JdData["source"],
    fileName: string,
    link?: string,
  ) => {
    setUploading(true);

    // 1. Fast offline keyword pass so we can show JD-attached state instantly.
    const fullText = rawText + " " + role + " " + (domain || "");
    const fastSkills = rawText ? extractSkillsFromText(fullText) : [];
    const fastSen = seniority || (rawText ? extractSeniority(fullText + " " + (seniority || "")) : "") || "Mid";

    const initialData: JdData = {
      lmpId,
      fileName,
      rawText: (rawText || `${role} at ${company}`).slice(0, 5000),
      skills: fastSkills,
      seniority: fastSen,
      role,
      company,
      uploadedAt: new Date().toISOString(),
      source,
      link,
    };

    // 2. Save locally immediately + close modal — UI is unblocked.
    saveJd(initialData);
    onUploaded(initialData);
    toast.success("JD saved — enriching skills in background…");
    reset();
    onOpenChange(false);

    // 3. Run DB save, sheet mirror, and AI enrichment in parallel in the background.
    runInBackground(() => saveJdToDb(initialData).then((r) => {
      if (!r.ok) toast.warning("JD saved locally — could not sync to server", { description: r.error });
    }), { label: "jd-db" });

    runInBackground(() => {
      const patch: Record<string, unknown> = { jdLabel: initialData.fileName };
      if (initialData.link) patch.jdUrl = initialData.link;
      lmpUpdate.mutate({ id: lmpId, patch });
      return Promise.resolve();
    }, { label: "jd-sheet" });

    // AI parse — merge richer skills/seniority back into the store when done.
    if ((rawText && rawText.length >= 30) || link) {
      runInBackground(async () => {
        const ai = await parseJdViaAi({ text: rawText, url: link, role, company, domain });
        const aiSkills = Array.from(new Set([...(ai.requiredSkills || []), ...(ai.preferredSkills || [])])).slice(0, 30);
        const merged = mergeJd(lmpId, {
          skills: aiSkills.length ? aiSkills : initialData.skills,
          seniority: ai.seniority && ai.seniority !== "Unspecified" ? ai.seniority : initialData.seniority,
          rawText: (rawText || ai.summary || initialData.rawText).slice(0, 5000),
        });
        if (merged) {
          // Re-sync enriched JD to DB.
          runInBackground(() => saveJdToDb(merged), { label: "jd-db-enriched" });
          toast.success(`Skills enriched — ${merged.skills.length} skills extracted`);
        }
      }, {
        label: "jd-ai",
        onError: () => toast.warning("AI enrichment unavailable — kept basic keyword skills"),
      });
    }
  };

  const handlePaste = () => {
    if (pasteText.trim().length < 10) {
      toast.error("Please paste at least 10 characters of JD content");
      return;
    }
    void buildAndSave(pasteText.trim(), "paste", "Pasted JD");
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "txt"].includes(ext || "")) {
      toast.error("Only .pdf, .docx, and .txt files are supported");
      return;
    }
    setUploading(true);
    try {
      // Run storage upload and text extraction in PARALLEL — they're independent.
      // Storage upload is network-bound; pdf.js extraction is CPU-bound.
      const uploadPromise: Promise<string | undefined> = (async () => {
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${lmpId}/${Date.now()}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from("jds")
            .upload(path, file, { upsert: true, contentType: file.type || undefined });
          if (upErr) {
            console.warn("[JdUpload] storage upload failed:", upErr.message);
            return undefined;
          }
          const { data } = supabase.storage.from("jds").getPublicUrl(path);
          return data?.publicUrl;
        } catch (e: any) {
          console.warn("[JdUpload] storage upload threw:", e?.message);
          return undefined;
        }
      })();

      const extractPromise: Promise<string> = extractTextFromFile(file).catch((extractErr: any) => {
        console.warn("[JdUpload] text extraction failed:", extractErr?.message);
        return "";
      });

      const [publicUrl, text] = await Promise.all([uploadPromise, extractPromise]);

      if (text.length < 30) {
        if (!publicUrl) {
          toast.error("Could not read this file and upload failed. Try a different file or paste the JD text.");
          setUploading(false);
          return;
        }
        toast.warning("Couldn't extract text (scanned/image PDF?) — saving file link only");
        await buildAndSave("", "file", file.name, publicUrl);
        return;
      }

      await buildAndSave(text, "file", file.name, publicUrl);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Failed to read file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleLink = () => {
    try {
      new URL(linkUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }
    void buildAndSave("", "link", "Linked JD", linkUrl);
  };

  const tabs: { key: Tab; icon: typeof FileText; label: string }[] = [
    { key: "paste", icon: FileText, label: "Paste" },
    { key: "file", icon: Upload, label: "Upload File" },
    { key: "link", icon: LinkIcon, label: "Link" },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[16px]">Add Job Description</DialogTitle>
        </DialogHeader>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-n200 -mx-6 px-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors",
                tab === t.key
                  ? "text-orange-600 border-orange-500"
                  : "text-n500 border-transparent hover:text-n800"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-[160px] pt-2">
          {tab === "paste" && (
            <div className="space-y-3">
              <Textarea
                placeholder="Paste the full job description text here…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="min-h-[120px] text-[13px]"
              />
              <Button onClick={handlePaste} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                Save JD
              </Button>
            </div>
          )}

          {tab === "file" && (
            <div className="space-y-3">
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleFile} />
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-n300 rounded-xl p-8 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-colors"
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-n500 text-[13px]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Reading file…
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-n300 mx-auto mb-2" strokeWidth={1.5} />
                    <p className="text-[13px] font-medium text-n700">Click to upload</p>
                    <p className="text-[11px] text-n400 mt-1">.pdf, .docx, or .txt</p>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "link" && (
            <div className="space-y-3">
              <Input
                placeholder="https://drive.google.com/... or LinkedIn job URL"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="text-[13px]"
              />
              <p className="text-[11px] text-n400">
                Paste a link to the JD on Google Drive, LinkedIn, or any public URL.
              </p>
              <Button onClick={handleLink} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                Save Link
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
