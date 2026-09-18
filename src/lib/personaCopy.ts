import { ApiError, type Persona } from "./types";

/**
 * 사용자에게 보여줄 한국어 문구를 한곳에 모은다.
 * 화면 컴포넌트가 늘어나도 같은 상황을 서로 다른 말로 안내하지 않게 하려는 목적이다.
 */

/**
 * 오류를 사용자용 문장으로 바꾼다.
 *
 * 서버 `message`는 파싱하지 않고 `code`로만 분기한다. 계약(service-api-v1.md 1절)이
 * message 문자열을 UI 분기 근거로 쓰지 말라고 정하고 있고, 그 문구에는 사용자 입력이
 * 섞여 들어올 수 있기 때문이다. ApiError가 아니면 네트워크 문제로 안내한다.
 */
export function messageFor(error: unknown): string {
  if (!(error instanceof ApiError))
    return "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요.";
  switch (error.code) {
    case "invalid_persona_name":
      return "캐릭터 이름을 확인해주세요.";
    case "duplicate_persona_name":
      return "같은 이름의 캐릭터가 있습니다. 다른 이름을 입력해주세요.";
    case "persona_limit_exceeded":
      return "캐릭터는 최대 3개까지 만들 수 있습니다. 목록을 다시 확인해주세요.";
    case "idempotency_conflict":
      return "이전 생성 요청과 내용이 달라 요청을 처리할 수 없습니다. 이름을 확인해주세요.";
    case "dependency_unavailable":
      return "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.";
    case "invalid_response":
      // 라우팅·배포 설정 문제라 재시도로는 풀리지 않는다. "잠시 후 다시"를 권하지
      // 않는다. 이 오류에는 요청 ID도 없으므로 요청 ID를 묻지도 않는다.
      return "서버 응답 형식이 예상과 달라 화면에 표시할 수 없습니다. 입력 문제가 아니라 서버 연결 설정 문제일 수 있으니 관리자에게 알려주세요.";
    default:
      return "요청을 처리하지 못했습니다. 문제가 계속되면 요청 ID를 알려주세요.";
  }
}

/**
 * 우리가 직접 취소한 요청인지 판별한다.
 *
 * 로그아웃·언마운트에서 진행 중 요청을 abort하므로 이 실패는 사용자에게 보여줄
 * 오류가 아니다. 서버 오류와 섞어서 안내하지 않으려고 따로 구분한다.
 */
export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function statusLabel(status: Persona["status"]): string {
  const labels: Record<Persona["status"], string> = {
    needs_material: "자료 입력 필요",
    preparing: "자료 준비 중",
    review_required: "검토 필요",
    ready: "준비됨",
    deleting: "삭제 중",
  };
  return labels[status];
}

/**
 * 상태를 경고가 아니라 "지금 할 수 있는 일" 안내로 바꾼다.
 *
 * 자료 업로드·대화는 아직 구현되지 않았으므로 여기서도 버튼을 약속하지 않고
 * 현재 사실만 문장으로 전한다.
 */
export function nextStepFor(status: Persona["status"]): string {
  const guides: Record<Persona["status"], string> = {
    needs_material:
      "다음 단계는 자료 입력입니다. 자료 업로드 화면은 아직 준비 중이라 지금은 이름만 관리할 수 있습니다.",
    preparing:
      "입력한 자료를 처리하고 있습니다. 처리가 끝나면 검토할 내용을 보여드립니다.",
    review_required:
      "처리 결과를 검토한 뒤 적용하면 대화에 사용할 수 있습니다. 검토 화면은 아직 준비 중입니다.",
    ready:
      "자료가 적용된 캐릭터입니다. 대화 화면은 아직 준비 중이라 지금은 상태만 확인할 수 있습니다.",
    deleting:
      "삭제를 처리하고 있습니다. 서버에서 삭제가 끝나야 새 캐릭터를 만들 수 있습니다.",
  };
  return guides[status];
}

/**
 * 생성일을 사용자 지역 표기로 바꾼다.
 *
 * 서버는 UTC RFC3339로 주고 표시는 브라우저 시간대를 따르므로, 실행 환경에 따라
 * 결과 문자열이 달라질 수 있다. 값을 해석할 수 없으면 원본을 그대로 보여주고
 * 임의의 날짜를 지어내지 않는다.
 */
export function formatCreatedAt(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) return createdAt;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
  }).format(parsed);
}
