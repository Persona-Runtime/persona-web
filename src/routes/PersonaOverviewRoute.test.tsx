import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError, type PersonaApi } from "../lib/types";
import {
  authenticate,
  pathname,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

/** 캐릭터 개요 화면을 연다. 삭제 버튼은 이 화면에 있다. */
async function openOverview(user: ReturnType<typeof renderApp>["user"]) {
  await authenticate(user);
  await user.click(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  );
  await screen.findByRole("heading", { name: "합성 모루" });
}

function withPersona(overrides: Partial<PersonaApi> = {}) {
  return personaApi({
    listPersonas: vi
      .fn()
      .mockResolvedValue({ items: [persona], next_cursor: null }),
    ...overrides,
  });
}

test("삭제 확인에서 취소하면 삭제 요청을 보내지 않는다", async () => {
  const deletePersona = vi.fn();
  const { user } = renderApp({ api: withPersona({ deletePersona }) });

  await openOverview(user);
  await user.click(screen.getByRole("button", { name: "캐릭터 삭제" }));

  // 확인 영역은 캐릭터 이름과 되돌릴 수 없다는 경고를 함께 보여준다.
  const dialog = screen.getByRole("alertdialog");
  expect(dialog).toHaveTextContent("“합성 모루” 캐릭터를 삭제할까요?");
  expect(dialog).toHaveTextContent(
    "캐릭터의 자료와 대화 기록이 영구 삭제됩니다. 되돌릴 수 없습니다.",
  );

  await user.click(screen.getByRole("button", { name: "취소" }));

  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(deletePersona).not.toHaveBeenCalled();
});

test("삭제에 성공하면 목록을 다시 조회하고 /personas로 이동한다", async () => {
  // 준비: 삭제 뒤 재조회하면 캐릭터가 빠진 목록을 돌려준다.
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [persona], next_cursor: null })
    .mockResolvedValue({ items: [], next_cursor: null });
  const deletePersona = vi.fn().mockResolvedValue(undefined);
  const { user } = renderApp({
    api: personaApi({ listPersonas, deletePersona }),
  });

  await openOverview(user);
  const listCallsBefore = listPersonas.mock.calls.length;
  await user.click(screen.getByRole("button", { name: "캐릭터 삭제" }));
  await user.click(screen.getByRole("button", { name: "삭제" }));

  await waitFor(() => expect(pathname()).toBe("/personas"));
  expect(deletePersona).toHaveBeenCalledTimes(1);
  expect(deletePersona).toHaveBeenCalledWith(
    expect.anything(),
    persona.id,
    expect.any(String),
    expect.anything(),
  );
  expect(listPersonas.mock.calls.length).toBeGreaterThan(listCallsBefore);
  await waitFor(() =>
    expect(personaNav().queryByRole("link", { name: /합성 모루/ })).toBeNull(),
  );
});

test("삭제 요청 중에는 삭제·취소를 다시 누를 수 없다", async () => {
  const deletePersona = vi.fn(() => new Promise<void>(() => {}));
  const { user } = renderApp({ api: withPersona({ deletePersona }) });

  await openOverview(user);
  await user.click(screen.getByRole("button", { name: "캐릭터 삭제" }));
  await user.click(screen.getByRole("button", { name: "삭제" }));

  const pending = screen.getByRole("button", { name: "삭제 중…" });
  expect(pending).toBeDisabled();
  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  await user.click(pending);
  expect(deletePersona).toHaveBeenCalledTimes(1);
});

test("진행 중 작업 때문에 409 persona_busy면 안내하고 캐릭터를 목록에 그대로 둔다", async () => {
  const deletePersona = vi
    .fn()
    .mockRejectedValue(new ApiError(409, "persona_busy"));
  const { user } = renderApp({ api: withPersona({ deletePersona }) });

  await openOverview(user);
  await user.click(screen.getByRole("button", { name: "캐릭터 삭제" }));
  await user.click(screen.getByRole("button", { name: "삭제" }));

  expect(
    await screen.findByText(
      "응답 생성 또는 자료 색인이 진행 중입니다. 끝난 뒤 다시 시도하세요.",
    ),
  ).toBeInTheDocument();
  // 실패를 성공처럼 보이지 않는다 — 이동하지 않고 목록에서도 빼지 않는다.
  expect(pathname()).toBe(`/personas/${persona.id}`);
  expect(
    personaNav().getByRole("link", { name: /합성 모루/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "삭제" })).toBeEnabled();
});
