import { personaAccent, personaInitial } from "../lib/avatar";

/**
 * 캐릭터 아바타.
 *
 * 이름에서 만든 이니셜과 색으로 그린다. 서버가 이미지를 주지 않으므로 여기서
 * 만들어 낼 것도 없다(2026-09-16 사진 업로드 철회, tradeoff/14).
 *
 * 이름은 바로 옆 텍스트가 읽어주므로 이 요소는 보조기술에서 숨긴다.
 */
export function PersonaAvatar({ name }: { name: string }) {
  return (
    <span
      className="avatar"
      data-accent={personaAccent(name)}
      aria-hidden="true"
    >
      {personaInitial(name)}
    </span>
  );
}
