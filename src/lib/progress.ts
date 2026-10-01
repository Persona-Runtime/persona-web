import type { DraftStatus, Persona } from "./types";

/**
 * 캐릭터가 "자료 붙이기 → 색인 → 검토·적용 → 대화" 네 단계 중 어디에 있는지 계산한다.
 *
 * 서버가 계산한 persona.status를 기준으로 삼고, 세부 진행·실패만 목록 응답에 실린
 * draft 요약(DraftSummary)의 status로 보탠다. 새 API를 부르지 않는다 — 개요 화면은
 * 상세 초안을 조회하지 않으므로 목록 응답에 있는 값만으로 판단해야 한다.
 */

export const PROGRESS_STEPS = [
  "자료 붙이기",
  "색인",
  "검토·적용",
  "대화",
] as const;

export type ProgressStep = 1 | 2 | 3 | 4;

/**
 * 현재 단계의 표시 톤.
 * - current: 지금 할 차례(틸)
 * - processing: 서버가 처리 중(앰버, 사용자가 기다릴 차례)
 * - failed: 마지막 처리 시도가 실패(로즈)
 */
export type ProgressTone = "current" | "processing" | "failed";

export interface Progress {
  step: ProgressStep;
  tone: ProgressTone;
}

const DRAFT_STATUSES: Record<DraftStatus, true> = {
  editing: true,
  processing: true,
  ready: true,
  failed: true,
};

/**
 * 목록 응답의 draft 요약에서 status만 꺼낸다.
 *
 * Persona.draft는 api.ts 검증이 "필드가 있다"까지만 확인한 unknown이다. 타입을
 * 단정(as)하지 않고 여기서 모양을 확인한 뒤에만 쓴다 — 계약 밖의 값이 오면 null로 보고
 * persona.status만으로 단계를 정한다.
 */
export function draftStatusOf(persona: Persona): DraftStatus | null {
  const draft = persona.draft;
  if (typeof draft !== "object" || draft === null || !("status" in draft)) {
    return null;
  }
  const status = (draft as { status: unknown }).status;
  return typeof status === "string" && Object.hasOwn(DRAFT_STATUSES, status)
    ? (status as DraftStatus)
    : null;
}

/**
 * 단계와 톤을 계산한다. 삭제 중인 캐릭터는 진행 단계가 의미 없으므로 null이다.
 *
 * 적용본이 있으면(ready) 새 초안이 처리 중이어도 4단계다 — 서버도 "적용본이 있으면
 * 초안 처리 여부와 무관하게 ready"로 계산한다(service-api-v1.md 2절).
 */
export function personaProgress(persona: Persona): Progress | null {
  const draftStatus = draftStatusOf(persona);
  switch (persona.status) {
    case "deleting":
      return null;
    case "ready":
      return { step: 4, tone: "current" };
    case "needs_material":
      return { step: 1, tone: "current" };
    case "preparing":
      return { step: 2, tone: "processing" };
    case "review_required":
      if (draftStatus === "processing") return { step: 2, tone: "processing" };
      if (draftStatus === "failed") return { step: 2, tone: "failed" };
      return { step: 3, tone: "current" };
  }
}
