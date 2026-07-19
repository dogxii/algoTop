import { Download, FileText, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Question } from "../lib/algotop";
import type { QuestionNote } from "../lib/notes";

type NoteEntry = {
  id: string;
  note: QuestionNote;
  question?: Question;
};

type NoteListDialogProps = {
  notes: NoteEntry[];
  onClose: () => void;
  onOpenNote: (question: Question) => void;
  onExportNotes: () => void;
};

function formatTime(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return window.Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getNoteTitle(item: NoteEntry) {
  if (item.question) return `${item.question.displayId}. ${item.question.title}`;

  const heading = item.note.content.match(/^#{1,6}\s+(?:\[)?([^\]\n(]+)/m);
  if (heading?.[1]?.trim()) return heading[1].trim();

  return `题目 ${item.id}`;
}

function getNoteExcerpt(content: string) {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function NoteListDialog({
  notes,
  onClose,
  onOpenNote,
  onExportNotes,
}: NoteListDialogProps) {
  const [search, setSearch] = useState("");
  const filteredNotes = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();
    if (!keyword) return notes;

    return notes.filter((item) => {
      const haystack = `${getNoteTitle(item)} ${item.note.content}`.toLocaleLowerCase();
      return haystack.includes(keyword);
    });
  }, [notes, search]);

  return (
    <div
      className="profile-modal-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="notes-dialog" aria-label="笔记" role="dialog" aria-modal="true">
        <header className="notes-dialog-head">
          <label className="notes-search">
            <Search size={16} strokeWidth={1.8} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索笔记"
            />
            {search && (
              <button
                className="editor-icon-button"
                type="button"
                onClick={() => setSearch("")}
                aria-label="清空"
                title="清空"
              >
                <X size={15} strokeWidth={1.8} />
              </button>
            )}
          </label>
          <div className="notes-dialog-actions">
            <button type="button" onClick={onExportNotes} disabled={notes.length === 0}>
              <Download size={15} strokeWidth={1.8} />
              <span>导出全部</span>
            </button>
            <button
              className="editor-icon-button"
              type="button"
              onClick={onClose}
              aria-label="关闭"
              title="关闭"
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        <div className="notes-list">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((item) => {
              const title = getNoteTitle(item);
              const excerpt = getNoteExcerpt(item.note.content);
              const question = item.question;

              return question ? (
                <button
                  className="notes-list-item"
                  type="button"
                  key={item.id}
                  onClick={() => onOpenNote(question)}
                >
                  <FileText size={17} strokeWidth={1.8} />
                  <span>
                    <strong>{title}</strong>
                    {excerpt && <small>{excerpt}</small>}
                  </span>
                  <time>{formatTime(item.note.updatedAt)}</time>
                </button>
              ) : (
                <div className="notes-list-item is-disabled" key={item.id}>
                  <FileText size={17} strokeWidth={1.8} />
                  <span>
                    <strong>{title}</strong>
                    {excerpt && <small>{excerpt}</small>}
                  </span>
                  <time>{formatTime(item.note.updatedAt)}</time>
                </div>
              );
            })
          ) : (
            <div className="profile-empty">暂无笔记</div>
          )}
        </div>
      </section>
    </div>
  );
}
