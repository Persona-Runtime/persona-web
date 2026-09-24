import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError } from "../lib/types";
import {
  SYNTHETIC_TOKEN,
  authenticate,
  pathname,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

const withPersona = () =>
  personaApi({
    listPersonas: vi
      .fn()
      .mockResolvedValue({ items: [persona], next_cursor: null }),
  });

test("딥링크로 들어오면 인증을 먼저 요구하고, 인증 뒤 원래 캐릭터로 돌아간다", async () => {
  const { user } = renderApp({
    api: withPersona(),
    path: `/personas/${persona.id}`,
  });

  // 토큰은 메모리에만 있으므로 새 탭·새로고침은 항상 접속 화면에서 시작한다.
  // 폼은 부트스트랩 프로브가 401(=내부 Bearer 경로)로 끝난 뒤에 나타난다.
  expect(
    await screen.findByRole("heading", { name: "접속 토큰 입력" }),
  ).toBeInTheDocument();

  await authenticate(user);

  await waitFor(() => expect(pathname()).toBe(`/personas/${persona.id}`));
  expect(
    await screen.findByRole("heading", { name: "합성 모루" }),
  ).toBeInTheDocument();
});

test("로그아웃 뒤 다시 로그인하면 이전 세션이 보던 캐릭터로 돌아가지 않는다", async () => {
  const { user } = renderApp({
    api: withPersona(),
    path: `/personas/${persona.id}`,
  });

  await authenticate(user);
  await waitFor(() => expect(pathname()).toBe(`/personas/${persona.id}`));

  await user.click(screen.getByRole("button", { name: "로그아웃" }));
  await screen.findByRole("heading", { name: "접속 토큰 입력" });
  await user.type(screen.getByLabelText("토큰"), SYNTHETIC_TOKEN);
  await user.click(screen.getByRole("button", { name: "접속" }));

  await waitFor(() => expect(pathname()).toBe("/personas"));
});

test("목록에 없는 캐릭터 주소는 찾을 수 없다고 알린다", async () => {
  const { user } = renderApp({
    api: withPersona(),
    path: "/personas/00000000-0000-4000-8000-000000000404",
  });

  await authenticate(user);

  expect(
    await screen.findByText("이 캐릭터를 찾을 수 없습니다."),
  ).toBeInTheDocument();
  // 목록 자체는 정상이므로 좌측에는 가진 캐릭터가 그대로 보인다.
  expect(
    personaNav().getByRole("link", { name: /합성 모루/ }),
  ).toBeInTheDocument();
});

test("목록이 잘려 있으면 없는 캐릭터와 확인 불가를 구분한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: "opaque-cursor" }),
    }),
    path: "/personas/00000000-0000-4000-8000-000000000404",
  });

  await authenticate(user);

  expect(
    await screen.findByText(
      "목록이 완전하지 않아 이 캐릭터를 확인할 수 없습니다.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("이 캐릭터를 찾을 수 없습니다.")).toBeNull();
});

test("알 수 없는 주소는 목록으로 몰래 돌려보내지 않는다", () => {
  renderApp({ path: "/없는-주소" });

  expect(
    screen.getByRole("heading", { name: "주소를 찾을 수 없습니다" }),
  ).toBeInTheDocument();
  expect(pathname()).toBe("/없는-주소");
});

test("목록 조회에 실패하면 없는 캐릭터로 단정하지 않고 재조회를 제공한다", async () => {
  const listPersonas = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(503, "dependency_unavailable"))
    .mockResolvedValueOnce({ items: [persona], next_cursor: null });
  const { user } = renderApp({
    api: personaApi({ listPersonas }),
    path: `/personas/${persona.id}`,
  });

  await authenticate(user);

  // 조회에 실패했으므로 이 캐릭터가 있는지 아직 알 수 없다.
  expect(
    await screen.findByText(
      "목록을 읽지 못해 이 캐릭터가 있는지 아직 확인하지 못했습니다.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("이 캐릭터를 찾을 수 없습니다.")).toBeNull();

  // 좁은 화면에서는 목록 영역이 가려지므로 작업 영역에도 재조회 수단이 있어야 한다.
  await user.click(screen.getByRole("button", { name: "목록 다시 조회" }));

  expect(
    await screen.findByRole("heading", { name: "합성 모루" }),
  ).toBeInTheDocument();
});
