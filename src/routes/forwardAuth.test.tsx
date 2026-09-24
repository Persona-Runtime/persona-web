import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError } from "../lib/types";
import {
  SYNTHETIC_USER,
  persona,
  personaApi,
  personaNav,
  renderApp,
  waitForTokenForm,
} from "../test/renderApp";

/**
 * 앱 시작 시 토큰 없이 보내는 GET /v1/me 한 번으로 인증 경로를 가른다.
 *
 * 빌드 타임 플래그로 가르지 않는 것이 요구사항이다 — 같은 이미지가 공개 경로
 * (oauth2-proxy가 신원 헤더를 붙여 Bearer 없이 200)와 내부 port-forward 경로
 * (그 헤더가 제거되어 401)에서 모두 돌아야 한다. 여기서는 그 판정의 세 갈래를
 * 고정한다: 200 / 401 / 그 외.
 */

const withPersona = (overrides = {}) =>
  personaApi({
    listPersonas: vi
      .fn()
      .mockResolvedValue({ items: [persona], next_cursor: null }),
    ...overrides,
  });

test("프로브가 200이면 토큰 입력창 없이 바로 목록으로 들어간다", async () => {
  const getMe = vi.fn().mockResolvedValue({
    id: "github:synthetic-login",
    display_name: "synthetic-login",
  });
  renderApp({ api: withPersona({ getMe }) });

  expect(
    await screen.findByRole("heading", { name: "내 캐릭터" }),
  ).toBeInTheDocument();
  expect(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  ).toBeInTheDocument();

  // 토큰 화면을 거치지 않는다.
  expect(screen.queryByLabelText("토큰")).toBeNull();
  expect(screen.queryByRole("heading", { name: "접속 토큰 입력" })).toBeNull();

  // 프로브는 토큰 없이(null) 정확히 한 번만 나간다.
  expect(getMe).toHaveBeenCalledTimes(1);
  expect(getMe).toHaveBeenCalledWith(null, expect.anything());
});

test("프로브가 200이면 이후 API 호출도 토큰 없이 나간다", async () => {
  // request()가 토큰 없음을 이유로 stale을 돌려주면 목록이 영원히 비어 보인다.
  const getMe = vi.fn().mockResolvedValue(SYNTHETIC_USER);
  const listPersonas = vi
    .fn()
    .mockResolvedValue({ items: [persona], next_cursor: null });
  renderApp({ api: personaApi({ getMe, listPersonas }) });

  await screen.findByRole("heading", { name: "내 캐릭터" });
  expect(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  ).toBeInTheDocument();
  expect(listPersonas).toHaveBeenCalledWith(null, expect.anything());
});

test("프로브가 200이면 서버가 판정한 subject를 헤더에 보여준다", async () => {
  const getMe = vi.fn().mockResolvedValue({
    id: "github:synthetic-login",
    display_name: "synthetic-login",
  });
  renderApp({ api: withPersona({ getMe }) });

  expect(await screen.findByText("github:synthetic-login")).toBeInTheDocument();
});

test("프로브가 401이면 지금처럼 토큰 입력창을 보여준다", async () => {
  const getMe = vi.fn().mockRejectedValue(new ApiError(401, "unauthorized"));
  renderApp({ api: withPersona({ getMe }) });

  expect(await waitForTokenForm()).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "접속 토큰 입력" }),
  ).toBeInTheDocument();
});

test("프로브가 503이면 재시도를 안내하고 토큰 입력창은 띄우지 않는다", async () => {
  // 서버가 잠시 이상한 것을 "토큰을 안 넣었다"로 오해시키면 안 된다 —
  // 사용자는 넣을 수 있는 값이 없는데 입력을 요구받게 된다.
  const getMe = vi
    .fn()
    .mockRejectedValue(new ApiError(503, "dependency_unavailable"));
  renderApp({ api: withPersona({ getMe }) });

  expect(
    await screen.findByText(
      "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("토큰")).toBeNull();
  expect(screen.queryByRole("heading", { name: "접속 토큰 입력" })).toBeNull();
});

test("프로브 실패 뒤 재시도가 성공하면 그때 판정이 바뀐다", async () => {
  const getMe = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(SYNTHETIC_USER);
  const { user } = renderApp({ api: withPersona({ getMe }) });

  await screen.findByText(
    "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요.",
  );
  await user.click(screen.getByRole("button", { name: "다시 조회" }));

  expect(
    await screen.findByRole("heading", { name: "내 캐릭터" }),
  ).toBeInTheDocument();
  expect(getMe).toHaveBeenCalledTimes(2);
});

test("ForwardAuth 경로에서 세션이 만료되면 토큰 입력창이 아니라 재로그인을 안내한다", async () => {
  // 공개 경로 사용자에게는 붙여넣을 Bearer 토큰이 없다. 앞단 쿠키가 만료된 것이므로
  // 새로고침해 다시 로그인하라고 안내해야 한다.
  const getMe = vi.fn().mockResolvedValue(SYNTHETIC_USER);
  // 목록은 성공하고, 그 뒤 초안 조회에서 앞단 쿠키가 만료된다.
  const getDraft = vi.fn().mockRejectedValue(new ApiError(401, "unauthorized"));
  const { user } = renderApp({ api: withPersona({ getMe, getDraft }) });

  await screen.findByRole("heading", { name: "내 캐릭터" });
  await user.click(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  );
  await user.click(await screen.findByRole("link", { name: "자료 편집" }));

  expect(
    await screen.findByText(
      "로그인이 만료됐습니다. 페이지를 새로고침해 다시 로그인해주세요.",
    ),
  ).toBeInTheDocument();
  // 토큰 입력창으로 떨어뜨리지 않는다 — 공개 경로 사용자는 넣을 토큰이 없다.
  expect(screen.queryByLabelText("토큰")).toBeNull();
});
