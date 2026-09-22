import { screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Draft } from "../lib/types";
import {
  authenticate,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

const baseDraft: Draft = {
  version_id: "10000000-0000-4000-8000-000000000001",
  revision: 1,
  status: "editing",
  job_id: null,
  requires_processing: true,
  persona_id: persona.id,
  base_version_id: null,
  settings: { name: persona.name, profile: "", speech_examples: "" },
  sources: [],
  warnings: [],
  can_activate: false,
  updated_at: "2026-09-10T00:00:00Z",
};

async function openChatScreen(user: ReturnType<typeof renderApp>["user"]) {
  await authenticate(user);
  await user.click(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  );
  await screen.findByRole("heading", { name: "합성 모루" });
  await user.click(screen.getByRole("link", { name: "대화" }));
  await screen.findByRole("heading", { name: /대화/ });
}

test("상태가 ready가 아니면 자료를 먼저 적용하라고 안내한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "editing" }),
    }),
  });

  await openChatScreen(user);

  expect(screen.getByText("자료를 먼저 적용하세요.")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "자료 편집으로 이동" }),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("메시지")).toBeNull();
});

test("상태가 ready면 입력창은 있지만 전송 시 GPU 연결 안내만 한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue({ ...baseDraft, status: "ready" }),
    }),
  });

  await openChatScreen(user);

  const input = screen.getByLabelText("메시지");
  await user.type(input, "안녕");
  await user.click(screen.getByRole("button", { name: "보내기" }));

  await screen.findByText("대화 기능은 GPU 연결 후 열립니다.");
  // API 호출 없이 안내만 한다 — 입력은 비워진다.
  expect(input).toHaveValue("");
});
