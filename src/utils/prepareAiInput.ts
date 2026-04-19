import type { NoteDraft, PersistedImage, RowBlock } from "../types/classNote";
import { ocrDataUrl } from "./ocrImage";
import {
  dataUrlToJpegThumbnail,
  THUMB_JPEG_QUALITY,
  THUMB_MAX_EDGE,
} from "./imageThumbnail";
import { flattenDraftForApi } from "./draftFlatten";

/** 多模态请求最多附带缩略图张数（其余仅 OCR） */
export const MAX_VISION_THUMBNAILS = 6;

function cloneRows(rows: RowBlock[]): RowBlock[] {
  return rows.map((r) => ({
    ...r,
    images: r.images.map((im) => ({ ...im })),
  }));
}

/**
 * 魔法整理前：补全 OCR、为前 6 张图生成缩略图 URL，并返回更新后的草稿供落盘。
 */
export async function prepareAiInput(
  draft: NoteDraft,
  onStatus?: (msg: string) => void
): Promise<{
  nextDraft: NoteDraft;
  leftText: string;
  persistedImages: PersistedImage[];
  visionThumbnailDataUrls: string[];
}> {
  const rows = cloneRows(draft.rows);

  type Pos = { rowIndex: number; imageIndex: number };
  const flatOrder: Pos[] = [];
  rows.forEach((row, ri) => {
    row.images.forEach((_, ii) => flatOrder.push({ rowIndex: ri, imageIndex: ii }));
  });

  let needOcr = 0;
  for (const p of flatOrder) {
    const im = rows[p.rowIndex].images[p.imageIndex];
    if (!im.ocrText?.trim()) needOcr++;
  }

  let ocrCur = 0;
  for (const p of flatOrder) {
    const im = rows[p.rowIndex].images[p.imageIndex];
    if (!im.ocrText?.trim()) {
      ocrCur++;
      if (needOcr > 0) {
        onStatus?.(`正在识别图片文字（${ocrCur}/${needOcr}）…`);
      }
      im.ocrText = await ocrDataUrl(im.dataUrl);
    }
  }

  const visionThumbnailDataUrls: string[] = [];
  if (flatOrder.length > 0) {
    onStatus?.("正在生成上传用缩略图…");
  }
  let n = 0;
  for (const p of flatOrder) {
    if (n >= MAX_VISION_THUMBNAILS) break;
    const im = rows[p.rowIndex].images[p.imageIndex];
    try {
      visionThumbnailDataUrls.push(
        await dataUrlToJpegThumbnail(
          im.dataUrl,
          THUMB_MAX_EDGE,
          THUMB_JPEG_QUALITY
        )
      );
    } catch {
      visionThumbnailDataUrls.push(im.dataUrl);
    }
    n++;
  }

  const nextDraft: NoteDraft = { ...draft, rows };
  const { leftText, images: persistedImages } = flattenDraftForApi(nextDraft);
  return {
    nextDraft,
    leftText,
    persistedImages,
    visionThumbnailDataUrls,
  };
}
