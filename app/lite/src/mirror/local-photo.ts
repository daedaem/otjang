import { useEffect, useState } from "react";
import type { LayerAsset, MirrorHost } from "./types";
export async function photoModule(host: MirrorHost) {
  if (host.core.boot?.preview)
    throw Error("체험 화면에서는 개인 사진을 열지 않아요.");
  host.core.assertPhotoReady();
  const mod = await (window as any).EOUL_PHOTO_LOAD();
  return { ...mod, photoLibrary: () => mod.photoLibrary(host.namespace) };
}
export function useLocalPhoto(
  host: MirrorHost,
  id: string | null | undefined,
  thumbnail = false,
) {
  const [state, setState] = useState<{
    id: string;
    asset: LayerAsset | null;
    error: string;
  }>({ id: "", asset: null, error: "" });
  useEffect(() => {
    let live = true,
      url = "";
    if (!id || host.core.boot?.preview) return;
    (async () => {
      const mod = await photoModule(host),
        repo = await mod.photoLibrary();
      const blob = thumbnail
        ? await mod.garmentThumbnail(host.namespace, id)
        : (await repo.get(id))?.blob;
      if (!blob)
        throw Error(
          "연결된 사진이 이 기기에 없어요. 사진 포함 백업을 복원해 주세요.",
        );
      const size = await mod.imageDimensions(blob);
      if (!live) return;
      url = URL.createObjectURL(blob);
      setState({ id, asset: { src: url, photoId: id, ...size }, error: "" });
    })().catch((e) => {
      if (live)
        setState({
          id,
          asset: null,
          error: e.message || "기기 사진을 열지 못했어요.",
        });
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [host, id, thumbnail]);
  return state.id === id ? state : { id: id || "", asset: null, error: "" };
}
