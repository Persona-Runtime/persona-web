import { personaAccent, personaInitial } from "../lib/avatar";

/** 화면별로 쓰는 아바타 크기(px). 임의 숫자를 받지 않고 디자인에서 정한 단계만 허용한다. */
export type AvatarSize = 32 | 40 | 52 | 72;

/**
 * 캐릭터 아바타.
 *
 * 이름에서 만든 이니셜과 색으로 그린다. 서버가 이미지를 주지 않으므로 여기서
 * 만들어 낼 것도 없다(2026-09-16 사진 업로드 철회, tradeoff/14).
 *
 * 이름은 바로 옆 텍스트가 읽어주므로 이 요소는 보조기술에서 숨긴다.
 */
export function PersonaAvatar({
  name,
  size = 40,
}: {
  name: string;
  size?: AvatarSize;
}) {
  return (
    <span
      className="avatar"
      data-accent={personaAccent(name)}
      data-size={size}
      aria-hidden="true"
    >
      {personaInitial(name)}
    </span>
  );
}
