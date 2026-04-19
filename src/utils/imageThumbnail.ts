/** 长边限制、JPEG 质量：与 AI 折中方案一致 */
export const THUMB_MAX_EDGE = 1024;
export const THUMB_JPEG_QUALITY = 0.82;

/** 将任意 data URL 压成 JPEG 缩略图（长边不超过 maxEdge），用于多模态请求，避免原图撑爆 token */
export function dataUrlToJpegThumbnail(
  dataUrl: string,
  maxEdge: number,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          reject(new Error("图片尺寸无效"));
          return;
        }
        const scale = Math.min(1, maxEdge / Math.max(w, h));
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement("canvas");
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 不可用"));
          return;
        }
        ctx.drawImage(img, 0, 0, tw, th);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = dataUrl;
  });
}
