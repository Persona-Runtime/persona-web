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

async function openCreateScreen(user: ReturnType<typeof renderApp>["user"]) {
  await authenticate(user);
  await user.click(screen.getByRole("link", { name: "캐릭터 생성" }));
  await screen.findByLabelText("이름");
}

test("빈 목록에서 생성하면 결과 화면으로 넘어가고 목록을 다시 읽는다", async () => {
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [], next_cursor: null })
    .mockResolvedValueOnce({ items: [persona], next_cursor: null });
  const createPersona = vi.fn().mockResolvedValue(persona);
  const { user } = renderApp({
    api: personaApi({ listPersonas, createPersona }),
  });

  await authenticate(user);
  expect(
    await screen.findByText("아직 만든 캐릭터가 없습니다."),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), " 합성 모루 ");
  await user.click(screen.getByRole("button", { name: "생성" }));

  expect(
    await screen.findByText("“합성 모루” 캐릭터를 만들었습니다."),
  ).toBeInTheDocument();
  // 이름은 서버로 보내기 전에 다듬는다. 멱등성 키는 이 시도에서 만든 값이다.
  expect(createPersona).toHaveBeenCalledWith(
    SYNTHETIC_TOKEN,
    "합성 모루",
    expect.any(String),
    expect.anything(),
  );
  await waitFor(() => expect(listPersonas).toHaveBeenCalledTimes(2));
});

test("공백과 중복 이름을 각각 안내한다", async () => {
  const createPersona = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(409, "duplicate_persona_name"));
  const { user } = renderApp({ api: personaApi({ createPersona }) });

  await openCreateScreen(user);
  await user.click(screen.getByRole("button", { name: "생성" }));
  expect(
    await screen.findByText("캐릭터 이름을 입력해주세요."),
  ).toBeInTheDocument();
  // 서버로 보내지 않은 입력 오류이므로 재전송 버튼은 뜨지 않는다.
  expect(createPersona).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: "같은 요청 다시 전송" }),
  ).toBeNull();

  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  expect(
    await screen.findByText(
      "같은 이름의 캐릭터가 있습니다. 다른 이름을 입력해주세요.",
    ),
  ).toBeInTheDocument();
});

test("응답 유실 뒤 같은 생성 요청은 같은 멱등성 키로 재전송한다", async () => {
  const createPersona = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(persona);
  const { user } = renderApp({ api: personaApi({ createPersona }) });

  await openCreateScreen(user);
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  await screen.findByRole("button", { name: "같은 요청 다시 전송" });
  await user.click(screen.getByRole("button", { name: "같은 요청 다시 전송" }));

  await waitFor(() => expect(createPersona).toHaveBeenCalledTimes(2));
  expect(createPersona.mock.calls[0][2]).toBe(createPersona.mock.calls[1][2]);
});

test("이름을 바꾸면 다른 시도이므로 새 멱등성 키를 쓴다", async () => {
  const createPersona = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(409, "duplicate_persona_name"))
    .mockResolvedValueOnce(persona);
  const { user } = renderApp({ api: personaApi({ createPersona }) });

  await openCreateScreen(user);
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  await screen.findByText(
    "같은 이름의 캐릭터가 있습니다. 다른 이름을 입력해주세요.",
  );

  await user.type(screen.getByLabelText("이름"), " 둘");
  await user.click(screen.getByRole("button", { name: "생성" }));

  await waitFor(() => expect(createPersona).toHaveBeenCalledTimes(2));
  expect(createPersona.mock.calls[0][2]).not.toBe(
    createPersona.mock.calls[1][2],
  );
});

test("미리보기 카드는 실제로 보낼 이름과 같은 색을 쓴다", async () => {
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [], next_cursor: null })
    .mockResolvedValueOnce({ items: [persona], next_cursor: null });
  const { user } = renderApp({ api: personaApi({ listPersonas }) });

  await openCreateScreen(user);
  expect(
    screen.getByText("이름을 입력하면 카드 미리보기가 나타납니다."),
  ).toBeInTheDocument();

  await user.type(screen.getByLabelText("이름"), "합성 모루");
  const previewAccent =
    document.querySelector<HTMLElement>(".preview .avatar")?.dataset.accent;
  expect(previewAccent).toBeDefined();

  await user.click(screen.getByRole("button", { name: "생성" }));
  const listLink = await personaNav().findByRole("link", { name: /합성 모루/ });
  expect(listLink.querySelector<HTMLElement>(".avatar")?.dataset.accent).toBe(
    previewAccent,
  );
});

