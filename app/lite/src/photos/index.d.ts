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
export const PHOTO_PENDING_KEY: string;
export const MAX_BINARY_BYTES: number;
// WO-07: the same repository/controller pair mountPhotoBackup uses.
export function photoBackupSession(
  namespace: string,
  input: { storage: Storage; textBackup: unknown },
): Promise<{ repository: unknown; controller: unknown }>;
