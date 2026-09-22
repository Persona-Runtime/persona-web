import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError } from "../lib/types";
import { personaApi, renderApp } from "../test/renderApp";

test("접속 화면은 지금 되는 기능과 준비 중인 기능을 함께 안내한다", () => {
  renderApp();

  expect(
    screen.getByRole("heading", { name: "접속 토큰 입력" }),
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

  await user.type(screen.getByLabelText("토큰"), "wrong-token");
  await user.click(screen.getByRole("button", { name: "접속" }));

  expect(await screen.findByText("토큰을 확인해주세요.")).toBeInTheDocument();
});

test("토큰을 비운 채 접속하면 서버로 보내지 않고 입력을 요청한다", async () => {
  const getMe = vi.fn();
  const { user } = renderApp({ api: personaApi({ getMe }) });

  await user.click(screen.getByRole("button", { name: "접속" }));

  expect(await screen.findByText("토큰을 입력해주세요.")).toBeInTheDocument();
  expect(getMe).not.toHaveBeenCalled();
});

test("네트워크 오류는 토큰 오류와 다른 문구로 안내한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      getMe: vi.fn().mockRejectedValue(new TypeError("network")),
    }),
  });

  await user.type(screen.getByLabelText("토큰"), "synthetic-token");
  await user.click(screen.getByRole("button", { name: "접속" }));

  expect(
    await screen.findByText(
      "네트워크 오류가 발생했습니다. 연결을 확인한 뒤 다시 시도해주세요.",
    ),
  ).toBeInTheDocument();
});
