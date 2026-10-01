/**
 * 캐릭터별 이니셜과 색을 이름에서 결정적으로 만든다.
 *
 * 서버는 아직 이미지·색 정보를 주지 않는다. 그렇다고 무작위 색을 쓰면 다시 방문할
 * 때마다 같은 캐릭터가 다른 색으로 보이고 테스트도 고정할 수 없다. 그래서 이름만
 * 입력으로 삼아 항상 같은 결과가 나오게 한다.
 *
 * id가 아니라 이름을 쓰는 이유: 생성 미리보기 시점에는 아직 서버가 발급한 id가 없다.
 * id 기준이면 미리보기 색과 생성 직후 카드 색이 달라져 다른 캐릭터처럼 보인다.
 * (W-0 디자인 전환 지시문은 "id 해시"라고 적었지만 같은 문장에서 이 결정 방식을
 * 유지하라고 했으므로 이름 기준을 그대로 둔다.)
 */

/** styles/tokens.css에 정의한 아바타 색(--avatar-0..5)의 개수와 맞춰야 한다. */
export const ACCENT_COUNT = 6;

export function personaAccent(name: string): number {
  // FNV-1a 32bit. 암호용이 아니라 짧은 이름을 팔레트에 고르게 흩뿌리기 위한 해시다.
  let hash = 2166136261;
  for (const character of name.trim()) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  // 부호 없는 32bit로 되돌린 뒤 팔레트 크기로 나눈다.
  return (hash >>> 0) % ACCENT_COUNT;
}

/**
 * 아바타에 표시할 첫 글자를 고른다.
 *
 * 코드포인트 단위로 자른다. `name[0]`은 이모지나 결합 문자를 반 글자로 쪼개
 * 깨진 문자를 보여줄 수 있다.
 */
export function personaInitial(name: string): string {
  return Array.from(name.trim())[0] ?? "?";
}
