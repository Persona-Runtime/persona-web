import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError, type Persona } from "../lib/types";
import {
  authenticate,
  pathname,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

function threePersonas(): Persona[] {
  return [
    persona,
    { ...persona, id: "2", name: "둘", status: "deleting" },
    { ...persona, id: "3", name: "셋" },
  ];
}

test("삭제 중을 포함한 세 개면 생성 버튼을 막는다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: threePersonas(), next_cursor: null }),
    }),
  });

  await authenticate(user);

  expect(await screen.findByText("삭제 중")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "캐릭터 생성" })).toBeDisabled();
  expect(
    screen.getByText("캐릭터는 최대 3개까지 만들 수 있습니다."),
  ).toBeInTheDocument();
  expect(screen.getByText("보유 3/3")).toBeInTheDocument();
});

test("보유 수는 목록 응답을 근거로 표시한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
    }),
  });

  await authenticate(user);

  expect(await screen.findByText("보유 1/3")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "캐릭터 생성" })).toBeInTheDocument();
});

test("목록이 잘려 있으면 개수를 단정하지 않고 생성도 막는다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: "opaque-cursor" }),
    }),
  });

  await authenticate(user);

  expect(
    await screen.findByText("보유 개수를 확인할 수 없습니다."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "캐릭터 생성" })).toBeDisabled();
  expect(
    screen.getByText(
      "목록이 완전하지 않아 생성 가능 여부를 확인할 수 없습니다.",
    ),
  ).toBeInTheDocument();
});

test("목록 조회 실패는 빈 목록과 구분하고 재조회를 제공한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(503, "dependency_unavailable"))
        .mockResolvedValueOnce({ items: [], next_cursor: null }),
    }),
  });

  await authenticate(user);

  expect(
    await screen.findByText(
      "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("아직 만든 캐릭터가 없습니다.")).toBeNull();

  await user.click(screen.getByRole("button", { name: "다시 조회" }));

  expect(
    await screen.findByText("아직 만든 캐릭터가 없습니다."),
  ).toBeInTheDocument();
});

test("불러오는 중·빈 목록·오류는 서로 다른 화면으로 나타난다", async () => {
  let resolveList:
    | ((value: { items: Persona[]; next_cursor: null }) => void)
    | undefined;
  const listPersonas = vi.fn().mockImplementation(
    () =>
      new Promise<{ items: Persona[]; next_cursor: null }>((resolve) => {
        resolveList = resolve;
      }),
  );
  const { user } = renderApp({ api: personaApi({ listPersonas }) });

  await authenticate(user);

  // 인증 헬퍼는 제목이 뜰 때까지만 기다린다. 목록 로딩 상태는 그 뒤 effect에서
  // 반영되므로 동기 getByText는 아직 idle인 순간을 읽을 수 있다.
  expect(
    await screen.findByText("목록을 불러오는 중입니다…"),
  ).toBeInTheDocument();
  expect(screen.queryByText("아직 만든 캐릭터가 없습니다.")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();

  resolveList?.({ items: [], next_cursor: null });

  expect(
    await screen.findByText("아직 만든 캐릭터가 없습니다."),
  ).toBeInTheDocument();
  expect(screen.queryByText("목록을 불러오는 중입니다…")).toBeNull();
});

test("목록에서 캐릭터를 고르면 주소가 바뀌고 작업 영역 제목으로 포커스가 옮겨간다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
    }),
  });

  await authenticate(user);
  const link = await personaNav().findByRole("link", { name: /합성 모루/ });
  await user.click(link);

  await waitFor(() => expect(pathname()).toBe(`/personas/${persona.id}`));
  const heading = screen.getByRole("heading", { name: "합성 모루" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(link).toHaveAttribute("aria-current", "page");
});

test("목록으로 돌아가면 직전에 보던 항목으로 포커스가 복귀한다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
    }),
  });

  await authenticate(user);
  const link = await personaNav().findByRole("link", { name: /합성 모루/ });
  await user.click(link);
  await waitFor(() => expect(pathname()).toBe(`/personas/${persona.id}`));

  await user.click(screen.getByRole("link", { name: "← 목록으로" }));

  await waitFor(() => expect(pathname()).toBe("/personas"));
  await waitFor(() =>
    expect(personaNav().getByRole("link", { name: /합성 모루/ })).toHaveFocus(),
  );
});
