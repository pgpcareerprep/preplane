import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { BookOpen, ExternalLink, Folder, FolderPlus, Link as LinkIcon, Pencil, Plus, Save, Trash2, ChevronRight, ChevronDown, X } from "lucide-react";
import { useRole } from "@/lib/rolesContext";
import {
  useGuideManual, useSaveManual,
  useGuideNodes, useCreateNode, useUpdateNode, useDeleteNode,
  type GuideNode,
} from "@/lib/hooks/useLmpGuide";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/settings/RichTextEditor";

function sanitize(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "ul", "ol", "li"],
    ALLOWED_ATTR: [],
  });
}

function isRichEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  return html.replace(/<[^>]+>/g, "").trim() === "";
}

const MAX_DEPTH = 5;

function isValidUrl(v: string): boolean {
  try { new URL(v); return true; } catch { return false; }
}

export default function LmpGuidePage() {
  const { viewAsRole } = useRole();
  const canEdit = viewAsRole === "admin" || viewAsRole === "allocator";

  useRealtimeInvalidate("lmp_guide_manual", [["lmp-guide", "manual"]], { enabled: true });
  useRealtimeInvalidate("lmp_guide_nodes", [["lmp-guide", "nodes"]], { enabled: true });

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-[24px] font-semibold tracking-[-0.5px] text-n900 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-orange-500" strokeWidth={1.5} /> LMP Guide
        </h3>
        <p className="text-[13px] text-n500 mt-1">
          Central place for the LMP Process Manual and a curated repository of reference links.
        </p>
      </header>

      <ManualCard canEdit={canEdit} />
      <RepositoryCard canEdit={canEdit} />
    </div>
  );
}

/* ───────────────────── Manual ───────────────────── */

