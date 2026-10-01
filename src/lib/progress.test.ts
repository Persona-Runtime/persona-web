import { describe, expect, test } from "vitest";
import { persona } from "../test/renderApp";
import { draftStatusOf, personaProgress } from "./progress";
import type { Persona } from "./types";

/** 목록 응답의 draft 요약(DraftSummary) 모양. status 외 값은 계산에 쓰지 않는다. */
function withDraft(status: unknown): Persona["draft"] {
  return {
    version_id: "10000000-0000-4000-8000-000000000001",
    revision: 1,
    status,
    job_id: null,
    requires_processing: true,
  };
}

describe("personaProgress", () => {
  test("persona.status를 지시문의 4단계로 옮긴다", () => {
    expect(personaProgress({ ...persona, status: "needs_material" })).toEqual({
      step: 1,
      tone: "current",
    });
    expect(personaProgress({ ...persona, status: "preparing" })).toEqual({
      step: 2,
      tone: "processing",
    });
    expect(
      personaProgress({
        ...persona,
        status: "review_required",
        draft: withDraft("ready"),
      }),
    ).toEqual({ step: 3, tone: "current" });
    expect(personaProgress({ ...persona, status: "ready" })).toEqual({
      step: 4,
      tone: "current",
    });
  });

  test("초안이 처리 중이거나 실패했으면 색인 단계에 머물고 실패를 숨기지 않는다", () => {
    const reviewing = { ...persona, status: "review_required" as const };
    expect(
      personaProgress({ ...reviewing, draft: withDraft("processing") }),
    ).toEqual({ step: 2, tone: "processing" });
    expect(
      personaProgress({ ...reviewing, draft: withDraft("failed") }),
    ).toEqual({ step: 2, tone: "failed" });
  });

  test("적용본이 있으면 새 초안이 처리 중이어도 대화 단계다", () => {
    // 서버도 적용본이 있으면 초안 처리 여부와 무관하게 ready로 계산한다.
    expect(
      personaProgress({
        ...persona,
        status: "ready",
        draft: withDraft("processing"),
      }),
    ).toEqual({ step: 4, tone: "current" });
  });

  test("삭제 중인 캐릭터에는 진행 단계를 그리지 않는다", () => {
    expect(personaProgress({ ...persona, status: "deleting" })).toBeNull();
  });
});

describe("draftStatusOf", () => {
  test("draft가 없거나 계약 밖의 모양이면 null로 본다", () => {
    expect(draftStatusOf({ ...persona, draft: null })).toBeNull();
    expect(draftStatusOf({ ...persona, draft: "processing" })).toBeNull();
    expect(
      draftStatusOf({ ...persona, draft: withDraft("toString") }),
    ).toBeNull();
    expect(draftStatusOf({ ...persona, draft: withDraft(3) })).toBeNull();
  });

  test("계약의 네 상태만 그대로 꺼낸다", () => {
    expect(draftStatusOf({ ...persona, draft: withDraft("failed") })).toBe(
      "failed",
    );
  });
});
