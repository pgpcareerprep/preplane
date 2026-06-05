import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold as BoldIcon, List, ListOrdered } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: false, codeBlock: false, blockquote: false, horizontalRule: false })],
    content: value || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[80px] px-3 py-2 focus:outline-none text-[13px] text-n800 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_strong]:font-semibold",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Sync external value (e.g., switching items)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== current && (value || "<p></p>") !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-n200 bg-card">
      <Toolbar editor={editor} />
      <div className="border-t border-n200">
        <EditorContent editor={editor} />
        {!value && placeholder && (
          <div className="pointer-events-none -mt-[60px] px-3 py-2 text-[13px] text-n400">{placeholder}</div>
        )}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (active: boolean) =>
    cn(
      "inline-flex items-center justify-center h-7 w-7 rounded text-n600 hover:bg-n100 hover:text-n900 transition-colors",
      active && "bg-orange-50 text-orange-600 hover:bg-orange-50",
    );
  return (
    <div className="flex items-center gap-1 px-2 py-1.5">
      <button
        type="button"
        title="Bold (Ctrl/Cmd+B)"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive("bold"))}
      >
        <BoldIcon className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive("bulletList"))}
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive("orderedList"))}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
