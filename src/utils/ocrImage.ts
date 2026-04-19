/** 浏览器端 OCR（Tesseract），按需动态加载以减小首屏体积。
 *  worker / core / 语言包均从 public 目录提供，避免默认走 jsDelivr 导致无法加载。
 */
function tesseractAssetPaths() {
  const base = import.meta.env.BASE_URL;
  const root = base.endsWith("/") ? base : `${base}/`;
  return {
    workerPath: `${root}tesseract/worker.min.js`,
    corePath: `${root}tesseract-core`,
    langPath: `${root}tesseract-lang`,
  };
}

export async function ocrDataUrl(
  dataUrl: string,
  lang = "chi_sim+eng"
): Promise<string> {
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker(lang, OEM.LSTM_ONLY, tesseractAssetPaths());
  try {
    const {
      data: { text },
    } = await worker.recognize(dataUrl);
    return text.trim();
  } finally {
    await worker.terminate();
  }
}

