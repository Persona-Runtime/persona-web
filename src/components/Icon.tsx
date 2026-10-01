/**
 * 인라인 stroke SVG 아이콘.
 *
 * 이모지·아이콘 폰트를 쓰지 않는 이유: 이모지는 OS마다 모양과 색이 달라 같은 화면이
 * 기기마다 다르게 보이고, 아이콘 폰트는 외부 요청이나 번들 추가가 필요하다. 선 두께와
 * 색(currentColor)을 글자와 맞춰 두면 버튼 색을 바꿀 때 아이콘도 함께 따라온다.
 *
 * 아이콘은 늘 옆에 있는 텍스트(보이거나 visually-hidden)를 보조하므로 보조기술에서 숨긴다.
 * 아이콘만으로 이름을 전하지 않는다.
 */

const PATHS = {
  back: "M15 5l-7 7 7 7",
  plus: "M12 5v14M5 12h14",
  send: "M12 19V5M5 12l7-7 7 7",
  stop: "M7 7h10v10H7z",
  panel: "M4 5h16v14H4zM15 5v14",
  close: "M6 6l12 12M18 6L6 18",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  chevron: "M6 9l6 6 6-6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
}: {
  name: IconName;
  /** 한 변 길이(px). */
  size?: number;
}) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
