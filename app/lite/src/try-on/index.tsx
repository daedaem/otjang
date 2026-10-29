import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONSENT_VERSION,
  preparePicture,
  tryOnClient,
  type Picture,
  type Job,
  type Configuration,
} from "./client";
import "./try-on.css";

type Host = {
  element: HTMLElement;
  namespace: string;
  core: { boot?: { preview?: boolean }; assertPhotoReady(): void };
  candidate: {
    id: string;
    brand: string;
    name: string;
    reason?: string;
    photoId?: string;
  } | null;
  back(): void;
  compare(): void;
};
type LocalJob = Pick<Job, "id" | "expiresAt"> & { photoId?: string };
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
async function photos(host: Host) {
  if (host.core.boot?.preview)
    throw Error("체험 화면에서는 개인 사진을 열지 않아요.");
  host.core.assertPhotoReady();
  const module = await (window as any).EOUL_PHOTO_LOAD();
  return { module, repository: await module.photoLibrary(host.namespace) };
}
function TryOn({ host }: { host: Host }) {
  const client = useMemo(tryOnClient, []);
  const key =
    "hangit-tryon-job:v1:" +
    ((window as any).EOUL_ACCOUNT?.scope || "local") +
    ":" +
    (host.candidate?.id || "manual");
  const [config, setConfig] = useState<Configuration | null>(null);
  const [person, setPerson] = useState<Picture | null>(null),
    [garment, setGarment] = useState<Picture | null>(null);
  const [remember, setRemember] = useState(true),
    [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false),
    [selecting, setSelecting] = useState(false),
    [notice, setNotice] = useState("");
  const [job, setJob] = useState<Job | null>(null),
    [result, setResult] = useState("");
  const [tab, setTab] = useState<"result" | "before" | "garment">("result");
  const submitted = useRef(false),
    live = useRef(true),
    epoch = useRef(0),
    urls = useRef(new Set<string>()),
    jobRef = useRef<LocalJob | null>(null),
    autoPoll = useRef(false),
    pickedPerson = useRef(false),
    pickedGarment = useRef(false);
  const addUrl = (picture: Picture) => {
    urls.current.add(picture.preview);
    return picture;
  };
  const putJob = (value: LocalJob) => {
    jobRef.current = value;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  };
  const loadPhoto = async (id?: string) => {
    const { repository } = await photos(host);
    const record = id
      ? await repository.get(id)
      : await (async () => {
          const list = (await repository.list())
            .filter((p: any) => p.role === "body")
            .sort((a: any, b: any) => b.at.localeCompare(a.at));
          return list[0] ? repository.get(list[0].id) : null;
        })();
    if (record?.blob) {
      const picture = await preparePicture(record.blob);
      if (!live.current || pickedPerson.current) {
        URL.revokeObjectURL(picture.preview);
        return;
      }
      (window as any).EOUL_ACCOUNT?.assertActive();
      setPerson(addUrl(picture));
    }
  };
  useEffect(() => {
    live.current = true;
    client
      .configuration()
      .then((value) => {
        if (live.current) setConfig(value);
      })
      .catch(() => {
        if (live.current) setConfig({available:false,creditsPerImage:3,consentVersion:CONSENT_VERSION,message:'연결 상태를 확인하지 못했어요. 온라인에서 이 화면을 다시 열어 주세요.'});
      });
    let resume: LocalJob | null = null;
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || "null");
      if (
        UUID.test(value?.id || "") &&
        Number.isSafeInteger(value?.expiresAt) &&
        value.expiresAt > Date.now()
      )
        resume = value;
    } catch {}
    if (resume) {
      jobRef.current = resume;
      autoPoll.current = true;
      setJob({ ...resume, state: "submitted" });
      if (resume.photoId) void loadPhoto(resume.photoId).catch(() => {});
    } else {
      void loadPhoto().catch(() => {});
      if (host.candidate?.photoId)
        void (async () => {
          const { repository } = await photos(host),
            record = await repository.get(host.candidate!.photoId);
          if (!record?.blob) return;
          const picture = await preparePicture(record.blob);
          if (!live.current || pickedGarment.current) {
            URL.revokeObjectURL(picture.preview);
            return;
          }
          (window as any).EOUL_ACCOUNT?.assertActive();
          setGarment(addUrl(picture));
        })().catch(() => {});
    }
    return () => {
      live.current = false;
      epoch.current++;
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current.clear();
    };
  }, [client, host]);
  const pick = async (file: File | undefined, target: "person" | "garment") => {
    if (!file || busy || submitted.current) return;
    if (target === "person") pickedPerson.current = true;
    else pickedGarment.current = true;
    setSelecting(true);
    setNotice("");
    try {
      const picture = await preparePicture(file);
      if (!live.current) {
        URL.revokeObjectURL(picture.preview);
        return;
      }
      addUrl(picture);
      const old = target === "person" ? person : garment;
      if (old) {
        URL.revokeObjectURL(old.preview);
        urls.current.delete(old.preview);
      }
      (target === "person" ? setPerson : setGarment)(picture);
      setConsent(false);
    } catch (error: any) {
      if (live.current) setNotice(error.message);
    } finally {
      if (live.current) setSelecting(false);
    }
  };
  const check = async (repeat = false) => {
    const local = jobRef.current;
    if (!local || busy) return;
    setBusy(true);
    setNotice("");
    const token = ++epoch.current;
    try {
      for (let n = 0; n < (repeat ? 45 : 1); n++) {
        const value = await client.status(local.id);
        if (!live.current || token !== epoch.current) return;
        setJob(value);
        if (value.state === "completed" && value.image) {
          setResult(value.image);
          setTab("result");
          return;
        }
        if (value.state === "failed") {
          setNotice(
            "생성하지 못했어요. 사진을 바꾸거나 나중에 새로 시도해 주세요.",
          );
          return;
        }
        if (value.state === "unknown") {
          setNotice(
            "접수 여부를 확인하지 못했어요. 중복 요청을 막기 위해 자동으로 다시 생성하지 않아요.",
          );
          return;
        }
        if (!repeat) return;
        await new Promise((resolve) => setTimeout(resolve, 3500));
        if (!live.current || token !== epoch.current) return;
      }
      setNotice(
        "아직 준비 중이에요. 잠시 뒤 같은 요청의 결과를 확인해 주세요.",
      );
    } catch (error: any) {
      if (live.current) setNotice(error.message);
    } finally {
      if (live.current && token === epoch.current) setBusy(false);
    }
  };
  const start = async () => {
    if (
      !person ||
      !garment ||
      !consent ||
      !config?.available ||
      busy ||
      selecting ||
      submitted.current ||
      jobRef.current
    )
      return;
    submitted.current = true;
    setBusy(true);
    setNotice("");
    let photoId: string | undefined;
    try {
      if (remember) {
        const { module, repository } = await photos(host);
        const record = await module.prepareBodyPhoto(person.file);
        await repository.withLock(async () => {
          host.core.assertPhotoReady();
          await repository.put(record);
        });
        photoId = record.id;
      }
      (window as any).EOUL_ACCOUNT?.assertActive();
      const requestId = crypto.randomUUID();
      putJob({
        id: requestId,
        expiresAt: Date.now() + 3600000,
        ...(photoId ? { photoId } : {}),
      });
      setJob({
        id: requestId,
        expiresAt: Date.now() + 3600000,
        state: "starting",
      });
      const value = await client.start({
        requestId,
        person: person.data,
        garment: garment.data,
        rightsConfirmed: true,
        consentVersion: CONSENT_VERSION,
      });
      if (!live.current) return;
      putJob({
        id: value.id,
        expiresAt: value.expiresAt,
        ...(photoId ? { photoId } : {}),
      });
      autoPoll.current = true;
      setJob(value);
    } catch (error: any) {
      if (live.current) {
        if (
          [
            "not_configured",
            "consent_required",
            "invalid_image",
            "invalid_body",
            "invalid_origin",
            "tryon_limit",
            "account_changed",
            "unauthorized",
          ].includes(error.code)
        ) {
          jobRef.current = null;
          try {
            sessionStorage.removeItem(key);
          } catch {}
          setJob(null);
        }
        setNotice(error.message);
      }
    } finally {
      submitted.current = false;
      if (live.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (autoPoll.current && job && !busy) {
      autoPoll.current = false;
      void check(true);
    }
  }, [job, busy]);
  const reset = () => {
    if (busy) return;
    epoch.current++;
    jobRef.current = null;
    try {
      sessionStorage.removeItem(key);
    } catch {}
    setJob(null);
    setResult("");
    setConsent(false);
    setNotice("새 사진으로 생성하면 별도 생성 요청이 됩니다.");
  };
  const download = () => {
    if (!result.startsWith("data:image/jpeg;base64,")) return;
    const data = Uint8Array.from(atob(result.slice(23)), (c) =>
        c.charCodeAt(0),
      ),
      url = URL.createObjectURL(new Blob([data], { type: "image/jpeg" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "hangit-try-on.jpg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const source =
    tab === "before"
      ? person?.preview
      : tab === "garment"
        ? garment?.preview
        : result;
  return (
    <section className="to" data-react-tryon>
      <header className="to-top">
        <button
          type="button"
          className="quiet"
          aria-label="상품으로 돌아가기"
          onClick={host.back}
        >
          <i className="ph ph-arrow-left" aria-hidden="true" />
        </button>
        <b>내 사진에 입혀 보기</b>
        <span className="to-beta">베타</span>
      </header>
      <h1>
        {result
          ? "입어 본 모습을 비교해 보세요"
          : job
            ? "착용 이미지를 준비하고 있어요"
            : "사기 전에, 내 모습으로"}
      </h1>
      <p className="to-lead">
        {host.candidate
          ? `${host.candidate.brand} ${host.candidate.name}`
          : "입어 보고 싶은 옷과 내 사진을 골라 주세요."}
      </p>
      {result ? (
        <>
          <div className="to-tabs" role="group" aria-label="착용 이미지 비교">
            {(
              [
                ["result", "입힌 모습", false],
                ["before", "입기 전", !person],
                ["garment", "옷 원본", !garment],
              ] as const
            ).map(([value, label, disabled]) => (
              <button
                key={value}
                type="button"
                disabled={disabled}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <figure className="to-result">
            <img
              src={source || result}
              alt={
                tab === "result"
                  ? "AI로 생성한 착용 미리보기"
                  : tab === "before"
                    ? "선택한 내 원본 사진"
                    : "합성에 사용한 옷 원본 사진"
              }
            />
          </figure>
          <p className="to-note">
            AI 착용 미리보기예요. 얼굴·무늬·로고·기장이 달라질 수 있어요. 실제
            사이즈·핏은 실측과 함께 확인해 주세요.
          </p>
          {host.candidate?.reason ? (
            <section className="to-reason">
              <h2>추천에서 확인한 이유</h2>
              <p>{host.candidate.reason}</p>
            </section>
          ) : null}
          <div className="to-actions">
            <button type="button" className="btn go" onClick={download}>
              이미지 저장
            </button>
            <button type="button" className="btn line" onClick={host.compare}>
              내 옷과 비교하기
            </button>
          </div>
          <button type="button" className="quiet" onClick={reset}>
            다른 사진으로 새로 입혀 보기
          </button>
        </>
      ) : (
        <>
          <div className="to-pictures">
            {(
              [
                ["person", "내 사진", person],
                ["garment", "입혀 볼 옷", garment],
              ] as const
            ).map(([type, label, picture]) => (
              <label className="to-picker" key={type}>
                <span>{label}</span>
                {picture ? (
                  <img src={picture.preview} alt={`${label} 선택한 사진`} />
                ) : (
                  <div className="to-empty">
                    <i
                      className={`ph ${type === "person" ? "ph-user" : "ph-t-shirt"}`}
                      aria-hidden="true"
                    />
                    <span>사진 고르기</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={`${label} 고르기`}
                  disabled={busy || selecting || !!job}
                  onChange={(e) => {
                    void pick(e.target.files?.[0], type);
                    e.target.value = "";
                  }}
                />
              </label>
            ))}
          </div>
          {!job ? (
            <>
              <p className="to-note">
                정면으로 선 내 사진과 옷 전체가 보이는 사진이 좋아요.
              </p>
              <label className="to-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={busy}
                />
                내 사진을 이 기기에 기억하기
              </label>
              <details className="to-privacy">
                <summary>사진은 어떻게 사용되나요?</summary>
                <p>판매처 사진은 자동으로 합성하지 않아요. 직접 찍었거나 합성에 사용할 권한이 있는 옷 사진을 골라 주세요.</p>
                <p>
                  사진을 고르기만 하면 전송하지 않아요. ‘입혀 보기’를 누르면
                  위치·촬영 정보를 제거한 내 사진과 옷 사진을 FASHN에 보냅니다.
                  우리 서버에는 사진을 저장하지 않아요. FASHN의 입력 처리 사본은
                  요청 종료 시 삭제되며 자동 정리는 최대 하루, 생성 결과는 완료
                  후 60분간 조회됩니다. 요청 상태·설정 기록은 남고, 별도 동의
                  없이는 모델 학습에 쓰지 않는다는 제공자 정책입니다.
                </p>
                <a
                  href="https://docs.fashn.ai/api-overview/data-retention-privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  제공자 사진 처리 정책
                </a>
              </details>
              <label className="to-check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={busy}
                />
                내 사진과 합성에 사용할 수 있는 옷 사진을 FASHN으로 보내는 데
                동의해요.
              </label>
              {!config ? (
                <p role="status" className="to-note">
                  연결 상태를 확인하고 있어요…
                </p>
              ) : !config.available ? (
                <p role="status" className="to-notice">
                  {config.message}
                </p>
              ) : null}
              <button
                type="button"
                className="btn go to-generate"
                disabled={
                  !config?.available ||
                  !person ||
                  !garment ||
                  !consent ||
                  busy ||
                  selecting
                }
                onClick={() => void start()}
              >
                {busy
                  ? "생성을 요청하고 있어요…"
                  : selecting
                    ? "사진을 준비하고 있어요…"
                    : !config?.available ? "가상 착용 준비 중" : "이 옷 입혀 보기"}
              </button>
            </>
          ) : (
            <div className="to-progress" aria-live="polite">
              <i className="ph ph-sparkle" aria-hidden="true" />
              <h2>
                {job.state === "failed"
                  ? "생성하지 못했어요"
                  : job.state === "unknown"
                    ? "접수 여부를 확인하고 있어요"
                    : "이미지를 만드는 중이에요"}
              </h2>
              <p>
                같은 요청을 다시 생성하지 않고 결과만 확인해요. 생성 중에는
                사진을 바꾸지 않아요.
              </p>
              <button
                type="button"
                className="btn go"
                disabled={busy}
                onClick={() => void check(true)}
              >
                {busy ? "결과를 기다리고 있어요…" : "같은 요청의 결과 확인"}
              </button>
              <button
                type="button"
                className="quiet"
                disabled={busy}
                onClick={reset}
              >
                사진을 바꿔 새로 요청하기
              </button>
            </div>
          )}
        </>
      )}
      {notice ? (
        <p role="status" className="to-notice">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
export function mount(host: Host) {
  const root = createRoot(host.element);
  root.render(<TryOn host={host} />);
  return () => root.unmount();
}
