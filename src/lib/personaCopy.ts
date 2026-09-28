import { ApiError, type DraftStatus, type Persona } from "./types";

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
    // 초안 저장·적용 관련 오류. revision_conflict(PATCH)는 이 함수로 안내하지 않는다 —
    // 화면이 "다른 곳에서 수정됨" 배너로 따로 보여주고 입력 내용을 지우지 않아야 하므로,
    // 일반 오류 문구가 아니라 별도 분기가 필요하다.
    // Gateway는 초안 생성·저장 모두에서 비공백 이름·소개를 요구한다. 일반 실패 문구로
    // 보이면 사용자가 무엇을 고쳐야 할지 모르므로 두 입력을 직접 가리킨다.
    case "invalid_settings":
      return "이름과 기본 소개를 확인해주세요. 둘 다 비워둘 수 없습니다.";
    case "settings_too_large":
      return "profile은 1,500자를 넘을 수 없습니다. 내용을 줄여주세요.";
    case "source_too_large":
      return "자료 하나의 크기가 너무 큽니다(파일당 1 MiB). 내용을 나눠 저장해주세요.";
    case "storage_quota_exceeded":
      return "전체 자료 크기가 너무 큽니다(총 5 MiB). 내용을 줄여주세요.";
    case "empty_patch":
      return "저장할 변경 내용이 없습니다.";
    case "revision_mismatch":
      return "저장하지 않은 변경이 있습니다. 먼저 저장한 뒤 다시 색인해주세요.";
    case "indexing_in_progress":
      return "이미 처리 중입니다. 완료된 뒤 다시 시도해주세요.";
    case "no_content":
      return "색인할 자료가 없습니다. 본문이나 대사를 먼저 입력해주세요.";
    case "draft_not_found":
      return "초안을 찾을 수 없습니다. 화면을 새로고침해주세요.";
    // 적용본은 있는데 초안 슬롯이 비어 있다 — 활성화 직후의 **정상** 상태다.
    // draft_not_found(404)와 달리 되돌릴 수 있는 상황이므로, 실패가 아니라
    // "새 초안을 시작하면 이어서 고칠 수 있다"로 안내한다.
    case "draft_not_started":
      return "적용된 자료는 바로 고칠 수 없습니다. 새 초안을 시작하면 지금 적용된 내용을 이어서 고칠 수 있습니다.";
    // 색인이 끝나지 않았거나, 색인 뒤 자료를 더 고쳐 indexed_revision이 뒤처졌다.
    // 그대로 활성화하면 방금 고친 내용이 빠진 색인이 적용본이 된다.
    case "not_activatable":
      return "아직 활성화할 수 없습니다. 지금 내용으로 색인을 먼저 끝내주세요.";
    case "not_indexed":
      return "아직 색인된 자료가 없습니다. 자료를 적용한 뒤 다시 시도해주세요.";
    case "schema_not_ready":
      return "아직 이 기능을 쓸 수 없습니다. 잠시 후 다시 시도해주세요.";
    case "conversation_not_found":
      return "대화를 찾을 수 없습니다. 화면을 새로고침해주세요.";
    case "generation_not_found":
      return "생성 기록을 찾을 수 없습니다.";
    case "generation_in_progress":
      // 서버의 reconciling→failed 지연 해소가 최대 5분(300초)이라, 그 시간
      // 안에는 진짜로 끝난 응답도 이 오류로 보일 수 있다 — "완료된 뒤"보다
      // 구체적인 시간 안내가 사용자에게 더 정확하다.
      return "이전 응답을 정리하는 중입니다. 최대 5분 뒤 다시 시도해주세요.";
    case "retry_not_latest":
      return "이 시도는 대화의 최신 질문이 아니라 다시 시도할 수 없습니다.";
    case "retry_input_unavailable":
      return "재사용할 입력이 없어 다시 시도할 수 없습니다.";
    case "invalid_message":
      return "질문 내용을 확인해주세요(1~2,000자).";
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
      "다음 단계는 자료 입력입니다. 아래 자료 편집에서 붙여넣고 저장한 뒤 적용하세요(붙여넣기 → 적용 → 대화 순서).",
    preparing:
      "입력한 자료를 처리하고 있습니다. 처리가 끝나면 검토할 내용을 보여드립니다.",
    review_required:
      "처리 결과를 검토한 뒤 적용하면 대화에 사용할 수 있습니다. 아래 자료 편집에서 확인하세요.",
    ready:
      "자료가 적용된 캐릭터입니다. 아래 대화에서 대화를 시작할 수 있습니다(실제 응답은 GPU 연결 후).",
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

export function draftStatusLabel(status: DraftStatus): string {
  const labels: Record<DraftStatus, string> = {
    editing: "편집 중",
    processing: "처리 중",
    ready: "색인됨",
    failed: "처리 실패",
  };
  return labels[status];
}

/**
 * 알려진 코드만 구체적으로 안내한다. openapi.json은 error_code를 자유 문자열로만
 * 정의해(enum 없음) 전체 목록이 없다 — 모르는 코드를 조용히 일반 문구로 삼키면
 * 새 실패 원인을 놓치므로, 알려지지 않은 코드는 원문 그대로 함께 보여준다.
 */
const DRAFT_FAILURE_MESSAGES: Record<string, string> = {
  no_content: "색인할 자료가 없습니다. 본문이나 대사를 먼저 입력해주세요.",
};

export function draftFailedMessage(errorCode: string | null): string {
  if (errorCode !== null && errorCode in DRAFT_FAILURE_MESSAGES) {
    return DRAFT_FAILURE_MESSAGES[errorCode];
  }
  const suffix = errorCode === null ? "" : ` (코드: ${errorCode})`;
  return `자료 처리에 실패했습니다. 자료를 확인한 뒤 다시 색인해주세요.${suffix}`;
}
