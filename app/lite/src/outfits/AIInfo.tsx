import type { ProviderInfo } from "./types";
export function AIInfo({
  info,
  cached,
  receivedAt,
}: {
  info?: ProviderInfo;
  cached: boolean;
  receivedAt: string | null;
}) {
  return (
    <details className="of-ai-info">
      <summary>AI 응답 정보</summary>
      {cached && <p>같은 입력에 받은 이전 응답을 보여 드려요.</p>}
      {receivedAt && (
        <p>
          이 화면에서 받은 시각: {new Date(receivedAt).toLocaleString("ko-KR")}
        </p>
      )}
      {info ? (
        <dl>
          <dt>모델</dt>
          <dd>{info.model}</dd>
          <dt>입력 토큰</dt>
          <dd>{info.inputTokens}</dd>
          <dt>출력 토큰</dt>
          <dd>{info.outputTokens}</dd>
          <dt>응답 ID</dt>
          <dd>{info.requestId}</dd>
          {info.cacheReadInputTokens !== undefined && (
            <>
              <dt>캐시 입력 토큰</dt>
              <dd>{info.cacheReadInputTokens}</dd>
            </>
          )}
        </dl>
      ) : (
        <p>제공자 응답 정보가 없어 모델·사용량을 추정하지 않았어요.</p>
      )}
    </details>
  );
}
