import { PersonaAvatar } from "./PersonaAvatar";

/** 접속 화면 상단 장식용 합성 이름. 실제 캐릭터가 아니며 색 세 개를 보여주려는 용도다. */
const DECORATIVE_NAMES = ["가람", "누리", "다온"] as const;

/**
 * 접속 화면의 서비스 소개.
 *
 * 무엇을 하는 서비스인지 한 문장으로만 말한다. 지금 되는 기능 목록은 로그인 뒤 레일과
 * 각 화면의 상태 배지가 보여주므로 여기서 다시 길게 나열하지 않는다. 아직 만들지 않은
 * 기능을 메뉴나 버튼으로 미리 배치하지 않는 원칙은 그대로다.
 */
export function ServiceIntro() {
  return (
    <div className="intro">
      {/* 장식이다. 아바타 각각이 aria-hidden이라 읽히지 않는다. */}
      <div className="intro__avatars">
        {DECORATIVE_NAMES.map((name) => (
          <PersonaAvatar key={name} name={name} size={40} />
        ))}
      </div>
      <p className="intro__product">Persona Runtime</p>
      <h1 className="intro__title">
        내 자료로 만든 캐릭터와
        <br />
        대화하기
      </h1>
      <p className="intro__lead">
        텍스트 자료를 붙여넣으면, 그 자료만 참고해서 답하는 캐릭터가 만들어져요.
      </p>
    </div>
  );
}
