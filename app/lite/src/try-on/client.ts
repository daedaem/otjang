export const CONSENT_VERSION = "fashn-2026-10-29";
export type Job = {
  id: string;
  state: string;
  expiresAt: number;
  image?: string;
  note?: string;
};
export type Configuration = {
  available: boolean;
  message: string;
  creditsPerImage: number;
  consentVersion: string;
};
export class TryOnError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function tryOnClient() {
  async function call(path: string, body?: unknown): Promise<any> {
    (window as any).EOUL_ACCOUNT?.assertActive();
    let response: Response;
    try {
      response = await fetch("/api/try-on/" + path, {
        credentials: "same-origin",
        cache: "no-store",
        ...(body
          ? {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
    } catch {
      throw new TryOnError(
        "connection",
        "연결을 확인해 주세요. 같은 요청의 결과 확인으로 이어갈 수 있어요.",
      );
    }
    const result = await response.json().catch(() => ({}));
    (window as any).EOUL_ACCOUNT?.assertActive();
    if (!response.ok)
      throw new TryOnError(
        result.code || "unavailable",
        result.message || "착용 이미지를 불러오지 못했어요.",
      );
    return result;
  }
  return {
    configuration: () => call("config") as Promise<Configuration>,
    start: (body: {
      requestId: string;
      person: string;
      garment: string;
      consentVersion: string;
      rightsConfirmed: boolean;
    }) => call("jobs", body) as Promise<Job>,
    status: (id: string) =>
      call("jobs/" + encodeURIComponent(id)) as Promise<Job>,
  };
}
export type Picture = { preview: string; data: string; file: Blob };
export async function preparePicture(file: Blob): Promise<Picture> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 8 * 1024 * 1024
  )
    throw Error("JPEG·PNG·WebP 사진을 8MB 이하로 골라 주세요.");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(Error("사진을 읽지 못했어요. 다른 사진을 골라 주세요."));
      img.src = url;
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 12_000_000
    )
      throw Error("1,200만 화소 이하의 사진 사본을 골라 주세요.");
    const scale = Math.min(
      1,
      1536 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw Error("사진을 준비하지 못했어요.");
    context.fillStyle = "#f4f4f5";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let copy: Blob | null = null;
    for (const quality of [0.9, 0.8, 0.65]) {
      copy = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (copy && copy.size <= 1024 * 1024) break;
    }
    if (!copy || copy.size > 1024 * 1024)
      throw Error("더 작은 사진을 골라 주세요.");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error("사진을 읽지 못했어요."));
      reader.readAsDataURL(copy!);
    });
    return { preview: URL.createObjectURL(copy), data, file };
  } finally {
    URL.revokeObjectURL(url);
  }
}
