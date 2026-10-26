export const PHOTO_PENDING_KEY = "eoul-backup:photos-pending";
export const PHOTO_PENDING_MESSAGE =
  "사진 백업 복구가 끝나지 않았어요. 먼저 백업 화면에서 복구를 마쳐 주세요.";
export function assertPhotoIdle(storage) {
  if (storage?.getItem(PHOTO_PENDING_KEY) != null)
    throw Object.assign(new Error(PHOTO_PENDING_MESSAGE), {
      code: "photo_recovery_pending",
    });
}

export async function withPhotoLock(
  namespace,
  run,
  locks = globalThis.navigator?.locks,
) {
  if (!locks?.request)
    throw Object.assign(
      new Error(
        "이 브라우저는 사진 복구 잠금을 지원하지 않아요. 최신 브라우저에서 진행해 주세요.",
      ),
      { code: "photo_lock_unavailable" },
    );
  return locks.request(
    "eoul-photo-transaction:" + namespace,
    { mode: "exclusive", ifAvailable: true },
    (lock) => {
      if (!lock)
        throw Object.assign(
          new Error("다른 탭의 백업 작업이 끝난 뒤 다시 진행해 주세요."),
          { code: "photo_recovery_pending" },
        );
      return run();
    },
  );
}
