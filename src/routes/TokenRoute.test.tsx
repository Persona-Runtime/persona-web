import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError } from "../lib/types";
import {
  bearerGetMe,
  personaApi,
  renderApp,
  waitForTokenForm,
} from "../test/renderApp";

test("접속 화면은 지금 되는 기능과 준비 중인 기능을 함께 안내한다", async () => {
  renderApp();

  // 토큰 폼은 부트스트랩 프로브가 401을 받은 뒤에야 나타난다.
  expect(
    await screen.findByRole("heading", { name: "접속 토큰 입력" }),
  ).toBeInTheDocument();
  expect(screen.getByText("지금 할 수 있는 일")).toBeInTheDocument();
  expect(screen.getByText("아직 준비 중")).toBeInTheDocument();
  // 준비 중인 기능은 문장으로만 안내하고 눌러볼 수 있는 요소로 만들지 않는다.
  expect(
    screen.queryByRole("button", { name: /업로드|대화|채팅|삭제/ }),
  ).toBeNull();
});

test("잘못된 토큰은 입력 화면에서 구분해 안내한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      getMe: vi.fn().mockRejectedValue(new ApiError(401, "unauthorized")),
    }),
  });

  await user.type(await waitForTokenForm(), "wrong-token");
  await user.click(screen.getByRole("button", { name: "접속" }));

  expect(await screen.findByText("토큰을 확인해주세요.")).toBeInTheDocument();
});

test("토큰을 비운 채 접속하면 서버로 보내지 않고 입력을 요청한다", async () => {
  const getMe = bearerGetMe();
  const { user } = renderApp({ api: personaApi({ getMe }) });

  await waitForTokenForm();
  await user.click(screen.getByRole("button", { name: "접속" }));

  expect(await screen.findByText("토큰을 입력해주세요.")).toBeInTheDocument();
  // 부트스트랩 프로브 1회 외에는 보내지 않는다 — 빈 입력은 서버로 가지 않는다.
  expect(getMe).toHaveBeenCalledTimes(1);
  expect(getMe).toHaveBeenCalledWith(null, expect.anything());
});

test("토큰 입력 중 네트워크 오류는 토큰 오류와 다른 문구로 안내한다", async () => {
  // 프로브는 401(=내부 경로)로 끝내고, 실제 인증 시도에서만 네트워크 오류를 낸다.
  // 그래야 토큰 폼이 뜬 뒤의 안내 문구를 볼 수 있다.
  const getMe = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(401, "unauthorized"))
    .mockRejectedValueOnce(new TypeError("network"));
  const { user } = renderApp({ api: personaApi({ getMe }) });

  await user.type(await waitForTokenForm(), "synthetic-token");
  await user.click(screen.getByRole("button", { name: "접속" }));

  expect(
    await screen.findByText(
      "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요.",
    ),
  ).toBeInTheDocument();
});
