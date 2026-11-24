"use client";

import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { Bold, Code, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

function Tool({ label, shortcut, active, disabled, onClick, children }: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={label} {...(shortcut ? { shortcut } : {})}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()} // keep the selection in the editor
        onClick={onClick}
        className={cn(active && "bg-primary-soft text-primary hover:bg-primary-soft")}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

const Divider = () => <span role="separator" aria-orientation="vertical" className="mx-1 h-5 w-px shrink-0 bg-border" />;

function isSafeUrl(value: string): boolean {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function EditorToolbar({ editor, className }: { editor: Editor; className?: string }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo()
    })
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string>();
  const chain = () => editor.chain().focus();

  function openLink() {
    setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setUrlError(undefined);
    setLinkOpen(true);
  }
  function applyLink() {
    const value = url.trim();
    if (!value) {
      chain().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    if (!isSafeUrl(href)) {
      setUrlError("Enter a web address starting with http:// or https://");
      return;
    }
    chain().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }

  return (
    <>
      <div role="toolbar" aria-label="Formatting" aria-orientation="horizontal" className={cn("-mx-1 mb-6 flex items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-surface/95 p-1 shadow-xs backdrop-blur", className)}>
        <Tool label="Undo" shortcut={`${mod}Z`} disabled={!state.canUndo} onClick={() => chain().undo().run()}><Undo2 aria-hidden /></Tool>
        <Tool label="Redo" shortcut={`${mod}⇧Z`} disabled={!state.canRedo} onClick={() => chain().redo().run()}><Redo2 aria-hidden /></Tool>
        <Divider />
        <Tool label="Heading 1" shortcut={`${mod}⌥1`} active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 aria-hidden /></Tool>
        <Tool label="Heading 2" shortcut={`${mod}⌥2`} active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 aria-hidden /></Tool>
        <Tool label="Heading 3" shortcut={`${mod}⌥3`} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 aria-hidden /></Tool>
        <Divider />
        <Tool label="Bold" shortcut={`${mod}B`} active={state.bold} onClick={() => chain().toggleBold().run()}><Bold aria-hidden /></Tool>
        <Tool label="Italic" shortcut={`${mod}I`} active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic aria-hidden /></Tool>
        <Tool label="Underline" shortcut={`${mod}U`} active={state.underline} onClick={() => chain().toggleUnderline().run()}><Underline aria-hidden /></Tool>
        <Tool label="Strikethrough" shortcut={`${mod}⇧S`} active={state.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough aria-hidden /></Tool>
        <Tool label="Inline code" shortcut={`${mod}E`} active={state.code} onClick={() => chain().toggleCode().run()}><Code aria-hidden /></Tool>
        <Divider />
        <Tool label="Bulleted list" shortcut={`${mod}⇧8`} active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List aria-hidden /></Tool>
        <Tool label="Numbered list" shortcut={`${mod}⇧7`} active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered aria-hidden /></Tool>
        <Tool label="Quote" shortcut={`${mod}⇧B`} active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote aria-hidden /></Tool>
        <Tool label="Link" active={state.link} onClick={openLink}><Link2 aria-hidden /></Tool>
      </div>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); editor.commands.focus(); }}>
          <DialogHeader>
            <DialogTitle>Link</DialogTitle>
            <DialogDescription>Add a web address to the selected text. Leave it empty to remove the link.</DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={(event) => { event.preventDefault(); applyLink(); }} className="space-y-4">
            <Field id="link-url" label="Address" error={urlError}>
              {(aria) => <Input {...aria} type="url" autoFocus placeholder="https://example.com" value={url} onChange={(event) => setUrl(event.target.value)} />}
            </Field>
            <DialogFooter>
              <Button type="button" onClick={() => setLinkOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Apply</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
