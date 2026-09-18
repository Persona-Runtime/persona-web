import { render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import App from "../App";
import { ApiError, type Persona, type PersonaApi } from "../lib/types";
import { LocationProbe } from "./LocationProbe";

/** 공개 테스트는 합성 데이터만 쓴다. 실제 사용자 자료·토큰을 넣지 않는다. */
export const SYNTHETIC_TOKEN = "synthetic-token";

export const persona: Persona = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "합성 모루",
  status: "needs_material",
  active_version_id: null,
  draft: null,
  deletion_id: null,
  created_at: "2026-09-10T00:00:00Z",
};

export function personaApi(overrides: Partial<PersonaApi> = {}): PersonaApi {
  return {
    getMe: vi.fn().mockResolvedValue({
      id: "synthetic-owner",
      display_name: "합성 사용자",
    }),
    listPersonas: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createPersona: vi.fn().mockResolvedValue(persona),
    createDraft: vi.fn(),
    getDraft: vi.fn().mockRejectedValue(new ApiError(404, "draft_not_found")),
    patchDraft: vi.fn(),
    discardDraft: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * 앱을 MemoryRouter 안에서 렌더한다.
 *
 * 라우터를 App 밖에 두었기 때문에 실제 주소창 없이도 딥링크 진입을 재현할 수 있다.
 */
export function renderApp({
  api = personaApi(),
  path = "/",
  strict = false,
}: { api?: PersonaApi; path?: string; strict?: boolean } = {}) {
  const user = userEvent.setup();
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <App api={api} />
      <LocationProbe />
    </MemoryRouter>
  );
  // StrictMode는 효과를 한 번 더 실행해 "한 번만 일어나야 하는 일"의 결함을 드러낸다.
  //
  // **이 추가 실행은 개발 모드 전용 진단이고 production 빌드의 동작이 아니다.**
  // 그래도 켜는 이유는 production에서 같은 일이 일어나서가 아니라, 효과가 여러 번
  // 돌아도 결과가 같은지를 미리 확인하기 위해서다. 실제로 효과는 의존성이 바뀌거나
  // 화면이 다시 마운트될 때 다시 돈다.
  //
  // 기본값을 끈 이유는 정직함 때문이다. 전역으로 켜면 호출 횟수를 세는 기존 테스트
  // 13건이 함께 실패한다. 그것은 이번 결함이 아니라 별도로 다룰 하네스 문제이므로,
  // 차이를 이 옵션으로 드러내 두고 필요한 검사부터 켜서 쓴다.
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { user };
}

export function pathname(): string {
  return screen.getByTestId("pathname").textContent ?? "";
}

/** 좌측 목록만 골라 본다. 캐릭터 이름은 목록과 개요에 동시에 나타난다. */
export function personaNav() {
  return within(screen.getByRole("navigation", { name: "내 캐릭터" }));
}

export async function authenticate(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.type(screen.getByLabelText("토큰"), SYNTHETIC_TOKEN);
  await user.click(screen.getByRole("button", { name: "접속" }));
  await screen.findByRole("heading", { name: "내 캐릭터" });
}
