"use client";

import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import type * as Y from "yjs";
import type { CollabProvider } from "@/lib/collab/provider";
import { EditorToolbar } from "./toolbar";

/** Rich-text surface bound to a Yjs document under the "default" XML fragment. */
export function CollabEditor({
  doc,
  provider,
  user,
  readOnly,
  toolbarClassName
}: {
  doc: Y.Doc;
  provider: CollabProvider | null;
  user: { name: string; color: string };
  readOnly: boolean;
  toolbarClassName?: string;
}) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !readOnly,
      editorProps: { attributes: { "aria-label": "Document body", "aria-multiline": "true", role: "textbox", spellcheck: "true" } },
      extensions: [
        // Collaboration provides its own undo manager, scoped to this user's edits.
        StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" } } }),
        Placeholder.configure({ placeholder: readOnly ? "This document is empty." : "Start writing…" }),
        Collaboration.configure({ document: doc, field: "default" }),
        ...(provider
          ? [
              CollaborationCaret.configure({
                provider: { awareness: provider.awareness },
                user,
                render: (caretUser: { name: string; color: string }) => {
                  const caret = document.createElement("span");
                  caret.classList.add("collaboration-carets__caret");
                  caret.style.borderColor = caretUser.color;
                  const label = document.createElement("div");
                  label.classList.add("collaboration-carets__label");
                  label.style.backgroundColor = caretUser.color;
                  label.textContent = caretUser.name;
                  caret.appendChild(label);
                  return caret;
                }
              })
            ]
          : [])
      ]
    },
    [doc, provider]
  );

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div className="editor-canvas">
      {!readOnly && editor ? <EditorToolbar editor={editor} className={toolbarClassName} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
