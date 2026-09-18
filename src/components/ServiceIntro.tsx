/**
 * 접속 화면의 서비스 소개.
 *
 * 지금 되는 것과 아직 아닌 것을 문장으로 나눠 적는다. 아직 만들지 않은 기능을
 * 메뉴나 버튼으로 미리 배치하면 눌러본 뒤에야 없다는 걸 알게 된다.
 */
export function ServiceIntro() {
  return (
    <div className="intro">
      <p className="eyebrow">Persona Runtime</p>
      <h1>내 자료로 만든 캐릭터와 대화하는 서비스</h1>
      <p className="intro__lead">
        텍스트 자료로 캐릭터를 만들고, 그 자료를 참고하는 캐릭터와 한국어로
        대화하는 것이 목표입니다.
      </p>
      <dl className="intro__status">
        <dt>지금 할 수 있는 일</dt>
        <dd>캐릭터 만들기, 내 캐릭터 목록과 준비 상태 확인</dd>
        <dt>아직 준비 중</dt>
        <dd>자료 업로드와 처리, 설정 편집, 캐릭터 삭제, 대화</dd>
      </dl>
    </div>
  );
}
