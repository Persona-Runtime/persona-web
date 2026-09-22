/**
 * 조회 실패 안내와 재시도 버튼. 사용자가 조치해야 하므로 alert로 알린다.
 *
 * actionLabel을 받는 이유: 목록 영역과 작업 영역에 이 안내가 동시에 뜰 수 있는데,
 * 같은 이름의 버튼이 둘이면 어느 쪽을 누르는지 알기 어렵다.
 */
export function RetryNotice({
  message,
  onRetry,
  actionLabel = "다시 조회",
}: {
  message: string;
  onRetry: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      <button className="secondary" type="button" onClick={onRetry}>
        {actionLabel}
      </button>
    </div>
  );
}
