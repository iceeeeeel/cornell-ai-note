import type { NoteDraft, PersistedImage } from "../types/classNote";

/** 带稳定 Row ID 的左栏行，供 API 逐行回填 refined_by_row_id */
export function rowsWithIdsForApi(
  draft: NoteDraft
): Array<{ id: string; note: string }> {
  return draft.rows.map((r) => ({ id: r.id, note: r.note }));
}

/** 将行块压平为 DeepSeek API 所需的左栏全文 + 有序图片列表 */
export function flattenDraftForApi(draft: NoteDraft): {
  leftText: string;
  images: PersistedImage[];
} {
  const leftLines: string[] = [];
  const images: PersistedImage[] = [];

  for (const row of draft.rows) {
    leftLines.push(row.note);
    for (const im of row.images) {
      images.push({
        id: im.id,
        filename: im.filename,
        dataUrl: im.dataUrl,
        ocrText: im.ocrText,
        ocrStatus: im.ocrText.trim() ? "done" : "idle",
        rowId: row.id,
      });
    }
  }

  return {
    leftText: leftLines.join("\n"),
    images,
  };
}
