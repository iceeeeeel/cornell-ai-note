import type { LegacyNoteDraft, NoteDraft, RowBlock } from "../types/classNote";

const KEY = "class-note-draft-v3";
const KEY_V2 = "class-note-draft-v2";
const LEGACY_KEY = "class-note-draft-v1";

function newRow(): RowBlock {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `row_${Date.now()}_${Math.random()}`,
    note: "",
    cue: "",
    images: [],
  };
}

/** 与初次打开应用时相同的空白草稿（一行空行） */
export function createEmptyDraft(): NoteDraft {
  return {
    courseTitle: "",
    classDate: new Date().toISOString().slice(0, 10),
    rows: [newRow()],
    aiMarkdownContent: null,
    aiMindmap: null,
    aiQuestions: null,
  };
}

function mapRow(r: Partial<RowBlock> & { left?: string; right?: string }): RowBlock {
  return {
    id: r.id ?? newRow().id,
    note: r.note ?? r.left ?? "",
    cue: r.cue ?? r.right ?? "",
    images: Array.isArray(r.images) ? r.images : [],
    aiRefinedNote:
      r.aiRefinedNote === undefined || r.aiRefinedNote === null
        ? null
        : r.aiRefinedNote,
  };
}

function migrateLegacy(p: LegacyNoteDraft): NoteDraft {
  const leftLines = (p.leftText ?? "").split("\n");
  const rightLines = (p.rightText ?? "").split("\n");
  const n = Math.max(leftLines.length, rightLines.length, 1);
  const rows: RowBlock[] = [];
  const legacyImages = p.images ?? [];
  for (let i = 0; i < n; i++) {
    const row = newRow();
    row.note = leftLines[i] ?? "";
    row.cue = rightLines[i] ?? "";
    if (i === 0 && legacyImages.length) {
      row.images = legacyImages.map((img) => ({
        id: img.id,
        filename: img.filename,
        dataUrl: img.dataUrl,
        ocrText: img.ocrText,
      }));
    }
    rows.push(row);
  }
  const ar = p.aiResult;
  const qs: string[] =
    ar?.questions?.map((q) => q.question).filter(Boolean).slice(0, 3) ?? [];
  while (qs.length < 3) qs.push("");
  return {
    courseTitle: p.courseTitle ?? "",
    classDate: p.classDate ?? new Date().toISOString().slice(0, 10),
    rows,
    aiMarkdownContent: ar?.integrated_notes?.trim() ? ar.integrated_notes : null,
    aiMindmap: ar?.mindmap ?? null,
    aiQuestions: qs,
  };
}

export function loadDraft(): NoteDraft {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<NoteDraft> & {
        aiIntegratedNotes?: string | null;
        aiOutline?: unknown;
      };
      if (Array.isArray(p.rows) && p.rows.length) {
        const legacyQs = p.aiQuestions as unknown;
        let questions: string[] | null = null;
        if (Array.isArray(legacyQs)) {
          if (legacyQs.length && typeof legacyQs[0] === "string") {
            questions = legacyQs as string[];
          } else {
            questions = (legacyQs as { question?: string }[])
              .map((x) => x.question ?? "")
              .slice(0, 3);
          }
        }
        return {
          ...createEmptyDraft(),
          ...p,
          rows: p.rows.map((r) => mapRow(r as Partial<RowBlock> & { left?: string; right?: string })),
          aiMarkdownContent:
            p.aiMarkdownContent ?? p.aiIntegratedNotes ?? null,
          aiMindmap: p.aiMindmap ?? null,
          aiQuestions: questions,
        };
      }
    }

    const rawV2 = localStorage.getItem(KEY_V2);
    if (rawV2) {
      const p = JSON.parse(rawV2) as Partial<NoteDraft> & {
        rows?: Partial<RowBlock>[];
        leftView?: string;
        aiIntegratedNotes?: string | null;
      };
      if (Array.isArray(p.rows) && p.rows.length) {
        const integrated = p.aiIntegratedNotes ?? null;
        return {
          courseTitle: p.courseTitle ?? "",
          classDate: p.classDate ?? new Date().toISOString().slice(0, 10),
          rows: p.rows.map((r) => mapRow(r as Partial<RowBlock> & { left?: string; right?: string })),
          aiMarkdownContent: integrated,
          aiMindmap: null,
          aiQuestions: null,
        };
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as LegacyNoteDraft;
      if (legacy.leftText !== undefined || legacy.rightText !== undefined) {
        return migrateLegacy(legacy);
      }
    }
  } catch {
    /* ignore */
  }
  return createEmptyDraft();
}

export function saveDraft(draft: NoteDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* quota */
  }
}
