/**
 * blocking이면 상한 초과 시 실제로 저장을 막는다는 뜻으로 강조 표시한다.
 * 아닌 경우(안내용)에는 상한을 넘어도 저장을 막지 않는다 — 서버가 아직 이 상한을
 * 강제하지 않기 때문이다(§4-6은 계획 값, profile만 실제로 422를 낸다).
 */
export function CharCounter({
  length,
  max,
  blocking = false,
  overText,
}: {
  length: number;
  max: number;
  blocking?: boolean;
  /** 상한 초과 문구를 바꿀 때 쓴다(예: 채팅은 "저장"이 아니라 "전송"을 막는다). */
  overText?: string;
}) {
  const over = length > max;
  return (
    <p className={over ? "counter counter--over" : "counter"}>
      {length.toLocaleString("ko-KR")}/{max.toLocaleString("ko-KR")}자
      {over &&
        (overText ??
          (blocking ? " — 상한 초과, 저장 불가" : " — 안내 상한 초과"))}
    </p>
  );
}
