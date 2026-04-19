const STORAGE_KEY = "cornell-notes-deepseek-api-key";

/** 初次进入：优先本地已保存的 Key，其次构建时注入的 VITE_DEEPSEEK_API_KEY */
export function getInitialApiKey(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored != null && stored !== "") return stored;
  } catch {
    /* 隐私模式等 */
  }
  return import.meta.env.VITE_DEEPSEEK_API_KEY ?? "";
}

export function persistApiKey(key: string): void {
  try {
    if (key.trim() === "") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, key);
    }
  } catch {
    /* 存储满或禁用 */
  }
}
