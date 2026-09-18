import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError, type Persona } from "../lib/types";
import {
  SYNTHETIC_TOKEN,
  authenticate,
  pathname,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

type ListResult = { items: Persona[]; next_cursor: null };

test("로그아웃 뒤 늦게 도착한 목록 응답은 이전 화면을 복구하지 않는다", async () => {
  let resolveList: ((value: ListResult) => void) | undefined;
  const listPersonas = vi.fn().mockImplementation(
    () =>
      new Promise<ListResult>((resolve) => {
        resolveList = resolve;
      }),
  );
  const { user } = renderApp({ api: personaApi({ listPersonas }) });

  await authenticate(user);
  await user.click(screen.getByRole("button", { name: "로그아웃" }));
  resolveList?.({ items: [persona], next_cursor: null });

  expect(
    await screen.findByRole("heading", { name: "접속 토큰 입력" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("토큰")).toHaveValue("");
  expect(pathname()).toBe("/");
  await waitFor(() =>
    expect(screen.queryByText("합성 모루")).not.toBeInTheDocument(),
  );
});

test("새 목록 요청 뒤에 도착한 이전 목록 응답은 무시한다", async () => {
  let resolveInitialList: ((value: ListResult) => void) | undefined;
  const listPersonas = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<ListResult>((resolve) => {
          resolveInitialList = resolve;
        }),
    )
    .mockResolvedValueOnce({ items: [persona], next_cursor: null });
  const { user } = renderApp({ api: personaApi({ listPersonas }) });

  await authenticate(user);
  await user.click(screen.getByRole("link", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  expect(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  ).toBeInTheDocument();

  // 생성 전에 출발한 첫 조회가 이제서야 끝난다. 빈 목록으로 되돌아가면 안 된다.
  resolveInitialList?.({ items: [], next_cursor: null });
  await waitFor(() =>
    expect(
      personaNav().getByRole("link", { name: /합성 모루/ }),
    ).toBeInTheDocument(),
  );
});

test("새 목록 성공 뒤에 도착한 이전 목록 실패는 화면을 바꾸지 않는다", async () => {
  let rejectInitialList: ((reason?: unknown) => void) | undefined;
  const listPersonas = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<ListResult>((_, reject) => {
          rejectInitialList = reject;
        }),
    )
    .mockResolvedValueOnce({ items: [persona], next_cursor: null });
  const { user } = renderApp({ api: personaApi({ listPersonas }) });

  await authenticate(user);
  await user.click(screen.getByRole("link", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  expect(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  ).toBeInTheDocument();

  rejectInitialList?.(new ApiError(503, "dependency_unavailable"));
  await waitFor(() =>
    expect(
      personaNav().getByRole("link", { name: /합성 모루/ }),
    ).toBeInTheDocument(),
  );
  expect(
    screen.queryByText(
      "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
    ),
  ).not.toBeInTheDocument();
});

test("인증 뒤 401은 토큰 입력값을 포함한 세션을 초기화한다", async () => {
  const getMe = vi.fn().mockResolvedValue({
    id: "synthetic-owner",
    display_name: "합성 사용자",
  });
  const listPersonas = vi
    .fn()
    .mockRejectedValue(new ApiError(401, "unauthorized"));
  const { user } = renderApp({ api: personaApi({ getMe, listPersonas }) });

  await user.type(screen.getByLabelText("토큰"), SYNTHETIC_TOKEN);
  await user.click(screen.getByRole("button", { name: "접속" }));

  expect(
    await screen.findByRole("heading", { name: "접속 토큰 입력" }),
  ).toBeInTheDocument();
  expect(getMe).toHaveBeenCalledTimes(1);
  expect(listPersonas).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("토큰")).toHaveValue("");
  expect(pathname()).toBe("/");
  expect(screen.queryByText("합성 사용자")).not.toBeInTheDocument();
});
