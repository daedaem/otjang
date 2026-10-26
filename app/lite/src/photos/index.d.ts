export function garmentThumbnail(
  namespace: string,
  id: string,
): Promise<Blob | null>;
export function saveGarmentPhoto(input: {
  namespace: string;
  core: {
    boot?: { preview?: boolean };
    assertPhotoReady(): void;
    updateGarmentPhoto(id: string, photoId: string): unknown;
  };
  garmentId: string;
  file: Blob;
  width: number;
  height: number;
}): Promise<unknown>;
export function imageDimensions(
  file: Blob,
): Promise<{ width: number; height: number }>;