test("생성은 성공하고 목록 갱신만 실패하면 둘을 구분해 알린다", async () => {
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [], next_cursor: null })
    .mockRejectedValueOnce(new ApiError(503, "dependency_unavailable"));
  const { user } = renderApp({ api: personaApi({ listPersonas }) });

  await openCreateScreen(user);
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));

  expect(
    await screen.findByText("“합성 모루” 캐릭터를 만들었습니다."),
  ).toBeInTheDocument();
  expect(
    await screen.findByText(
      "캐릭터는 생성됐지만 목록을 갱신하지 못했습니다. 목록에서 다시 조회해 주세요.",
    ),
  ).toBeInTheDocument();
  // 보유 개수의 근거는 목록 응답뿐이다. 갱신에 실패했으면 숫자를 지어내지 않는다.
  expect(screen.queryByText("보유 1/3")).toBeNull();
});

test("한도 초과 응답을 받으면 목록을 다시 읽어 실제 상태를 확인한다", async () => {
  const full: Persona[] = [
    persona,
    { ...persona, id: "2", name: "둘" },
    { ...persona, id: "3", name: "셋" },
  ];
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [], next_cursor: null })
    .mockResolvedValueOnce({ items: full, next_cursor: null });
  const createPersona = vi
    .fn()
    .mockRejectedValue(new ApiError(409, "persona_limit_exceeded"));
  const { user } = renderApp({
    api: personaApi({ listPersonas, createPersona }),
  });

  await openCreateScreen(user);
  await user.type(screen.getByLabelText("이름"), "넷");
  await user.click(screen.getByRole("button", { name: "생성" }));

  expect(
    await screen.findByText(
      "캐릭터는 최대 3개까지 만들 수 있습니다. 목록을 다시 확인해주세요.",
    ),
  ).toBeInTheDocument();
  await waitFor(() => expect(listPersonas).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("보유 3/3")).toBeInTheDocument();
});

test("이전 생성 결과가 남아 있어도 다음 제출의 응답을 기다린다", async () => {
  const second: Persona = { ...persona, id: "2", name: "둘" };
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [], next_cursor: null })
    .mockResolvedValue({ items: [persona], next_cursor: null });
  const createPersona = vi
    .fn()
    .mockResolvedValueOnce(persona)
    .mockRejectedValueOnce(new ApiError(409, "duplicate_persona_name"));
  const { user } = renderApp({
    api: personaApi({ listPersonas, createPersona }),
  });

  // 첫 번째 생성은 정상적으로 결과 화면까지 간다.
  await openCreateScreen(user);
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  await waitFor(() => expect(pathname()).toBe(`/personas/${persona.id}`));

  // 생성 화면으로 다시 들어와 다른 이름을 제출하면, 그 제출이 실패했으므로
  // 첫 캐릭터로 넘어가지 않고 생성 화면에 남아 실패 이유를 보여줘야 한다.
  await user.click(screen.getByRole("link", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), second.name);
  await user.click(screen.getByRole("button", { name: "생성" }));

  expect(
    await screen.findByText(
      "같은 이름의 캐릭터가 있습니다. 다른 이름을 입력해주세요.",
    ),
  ).toBeInTheDocument();
  expect(pathname()).toBe("/personas/new");
  expect(
    screen.getByRole("heading", { name: "캐릭터 생성" }),
  ).toBeInTheDocument();
});

test("생성 화면을 떠났다 돌아와 재전송해도 성공하면 결과 화면으로 간다", async () => {
  const createPersona = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(persona);
  const { user } = renderApp({ api: personaApi({ createPersona }) });

  await openCreateScreen(user);
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  await screen.findByRole("button", { name: "같은 요청 다시 전송" });

  // 목록으로 나갔다가 다시 들어와도 같은 시도의 재전송 수단이 남아 있어야 한다.
  await user.click(screen.getByRole("link", { name: "← 목록으로" }));
  await waitFor(() => expect(pathname()).toBe("/personas"));
  await user.click(screen.getByRole("link", { name: "캐릭터 생성" }));
  await user.click(
    await screen.findByRole("button", { name: "같은 요청 다시 전송" }),
  );

  await waitFor(() => expect(pathname()).toBe(`/personas/${persona.id}`));
  expect(
    await screen.findByText("“합성 모루” 캐릭터를 만들었습니다."),
  ).toBeInTheDocument();
  // 응답이 유실됐을 수 있으므로 재전송은 반드시 같은 키를 써야 한다.
  expect(createPersona.mock.calls[0][2]).toBe(createPersona.mock.calls[1][2]);
});
