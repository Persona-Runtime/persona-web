/**
 * 화면 안내에 쓰는 초기 서비스 제한값.
 *
 * 실제 강제는 Gateway가 한다(같은 값이 서버의 create 트랜잭션 안에서 검사된다).
 * 여기 값은 사용자에게 미리 알려주기 위한 것이지 서버 검증의 대체가 아니다.
 */
export const MAX_PERSONAS_PER_USER = 3;

/**
 * §4-6(docs/handoff-corpus-split-2026-09-17.md)의 계획 상한.
 *
 * PROFILE_MAX만 서버가 실제로 강제한다(422 settings_too_large). 나머지 넷은 아직
 * 서버 미구현이라(확인함 — persona-gateway repository.py에 해당 상수가 없다)
 * 안내용 카운터로만 쓴다. 저장을 막지 않는다.
 */
export const PROFILE_MAX = 1500;
export const BODY_MAX = 200_000;
export const SPEECH_MAX = 100_000;
export const OPTIONAL_SOURCE_MAX = 200_000;
export const DRAFT_TOTAL_MAX = 500_000;

/**
 * Unicode 코드 포인트 기준 길이. 문자열 .length는 UTF-16 코드 유닛이라
 * 서로게이트 쌍(예: 일부 이모지)에서 어긋난다.
 */
export function codePointLength(text: string): number {
  return [...text].length;
}
