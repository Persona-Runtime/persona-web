import { useLocation } from "react-router";

/**
 * 테스트 전용. 현재 주소를 화면에 드러내 라우팅 결과를 단언할 수 있게 한다.
 *
 * 컴포넌트만 내보내는 파일로 분리해 두면 lint의 fast-refresh 규칙에 걸리지 않는다.
 */
export function LocationProbe() {
  const location = useLocation();
  return <span data-testid="pathname">{location.pathname}</span>;
}
