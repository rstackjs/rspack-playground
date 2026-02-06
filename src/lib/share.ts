import type { SourceFile } from "@/store/bundler";

export interface ShareData {
  rspackVersion: string;
  inputFiles: SourceFile[];
}

// Share functionality
export const serializeShareData = (data: ShareData): string => {
  return btoa(encodeURIComponent(JSON.stringify(data)));
};

export const deserializeShareData = (base64: string): ShareData | null => {
  try {
    const json = decodeURIComponent(atob(base64));
    const data = JSON.parse(json);

    // Validate the data structure
    if (
      typeof data === "object" &&
      typeof data.rspackVersion === "string" &&
      Array.isArray(data.inputFiles)
    ) {
      return data;
    }
    return null;
  } catch (error) {
    console.error("Failed to deserialize share data:", error);
    return null;
  }
};

export const getShareUrl = (data: ShareData): string => {
  const base64 = serializeShareData(data);
  return `${window.location.origin}${window.location.pathname}#${base64}`;
};