function ManualCard({ canEdit }: { canEdit: boolean }) {
  const { data: manual, isLoading } = useGuideManual();
  const save = useSaveManual();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");

  const startEdit = () => {
    setTitle(manual?.title ?? "LMP Process Manual");
    setUrl(manual?.url ?? "");
    setDescription(manual?.description ?? "");
    setEditing(true);
  };

  const onSave = async () => {
    if (!title.trim()) return toast({ title: "Title required", variant: "destructive" });
    if (!url.trim() || !isValidUrl(url.trim())) return toast({ title: "Enter a valid URL", variant: "destructive" });
    try {
      await save.mutateAsync({ id: manual?.id, title: title.trim(), url: url.trim(), description: isRichEmpty(description) ? null : description });
      toast({ title: "Manual saved" });
      setEditing(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <section className="rounded-xl border border-n200 bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-[16px] font-semibold text-n900">Process Manual</h4>
          <p className="text-[12px] text-n500 mt-0.5">Primary handbook for LMP operations.</p>
        </div>
        {canEdit && !editing && (
          <button onClick={startEdit} className="inline-flex items-center gap-1.5 rounded-md border border-n200 px-3 py-1.5 text-[13px] text-n700 hover:bg-n50">
            <Pencil className="h-3.5 w-3.5" /> {manual ? "Edit" : "Add"}
          </button>
        )}
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="text-[13px] text-n500">Loading…</div>
        ) : editing ? (
          <div className="space-y-3">
            <input className="w-full rounded-md border border-n200 px-3 py-2 text-[14px]" placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />
            <input className="w-full rounded-md border border-n200 px-3 py-2 text-[14px]" placeholder="https://docs.google.com/…" value={url} onChange={e => setUrl(e.target.value)} />
            <RichTextEditor value={description} onChange={setDescription} placeholder="Optional description — use bold or bullets" />
            <div className="flex items-center gap-2">
              <button onClick={onSave} disabled={save.isPending} className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-[13px] text-white hover:bg-orange-600 disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> Save
              </button>
              <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1.5 rounded-md border border-n200 px-3 py-1.5 text-[13px] text-n700 hover:bg-n50">Cancel</button>
            </div>
          </div>
        ) : manual?.url ? (
          <div className="flex items-start justify-between gap-3 rounded-md border border-n200 bg-n50/40 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-n900">{manual.title}</div>
              {!isRichEmpty(manual.description) && (
                <div
                  className="text-[12px] text-n600 mt-1 prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold"
                  dangerouslySetInnerHTML={{ __html: sanitize(manual.description ?? "") }}
                />
              )}
            </div>
            <a href={manual.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-[13px] text-white hover:bg-orange-600 shrink-0">
              Open <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-n300 px-4 py-6 text-center text-[13px] text-n500">
            No manual published yet.
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────────────────── Repository ───────────────────── */

function RepositoryCard({ canEdit }: { canEdit: boolean }) {
  const { data: nodes = [], isLoading } = useGuideNodes();
  const create = useCreateNode();

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, GuideNode[]>();
    for (const n of nodes) {
      const k = n.parent_id;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    // folders first, then links, then by sort/name
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.name.localeCompare(b.name);
      });
    }
    return map;
  }, [nodes]);

  const [adding, setAdding] = useState<null | "folder" | "link">(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const submitRoot = async () => {
    if (!adding) return;
    if (!name.trim()) return toast({ title: "Name required", variant: "destructive" });
    if (adding === "link" && (!url.trim() || !isValidUrl(url.trim()))) return toast({ title: "Enter a valid URL", variant: "destructive" });
    try {
      await create.mutateAsync({ parent_id: null, kind: adding, name: name.trim(), url: adding === "link" ? url.trim() : null });
      setAdding(null); setName(""); setUrl("");
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <section className="rounded-xl border border-n200 bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-[16px] font-semibold text-n900">Repository</h4>
          <p className="text-[12px] text-n500 mt-0.5">Organize reference links into folders and subfolders.</p>
        </div>
        {canEdit && !adding && (
          <div className="flex items-center gap-2">
            <button onClick={() => setAdding("folder")} className="inline-flex items-center gap-1.5 rounded-md border border-n200 px-3 py-1.5 text-[13px] text-n700 hover:bg-n50">
              <FolderPlus className="h-3.5 w-3.5" /> New folder
            </button>
            <button onClick={() => setAdding("link")} className="inline-flex items-center gap-1.5 rounded-md border border-n200 px-3 py-1.5 text-[13px] text-n700 hover:bg-n50">
              <Plus className="h-3.5 w-3.5" /> New link
            </button>
          </div>
        )}
      </div>

      {adding && (
        <div className="mt-4 rounded-md border border-orange-200 bg-orange-50/40 p-3 space-y-2">
          <div className="text-[12px] font-medium text-n700">Add {adding === "folder" ? "folder" : "link"} at root</div>
          <input className="w-full rounded-md border border-n200 px-3 py-2 text-[14px]" placeholder={adding === "folder" ? "Folder name" : "Link label"} value={name} onChange={e => setName(e.target.value)} />
          {adding === "link" && (
            <input className="w-full rounded-md border border-n200 px-3 py-2 text-[14px]" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
          )}
          <div className="flex items-center gap-2">
            <button onClick={submitRoot} className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-[13px] text-white hover:bg-orange-600">Add</button>
            <button onClick={() => { setAdding(null); setName(""); setUrl(""); }} className="inline-flex items-center gap-1.5 rounded-md border border-n200 px-3 py-1.5 text-[13px] text-n700 hover:bg-n50">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-4">
        {isLoading ? (
          <div className="text-[13px] text-n500">Loading…</div>
        ) : (childrenByParent.get(null)?.length ?? 0) === 0 ? (
          <div className="rounded-md border border-dashed border-n300 px-4 py-6 text-center text-[13px] text-n500">
            No folders or links yet.
          </div>
        ) : (
          <ul className="space-y-1">
            {childrenByParent.get(null)!.map(n => (
              <NodeRow key={n.id} node={n} depth={0} childrenByParent={childrenByParent} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function NodeRow({
  node, depth, childrenByParent, canEdit,
}: {
  node: GuideNode;
  depth: number;
  childrenByParent: Map<string | null, GuideNode[]>;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.name);
  const [url, setUrl] = useState(node.url ?? "");
  const [adding, setAdding] = useState<null | "folder" | "link">(null);
  const [childName, setChildName] = useState("");
  const [childUrl, setChildUrl] = useState("");

  const update = useUpdateNode();
  const del = useDeleteNode();
  const create = useCreateNode();

  const kids = childrenByParent.get(node.id) ?? [];
  const isFolder = node.kind === "folder";

  const onRename = async () => {
    if (!name.trim()) return;
    if (!isFolder && (!url.trim() || !isValidUrl(url.trim()))) return toast({ title: "Enter a valid URL", variant: "destructive" });
    try {
      await update.mutateAsync({ id: node.id, name: name.trim(), url: isFolder ? undefined : url.trim() });
      setRenaming(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const onDelete = async () => {
    if (!confirm(`Delete "${node.name}"${isFolder && kids.length ? " and all its contents" : ""}?`)) return;
    try { await del.mutateAsync(node.id); } catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
  };

  const addChild = async () => {
    if (!adding) return;
    if (!childName.trim()) return toast({ title: "Name required", variant: "destructive" });
    if (adding === "link" && (!childUrl.trim() || !isValidUrl(childUrl.trim()))) return toast({ title: "Enter a valid URL", variant: "destructive" });
    try {
      await create.mutateAsync({ parent_id: node.id, kind: adding, name: childName.trim(), url: adding === "link" ? childUrl.trim() : null });
      setAdding(null); setChildName(""); setChildUrl("");
      setOpen(true);
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-n50 transition-colors",
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {isFolder ? (
          <button onClick={() => setOpen(o => !o)} className="text-n500 hover:text-n900">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {isFolder
          ? <Folder className="h-4 w-4 text-orange-500 shrink-0" />
          : <LinkIcon className="h-4 w-4 text-sky-500 shrink-0" />}

        {renaming ? (
          <div className="flex-1 flex items-center gap-2">
            <input className="flex-1 min-w-0 rounded-md border border-n200 px-2 py-1 text-[13px]" value={name} onChange={e => setName(e.target.value)} />
            {!isFolder && (
              <input className="flex-1 min-w-0 rounded-md border border-n200 px-2 py-1 text-[13px]" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
            )}
            <button onClick={onRename} className="text-[12px] text-orange-600 hover:underline">Save</button>
            <button onClick={() => { setRenaming(false); setName(node.name); setUrl(node.url ?? ""); }} className="text-n500 hover:text-n900"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <>
            {isFolder ? (
              <span className="flex-1 text-[14px] text-n900 truncate">{node.name}</span>
            ) : (
              <a href={node.url ?? "#"} target="_blank" rel="noreferrer" className="flex-1 text-[14px] text-n900 truncate hover:text-orange-600 hover:underline">
                {node.name}
              </a>
            )}
            {canEdit && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {isFolder && depth < MAX_DEPTH - 1 && (
                  <>
                    <button title="Add subfolder" onClick={() => { setAdding("folder"); setOpen(true); }} className="rounded p-1 text-n500 hover:bg-n100 hover:text-n900"><FolderPlus className="h-3.5 w-3.5" /></button>
                    <button title="Add link" onClick={() => { setAdding("link"); setOpen(true); }} className="rounded p-1 text-n500 hover:bg-n100 hover:text-n900"><Plus className="h-3.5 w-3.5" /></button>
                  </>
                )}
                <button title="Rename" onClick={() => setRenaming(true)} className="rounded p-1 text-n500 hover:bg-n100 hover:text-n900"><Pencil className="h-3.5 w-3.5" /></button>
                <button title="Delete" onClick={onDelete} className="rounded p-1 text-n500 hover:bg-n100 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </>
        )}
      </div>

      {adding && (
        <div className="mt-1 ml-2 rounded-md border border-orange-200 bg-orange-50/40 p-2 space-y-2" style={{ marginLeft: 16 + depth * 16 }}>
          <input className="w-full rounded-md border border-n200 px-2 py-1 text-[13px]" placeholder={adding === "folder" ? "Folder name" : "Link label"} value={childName} onChange={e => setChildName(e.target.value)} />
          {adding === "link" && (
            <input className="w-full rounded-md border border-n200 px-2 py-1 text-[13px]" placeholder="https://…" value={childUrl} onChange={e => setChildUrl(e.target.value)} />
          )}
          <div className="flex items-center gap-2">
            <button onClick={addChild} className="rounded-md bg-orange-500 px-2.5 py-1 text-[12px] text-white hover:bg-orange-600">Add</button>
            <button onClick={() => { setAdding(null); setChildName(""); setChildUrl(""); }} className="rounded-md border border-n200 px-2.5 py-1 text-[12px] text-n700 hover:bg-n50">Cancel</button>
          </div>
        </div>
      )}

      {isFolder && open && kids.length > 0 && (
        <ul className="space-y-1 mt-1">
          {kids.map(k => (
            <NodeRow key={k.id} node={k} depth={depth + 1} childrenByParent={childrenByParent} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </li>
  );
}
