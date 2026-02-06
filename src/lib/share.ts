import type { SourceFile } from "@/store/bundler";

export interface ShareData {
  rspackVersion: string;
  inputFiles: SourceFile[];
}

// Share functionality
// Use Unicode-safe base64 encoding to support Chinese and other non-Latin1 characters
export const serializeShareData = (data: ShareData): string => {
  const jsonString = JSON.stringify(data);
  // Convert string to UTF-8 bytes, then to base64
  const utf8Bytes = new TextEncoder().encode(jsonString);
  const binaryString = Array.from(utf8Bytes, (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(binaryString);
};

export const deserializeShareData = (base64: string): ShareData | null => {
  try {
    // Decode base64 to binary string, then to UTF-8 bytes
    const binaryString = atob(base64);
    const utf8Bytes = Uint8Array.from(binaryString, (char) =>
      char.charCodeAt(0),
    );
    const json = new TextDecoder().decode(utf8Bytes);
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
