/**
 * Quiz image upload from the editor: the picked file is scaled down in the browser (longer side
 * ≤ 1600 px, WebP or JPEG) and stored at quizImages/{uid}/{random}. The storage rules allow only
 * hosts, images up to 2 MB, and no overwriting.
 */
export const IMAGE_LIMITS = {
  /** what the editor accepts before scaling (a phone photo) */
  maxInputBytes: 15 * 1024 * 1024,
  /** what the storage rules accept */
  maxUploadBytes: 2 * 1024 * 1024,
  maxSide: 1600,
  types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
} as const;

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** null when the file can be used; else what is wrong with it. */
export function checkImageFile(file: Pick<File, "type" | "size">): "type" | "size" | null {
  if (!(IMAGE_LIMITS.types as readonly string[]).includes(file.type)) return "type";
  if (file.size > IMAGE_LIMITS.maxInputBytes) return "size";
  return null;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Scaled-down copy of the image; a GIF is kept as it is (scaling would drop its animation). */
async function shrink(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, IMAGE_LIMITS.maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    // WebP where the browser can encode it (Safari falls back to JPEG)
    const blob = (await toBlob(canvas, "image/webp", quality)) ?? (await toBlob(canvas, "image/jpeg", quality));
    if (blob && blob.size <= IMAGE_LIMITS.maxUploadBytes) return blob;
  }
  throw new Error("too-large");
}

/** Uploads the image for host `uid`; resolves to its public https address. */
export async function uploadQuizImage(uid: string, file: File): Promise<string> {
  const blob = await shrink(file);
  if (blob.size > IMAGE_LIMITS.maxUploadBytes) throw new Error("too-large");
  const [{ ref, uploadBytes, getDownloadURL }, { storage }] = await Promise.all([import("firebase/storage"), import("../storage")]);
  const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : blob.type === "image/gif" ? "gif" : "jpg";
  const target = ref(storage, `quizImages/${uid}/${crypto.randomUUID()}.${ext}`);
  await uploadBytes(target, blob, { contentType: blob.type, cacheControl: "public, max-age=31536000, immutable" });
  return getDownloadURL(target);
}
