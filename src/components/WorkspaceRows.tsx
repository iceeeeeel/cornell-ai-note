import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { flushSync } from "react-dom";
import { renderPrettyBlock } from "../markdown/prettyRender";
import type { RowBlock } from "../types/classNote";

function newRow(): RowBlock {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `row_${Date.now()}_${Math.random()}`,
    note: "",
    cue: "",
    images: [],
    aiRefinedNote: null,
  };
}

function newImageId() {
  return globalThis.crypto?.randomUUID?.() ?? `im_${Date.now()}_${Math.random()}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("读取文件失败"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
}

/**
 * 将 scrollHeight 对齐到行栅格；textarea 常把单行报成「近两行」高度，避免误升到 2 行栅格造成大块空白。
 */
function snapHeight(scrollHeight: number, lineStep: number) {
  const n = Math.ceil(scrollHeight / lineStep);
  if (n === 2 && scrollHeight <= lineStep * 1.35) {
    return lineStep;
  }
  return Math.max(lineStep, n * lineStep);
}

function lineIndexAtCursor(text: string, pos: number): number {
  return text.slice(0, pos).split("\n").length - 1;
}

function lineCount(text: string): number {
  return text.split("\n").length;
}

type WorkspaceRowsProps = {
  rows: RowBlock[];
  onRowsChange: (updater: (prev: RowBlock[]) => RowBlock[]) => void;
  lineStepPx: number;
  activeRowId: string | null;
  onActiveRow: (id: string) => void;
  hoveredRowId: string | null;
  onHoverRow: (id: string | null) => void;
  /** 为 true 时左栏全局显示速记（pretty），不显示逐行精修 */
  globalRawDraft?: boolean;
};

export function WorkspaceRows({
  rows,
  onRowsChange,
  lineStepPx,
  activeRowId,
  onActiveRow,
  hoveredRowId,
  onHoverRow,
  globalRawDraft = false,
}: WorkspaceRowsProps) {
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);
  /** 块级框选：行 ID 列表（按当前文档顺序） */
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [blockDragging, setBlockDragging] = useState(false);
  const rowsRootRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  const dragAnchorRef = useRef<number | null>(null);
  rowsRef.current = rows;

  const updateRow = useCallback(
    (id: string, patch: Partial<RowBlock>) => {
      onRowsChange((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    [onRowsChange]
  );

  const splitNoteAt = useCallback(
    (rowId: string, before: string, after: string) => {
      const idx = rowsRef.current.findIndex((r) => r.id === rowId);
      if (idx < 0) return;
      const cur = rowsRef.current[idx];
      if (
        before.trim() === "" &&
        after.trim() === "" &&
        cur.images.length === 0
      ) {
        return;
      }
      const ins = newRow();
      ins.note = after;
      ins.cue = "";
      ins.images = [];
      flushSync(() => {
        onRowsChange((prev) => {
          const i = prev.findIndex((r) => r.id === rowId);
          if (i < 0) return prev;
          const c = prev[i];
          const next = [...prev];
          next[i] = { ...c, note: before };
          next.splice(i + 1, 0, ins);
          return next;
        });
        setFocusedNoteId(ins.id);
      });
      const el = document.querySelector<HTMLTextAreaElement>(
        `textarea[data-note-id="${ins.id}"]`
      );
      el?.focus();
      el?.setSelectionRange(0, 0);
    },
    [onRowsChange]
  );

  const splitCueAt = useCallback(
    (rowId: string, before: string, after: string) => {
      const idx = rowsRef.current.findIndex((r) => r.id === rowId);
      if (idx < 0) return;
      if (before.trim() === "" && after.trim() === "") return;
      const ins = newRow();
      ins.note = "";
      ins.cue = after;
      ins.images = [];
      flushSync(() => {
        onRowsChange((prev) => {
          const i = prev.findIndex((r) => r.id === rowId);
          if (i < 0) return prev;
          const c = prev[i];
          const next = [...prev];
          next[i] = { ...c, cue: before };
          next.splice(i + 1, 0, ins);
          return next;
        });
        setFocusedNoteId(null);
      });
      const el = document.querySelector<HTMLTextAreaElement>(
        `textarea[data-cue-id="${ins.id}"]`
      );
      el?.focus();
      el?.setSelectionRange(0, 0);
    },
    [onRowsChange]
  );

  const mergeNoteWithPrevious = useCallback(
    (rowId: string) => {
      const idx = rows.findIndex((r) => r.id === rowId);
      if (idx <= 0) return;
      const cur = rows[idx];
      const p = rows[idx - 1];
      const mergedNote = p.note + (p.note && cur.note ? "\n" : "") + cur.note;
      const mergedCue = p.cue + (p.cue && cur.cue ? "\n" : "") + cur.cue;
      const mergePos = p.note.length + (p.note && cur.note ? 1 : 0);
      const next = [...rows];
      next[idx - 1] = {
        ...p,
        note: mergedNote,
        cue: mergedCue,
        images: [...p.images, ...cur.images],
      };
      next.splice(idx, 1);
      onRowsChange(() => next);
      setFocusedNoteId(p.id);
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLTextAreaElement>(
          `textarea[data-note-id="${p.id}"]`
        );
        if (el) {
          el.focus();
          el.setSelectionRange(mergePos, mergePos);
        }
      });
    },
    [rows, onRowsChange]
  );

  const deleteRow = useCallback(
    (rowId: string) => {
      onRowsChange((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((r) => r.id === rowId);
        if (idx < 0) return prev;
        const next = prev.filter((r) => r.id !== rowId);
        if (focusedNoteId === rowId) {
          setFocusedNoteId(next[Math.max(0, idx - 1)]?.id ?? null);
        }
        return next;
      });
    },
    [focusedNoteId, onRowsChange]
  );

  const deleteSelectedRows = useCallback(() => {
    if (selectedRowIds.length === 0) return;
    const idSet = new Set(selectedRowIds);
    const R = rowsRef.current;
    const delIndices = R.map((r, i) => (idSet.has(r.id) ? i : -1)).filter(
      (i) => i >= 0
    );
    if (delIndices.length === 0) return;
    const minDel = Math.min(...delIndices);
    let nextRows = R.filter((r) => !idSet.has(r.id));
    if (nextRows.length === 0) nextRows = [newRow()];
    let fid: string | null = null;
    for (let i = minDel; i < R.length; i++) {
      if (!idSet.has(R[i].id)) {
        fid = R[i].id;
        break;
      }
    }
    if (!fid) {
      for (let i = minDel - 1; i >= 0; i--) {
        if (!idSet.has(R[i].id)) {
          fid = R[i].id;
          break;
        }
      }
    }
    const focusId = fid ?? nextRows[0].id;
    setSelectedRowIds([]);
    onRowsChange(() => nextRows);
    setFocusedNoteId(focusId);
    onActiveRow(focusId);
    queueMicrotask(() => {
      document
        .querySelector<HTMLTextAreaElement>(
          `textarea[data-note-id="${focusId}"]`
        )
        ?.focus();
    });
  }, [selectedRowIds, onRowsChange, onActiveRow]);

  useEffect(() => {
    if (selectedRowIds.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const ae = document.activeElement;
      if (ae instanceof HTMLTextAreaElement || ae instanceof HTMLInputElement) {
        return;
      }
      e.preventDefault();
      deleteSelectedRows();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [selectedRowIds, deleteSelectedRows]);

  useEffect(() => {
    if (!blockDragging) return;
    const move = (e: MouseEvent) => {
      const anchor = dragAnchorRef.current;
      if (anchor === null) return;
      const top = document.elementFromPoint(e.clientX, e.clientY);
      const rowEl = top?.closest("[data-row-id]");
      if (!rowEl) return;
      const id = rowEl.getAttribute("data-row-id");
      if (!id) return;
      const list = rowsRef.current;
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return;
      const a = Math.min(anchor, idx);
      const b = Math.max(anchor, idx);
      setSelectedRowIds(list.slice(a, b + 1).map((r) => r.id));
    };
    const up = () => {
      setBlockDragging(false);
      dragAnchorRef.current = null;
      rowsRootRef.current?.focus();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, [blockDragging]);

  const clearSelection = useCallback(() => setSelectedRowIds([]), []);

  const onRowsMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (
        target.closest("button") ||
        target.closest("textarea") ||
        target.closest("input")
      ) {
        return;
      }
      const row = target.closest("[data-row-id]");
      if (!row) return;
      const rect = row.getBoundingClientRect();
      if (e.clientX - rect.left > 48) return;
      e.preventDefault();
      const id = row.getAttribute("data-row-id");
      if (!id) return;
      const list = rowsRef.current;
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return;
      dragAnchorRef.current = idx;
      setBlockDragging(true);
      setSelectedRowIds([list[idx].id]);
    },
    []
  );

  const addImageToRow = useCallback(
    async (rowId: string, file: File) => {
      const dataUrl = await fileToDataUrl(file);
      onRowsChange((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                images: [
                  ...r.images,
                  {
                    id: newImageId(),
                    filename: file.name || "image",
                    dataUrl,
                    ocrText: "",
                  },
                ],
              }
            : r
        )
      );
    },
    [onRowsChange]
  );

  const removeImage = useCallback(
    (rowId: string, imageId: string) => {
      onRowsChange((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, images: r.images.filter((x) => x.id !== imageId) }
            : r
        )
      );
    },
    [onRowsChange]
  );

  const onPasteNote = useCallback(
    (rowId: string, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (items) {
        const files: File[] = [];
        for (const it of items) {
          if (it.kind === "file" && it.type.startsWith("image/")) {
            const f = it.getAsFile();
            if (f) files.push(f);
          }
        }
        if (files.length) {
          e.preventDefault();
          void Promise.all(files.map((f) => addImageToRow(rowId, f)));
          return;
        }
      }

      const text = e.clipboardData?.getData("text/plain") ?? "";
      const lines = text.split(/\r?\n/);
      if (lines.length <= 1) return;

      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const row = rowsRef.current.find((r) => r.id === rowId);
      if (!row) return;

      const before = row.note.slice(0, start);
      const after = row.note.slice(end);
      const n = lines.length;
      const firstNote = before + lines[0];
      const lastNote = lines[n - 1] + after;
      const middleLines = n > 2 ? lines.slice(1, -1) : [];

      const insertedMiddle = middleLines.map((line) => {
        const r = newRow();
        r.note = line;
        return r;
      });
      const lastRow = newRow();
      lastRow.note = lastNote;

      flushSync(() => {
        onRowsChange((prev) => {
          const i = prev.findIndex((r) => r.id === rowId);
          if (i < 0) return prev;
          const cur = prev[i];
          const next = [...prev];
          next[i] = {
            ...cur,
            note: firstNote,
            aiRefinedNote: null,
          };
          next.splice(i + 1, 0, ...insertedMiddle, lastRow);
          return next;
        });
        setFocusedNoteId(lastRow.id);
      });
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLTextAreaElement>(
          `textarea[data-note-id="${lastRow.id}"]`
        );
        const len = lastRow.note.length;
        el?.focus();
        el?.setSelectionRange(len, len);
      });
    },
    [addImageToRow, onRowsChange]
  );

  return (
    <div
      ref={rowsRootRef}
      className={`ws-rows${blockDragging ? " ws-rows--dragging" : ""}`}
      tabIndex={-1}
      onMouseDownCapture={onRowsMouseDownCapture}
    >
      {rows.map((row, rowIndex) => {
        const editing = focusedNoteId === row.id;
        const selected = selectedRowIds.includes(row.id);

        return (
          <WorkspaceRow
            key={row.id}
            row={row}
            lineStep={lineStepPx}
            globalRawDraft={globalRawDraft}
            hovered={hoveredRowId === row.id}
            onHover={(h) => onHoverRow(h ? row.id : null)}
            active={activeRowId === row.id}
            editing={editing}
            selected={selected}
            onToggleNoteSourceFocus={() => {
              setFocusedNoteId((cur) => (cur === row.id ? null : row.id));
            }}
            onStartEdit={() => {
              clearSelection();
              setFocusedNoteId(row.id);
              onActiveRow(row.id);
            }}
            onEndEdit={() =>
              setFocusedNoteId((id) => (id === row.id ? null : id))
            }
            onNoteFocus={() => clearSelection()}
            onCueFocus={() => {
              clearSelection();
              onActiveRow(row.id);
            }}
            onChangeNote={(v) => updateRow(row.id, { note: v })}
            onChangeCue={(v) => updateRow(row.id, { cue: v })}
            onKeyDownNote={(e) => {
              const ta = e.currentTarget;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;

              if (e.key === "Escape") {
                e.preventDefault();
                setFocusedNoteId((id) => (id === row.id ? null : id));
                return;
              }

              if (e.key === "Enter" && e.shiftKey) {
                return;
              }

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const before = row.note.slice(0, start);
                const after = row.note.slice(end);
                splitNoteAt(row.id, before, after);
                return;
              }

              if (e.key === "Backspace" && start === 0 && end === 0) {
                if (rowIndex > 0) {
                  e.preventDefault();
                  mergeNoteWithPrevious(row.id);
                }
                return;
              }

              if (e.key === "ArrowUp") {
                if (lineIndexAtCursor(row.note, start) === 0) {
                  e.preventDefault();
                  if (rowIndex <= 0) return;
                  const prevId = rows[rowIndex - 1].id;
                  setFocusedNoteId(prevId);
                  onActiveRow(prevId);
                  setTimeout(() => {
                    const el = document.querySelector<HTMLTextAreaElement>(
                      `textarea[data-note-id="${prevId}"]`
                    );
                    if (!el) return;
                    el.focus();
                    const pos = el.value.length;
                    el.setSelectionRange(pos, pos);
                  }, 0);
                }
                return;
              }

              if (e.key === "ArrowDown") {
                if (
                  lineIndexAtCursor(row.note, start) ===
                  lineCount(row.note) - 1
                ) {
                  e.preventDefault();
                  if (rowIndex >= rows.length - 1) return;
                  const nextId = rows[rowIndex + 1].id;
                  setFocusedNoteId(nextId);
                  onActiveRow(nextId);
                  setTimeout(() => {
                    const el = document.querySelector<HTMLTextAreaElement>(
                      `textarea[data-note-id="${nextId}"]`
                    );
                    if (!el) return;
                    el.focus();
                    el.setSelectionRange(0, 0);
                  }, 0);
                }
                return;
              }
            }}
            onKeyDownCue={(e) => {
              const ta = e.currentTarget;
              const start = ta.selectionStart;
              const end = ta.selectionEnd;

              if (e.key === "Enter" && e.shiftKey) {
                return;
              }

              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const before = row.cue.slice(0, start);
                const after = row.cue.slice(end);
                splitCueAt(row.id, before, after);
                return;
              }

              if (e.key === "ArrowUp") {
                if (lineIndexAtCursor(row.cue, start) === 0) {
                  e.preventDefault();
                  if (rowIndex <= 0) return;
                  const prevId = rows[rowIndex - 1].id;
                  onActiveRow(prevId);
                  setTimeout(() => {
                    const el = document.querySelector<HTMLTextAreaElement>(
                      `textarea[data-cue-id="${prevId}"]`
                    );
                    if (!el) return;
                    el.focus();
                    const pos = el.value.length;
                    el.setSelectionRange(pos, pos);
                  }, 0);
                }
                return;
              }

              if (e.key === "ArrowDown") {
                if (
                  lineIndexAtCursor(row.cue, start) ===
                  lineCount(row.cue) - 1
                ) {
                  e.preventDefault();
                  if (rowIndex >= rows.length - 1) return;
                  const nextId = rows[rowIndex + 1].id;
                  onActiveRow(nextId);
                  setTimeout(() => {
                    const el = document.querySelector<HTMLTextAreaElement>(
                      `textarea[data-cue-id="${nextId}"]`
                    );
                    if (!el) return;
                    el.focus();
                    el.setSelectionRange(0, 0);
                  }, 0);
                }
                return;
              }
            }}
            onPasteNote={(e) => onPasteNote(row.id, e)}
            onRemoveImage={(imageId) => removeImage(row.id, imageId)}
            onDeleteRow={() => deleteRow(row.id)}
            onAddImage={(file) => void addImageToRow(row.id, file)}
            canDelete={rows.length > 1}
          />
        );
      })}
    </div>
  );
}

function WorkspaceRow({
  row,
  lineStep,
  globalRawDraft,
  hovered,
  onHover,
  active,
  editing,
  selected,
  onStartEdit,
  onEndEdit,
  onNoteFocus,
  onCueFocus,
  onToggleNoteSourceFocus,
  onChangeNote,
  onChangeCue,
  onKeyDownNote,
  onKeyDownCue,
  onPasteNote,
  onRemoveImage,
  onDeleteRow,
  onAddImage,
  canDelete,
}: {
  row: RowBlock;
  lineStep: number;
  globalRawDraft: boolean;
  hovered: boolean;
  onHover: (h: boolean) => void;
  active: boolean;
  editing: boolean;
  selected: boolean;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onNoteFocus: () => void;
  onCueFocus: () => void;
  onToggleNoteSourceFocus: () => void;
  onChangeNote: (v: string) => void;
  onChangeCue: (v: string) => void;
  onKeyDownNote: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onKeyDownCue: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPasteNote: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onRemoveImage: (imageId: string) => void;
  onDeleteRow: () => void;
  onAddImage: (file: File) => void;
  canDelete: boolean;
}) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const cueRef = useRef<HTMLTextAreaElement>(null);
  const prettyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasRefined = Boolean(row.aiRefinedNote?.trim());
  /** Viewing：精修预览或原文 pretty；Editing：原文 textarea */
  const useRefinedLeft = hasRefined && !globalRawDraft && !editing;
  const prettyText = useRefinedLeft ? (row.aiRefinedNote ?? "") : row.note;

  const handleNoteBlur = useCallback(
    (e: ReactFocusEvent<HTMLTextAreaElement>) => {
      const rowEl = e.currentTarget.closest("[data-row-id]");
      requestAnimationFrame(() => {
        const ae = document.activeElement;
        if (rowEl && ae && rowEl.contains(ae)) return;
        onEndEdit();
      });
    },
    [onEndEdit]
  );

  const handleNoteColumnClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (editing) return;
      const t = e.target as HTMLElement;
      if (t.closest("button")) return;
      if (t.closest("input")) return;
      onStartEdit();
    },
    [editing, onStartEdit]
  );

  const handleNoteColumnKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editing) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onStartEdit();
      }
    },
    [editing, onStartEdit]
  );

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => noteRef.current?.focus());
    }
  }, [editing]);

  useLayoutEffect(() => {
    const C = cueRef.current;
    if (!C) return;

    if (editing) {
      const N = noteRef.current;
      if (!N) return;
      N.style.height = "auto";
      const hN = snapHeight(N.scrollHeight, lineStep);
      C.style.height = "auto";
      const hC = snapHeight(C.scrollHeight, lineStep);
      const h = Math.max(hN, hC);
      N.style.height = `${h}px`;
      C.style.height = `${h}px`;
      return;
    }

    C.style.height = "auto";
    const hC = snapHeight(C.scrollHeight, lineStep);

    const P = prettyRef.current;
    if (!P) {
      C.style.height = `${Math.max(hC, lineStep)}px`;
      return;
    }
    let hP = snapHeight(P.scrollHeight, lineStep);
    if (row.images.length) hP += 72;
    C.style.height = `${Math.max(hP, hC, lineStep)}px`;
  }, [
    row.note,
    row.aiRefinedNote,
    row.cue,
    row.images.length,
    lineStep,
    editing,
    globalRawDraft,
  ]);

  return (
    <div
      className={`ws-row${hovered ? " ws-row--hover" : ""}${active ? " ws-row--active" : ""}${selected ? " ws-row--selected" : ""}`}
      data-row-id={row.id}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <div className="ws-row__gutter-hit" aria-hidden />
      <div className="ws-gutter" aria-hidden>
        <button
          type="button"
          className="ws-gutter__btn ws-gutter__btn--cam"
          title="插入图片"
          onClick={(e) => {
            e.stopPropagation();
            fileRef.current?.click();
          }}
        >
          📷
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onAddImage(f);
          }}
        />
        {hasRefined && !globalRawDraft ? (
          <button
            type="button"
            className={`ws-gutter__btn ws-gutter__btn--peek${editing ? " ws-gutter__btn--peek-on" : ""}`}
            title={editing ? "关闭原文编辑" : "编辑原文"}
            aria-pressed={editing}
            onClick={(e) => {
              e.stopPropagation();
              onToggleNoteSourceFocus();
            }}
          >
            👁
          </button>
        ) : null}
        <button
          type="button"
          className="ws-gutter__btn ws-gutter__btn--del"
          title="删除本行"
          disabled={!canDelete}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteRow();
          }}
        >
          🗑️
        </button>
      </div>

      <div className="ws-row__inner">
        <div
          className={`ws-gutter-note${!editing ? " ws-gutter-note--viewing" : ""}`}
          tabIndex={editing ? -1 : 0}
          aria-label={editing ? undefined : "点击编辑笔记"}
          onClick={handleNoteColumnClick}
          onKeyDown={handleNoteColumnKeyDown}
        >
          <div className="ws-note">
            {editing ? (
              <textarea
                ref={noteRef}
                data-note-id={row.id}
                className="ws-ta ws-ta--note"
                value={row.note}
                onChange={(e) => onChangeNote(e.target.value)}
                onKeyDown={onKeyDownNote}
                onPaste={onPasteNote}
                onBlur={handleNoteBlur}
                onFocus={onNoteFocus}
                spellCheck={false}
                rows={1}
              />
            ) : (
              <div ref={prettyRef} className="ws-pretty ws-pretty--view">
                {prettyText.trim() ? (
                  renderPrettyBlock(prettyText, row.id)
                ) : (
                  <span className="ws-pretty__ph"> </span>
                )}
              </div>
            )}
            {row.images.length > 0 ? (
              <div className="ws-imgs">
                {row.images.map((im) => (
                  <div key={im.id} className="ws-imgwrap">
                    <img className="ws-img" src={im.dataUrl} alt="" />
                    <button
                      type="button"
                      className="ws-imgdel"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveImage(im.id);
                      }}
                      aria-label="删除图片"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="ws-cue">
          <textarea
            ref={cueRef}
            data-cue-id={row.id}
            className="ws-ta ws-ta--cue"
            value={row.cue}
            onChange={(e) => onChangeCue(e.target.value)}
            onFocus={onCueFocus}
            onKeyDown={onKeyDownCue}
            spellCheck={false}
            rows={1}
          />
        </div>
      </div>
    </div>
  );
}

export { newRow };
