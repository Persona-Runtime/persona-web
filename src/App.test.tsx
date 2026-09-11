import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import App from "./App";
import { ApiError, type Persona, type PersonaApi } from "./lib/types";

const persona: Persona = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "합성 모루",
  status: "needs_material",
  active_version_id: null,
  draft: null,
  deletion_id: null,
  created_at: "2026-09-10T00:00:00Z",
};

function api(overrides: Partial<PersonaApi> = {}): PersonaApi {
  return {
    getMe: vi.fn().mockResolvedValue({
      id: "synthetic-owner",
      display_name: "합성 사용자",
    }),
    listPersonas: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    createPersona: vi.fn().mockResolvedValue(persona),
    ...overrides,
  };
}

async function authenticate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("토큰"), "synthetic-token");
  await user.click(screen.getByRole("button", { name: "접속" }));
  await screen.findByRole("heading", { name: "내 캐릭터" });
}

test("잘못된 토큰은 입력 화면에서 구분해 안내한다", async () => {
  const user = userEvent.setup();
  render(
    <App
      api={api({
        getMe: vi.fn().mockRejectedValue(new ApiError(401, "unauthorized")),
      })}
    />,
  );

  await user.type(screen.getByLabelText("토큰"), "wrong-token");
  await user.click(screen.getByRole("button", { name: "접속" }));

  expect(await screen.findByText("토큰을 확인해주세요.")).toBeInTheDocument();
});

test("빈 목록에서 생성 후 목록을 갱신한다", async () => {
  const user = userEvent.setup();
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [], next_cursor: null })
    .mockResolvedValueOnce({ items: [persona], next_cursor: null });
  const createPersona = vi.fn().mockResolvedValue(persona);
  render(<App api={api({ listPersonas, createPersona })} />);

  await authenticate(user);
  expect(
    await screen.findByText("아직 만든 캐릭터가 없습니다."),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), " 합성 모루 ");
  await user.click(screen.getByRole("button", { name: "생성" }));

  expect(
    await screen.findByText("“합성 모루” 캐릭터를 만들었습니다."),
  ).toBeInTheDocument();
  expect(createPersona).toHaveBeenCalledWith(
    "synthetic-token",
    "합성 모루",
    expect.any(String),
    expect.anything(),
  );
  await waitFor(() => expect(listPersonas).toHaveBeenCalledTimes(2));
});

test("삭제 중을 포함한 세 개면 생성 버튼을 막는다", async () => {
  const user = userEvent.setup();
  render(
    <App
      api={api({
        listPersonas: vi.fn().mockResolvedValue({
          items: [
            persona,
            { ...persona, id: "2", name: "둘", status: "deleting" },
            { ...persona, id: "3", name: "셋" },
          ],
          next_cursor: null,
        }),
      })}
    />,
  );

  await authenticate(user);
  expect(await screen.findByText("삭제 중")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "캐릭터 생성" })).toBeDisabled();
  expect(
    screen.getByText("캐릭터는 최대 3개까지 만들 수 있습니다."),
  ).toBeInTheDocument();
});

test("목록 조회 실패는 빈 목록과 구분하고 재조회를 제공한다", async () => {
  const user = userEvent.setup();
  render(
    <App
      api={api({
        listPersonas: vi
          .fn()
          .mockRejectedValueOnce(new ApiError(503, "dependency_unavailable"))
          .mockResolvedValueOnce({ items: [], next_cursor: null }),
      })}
    />,
  );

  await authenticate(user);
  expect(
    await screen.findByText(
      "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "다시 조회" }));
  expect(
    await screen.findByText("아직 만든 캐릭터가 없습니다."),
  ).toBeInTheDocument();
});

test("공백과 중복 이름을 각각 안내한다", async () => {
  const user = userEvent.setup();
  const createPersona = vi
    .fn()
    .mockRejectedValueOnce(new ApiError(409, "duplicate_persona_name"));
  render(<App api={api({ createPersona })} />);

  await authenticate(user);
  await user.click(screen.getByRole("button", { name: "캐릭터 생성" }));
  await user.click(screen.getByRole("button", { name: "생성" }));
  expect(
    await screen.findByText("캐릭터 이름을 입력해주세요."),
  ).toBeInTheDocument();

  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  expect(
    await screen.findByText(
      "같은 이름의 캐릭터가 있습니다. 다른 이름을 입력해주세요.",
    ),
  ).toBeInTheDocument();
});

test("응답 유실 뒤 같은 생성 요청은 같은 멱등성 키로 재전송한다", async () => {
  const user = userEvent.setup();
  const createPersona = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("network"))
    .mockResolvedValueOnce(persona);
  render(<App api={api({ createPersona })} />);

  await authenticate(user);
  await user.click(screen.getByRole("button", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  await screen.findByRole("button", { name: "같은 요청 다시 전송" });
  await user.click(screen.getByRole("button", { name: "같은 요청 다시 전송" }));

  await waitFor(() => expect(createPersona).toHaveBeenCalledTimes(2));
  expect(createPersona.mock.calls[0][2]).toBe(createPersona.mock.calls[1][2]);
});

test("로그아웃 뒤 늦은 목록 응답은 이전 화면을 복구하지 않는다", async () => {
  const user = userEvent.setup();
  let resolveList:
    | ((value: { items: Persona[]; next_cursor: null }) => void)
    | undefined;
  const listPersonas = vi.fn().mockImplementation(
    () =>
      new Promise<{ items: Persona[]; next_cursor: null }>((resolve) => {
        resolveList = resolve;
      }),
  );
  render(<App api={api({ listPersonas })} />);

  await authenticate(user);
  await user.click(screen.getByRole("button", { name: "로그아웃" }));
  resolveList?.({ items: [persona], next_cursor: null });

  expect(
    await screen.findByRole("heading", { name: "접속 토큰 입력" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("토큰")).toHaveValue("");
  await waitFor(() =>
    expect(screen.queryByText("합성 모루")).not.toBeInTheDocument(),
  );
});

test("새 목록 요청 뒤에 도착한 이전 목록 응답은 무시한다", async () => {
  const user = userEvent.setup();
  let resolveInitialList:
    | ((value: { items: Persona[]; next_cursor: null }) => void)
    | undefined;
  const listPersonas = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<{ items: Persona[]; next_cursor: null }>((resolve) => {
          resolveInitialList = resolve;
        }),
    )
    .mockResolvedValueOnce({ items: [persona], next_cursor: null });
  render(<App api={api({ listPersonas })} />);

  await authenticate(user);
  await user.click(screen.getByRole("button", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  await screen.findByText("“합성 모루” 캐릭터를 만들었습니다.");
  await user.click(screen.getByRole("button", { name: "← 목록으로" }));
  expect(await screen.findByText("합성 모루")).toBeInTheDocument();

  resolveInitialList?.({ items: [], next_cursor: null });
  await waitFor(() =>
    expect(screen.getByText("합성 모루")).toBeInTheDocument(),
  );
});

test("새 목록 성공 뒤에 도착한 이전 목록 실패는 화면을 바꾸지 않는다", async () => {
  const user = userEvent.setup();
  let rejectInitialList: ((reason?: unknown) => void) | undefined;
  const listPersonas = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<{ items: Persona[]; next_cursor: null }>((_, reject) => {
          rejectInitialList = reject;
        }),
    )
    .mockResolvedValueOnce({ items: [persona], next_cursor: null });
  render(<App api={api({ listPersonas })} />);

  await authenticate(user);
  await user.click(screen.getByRole("button", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  await screen.findByText("“합성 모루” 캐릭터를 만들었습니다.");
  await user.click(screen.getByRole("button", { name: "← 목록으로" }));
  expect(await screen.findByText("합성 모루")).toBeInTheDocument();

  rejectInitialList?.(new ApiError(503, "dependency_unavailable"));
  await waitFor(() =>
    expect(screen.getByText("합성 모루")).toBeInTheDocument(),
  );
  expect(
    screen.queryByText(
      "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
    ),
  ).not.toBeInTheDocument();
});

test("인증 뒤 401은 토큰 입력값을 포함한 세션을 초기화한다", async () => {
  const user = userEvent.setup();
  const getMe = vi.fn().mockResolvedValue({
    id: "synthetic-owner",
    display_name: "합성 사용자",
  });
  const listPersonas = vi
    .fn()
    .mockRejectedValue(new ApiError(401, "unauthorized"));
  render(
    <App
      api={api({
        getMe,
        listPersonas,
      })}
    />,
  );

  await user.type(screen.getByLabelText("토큰"), "synthetic-token");
  await user.click(screen.getByRole("button", { name: "접속" }));
  expect(
    await screen.findByRole("heading", { name: "접속 토큰 입력" }),
  ).toBeInTheDocument();
  expect(getMe).toHaveBeenCalledTimes(1);
  expect(listPersonas).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("토큰")).toHaveValue("");
  expect(screen.queryByText("합성 사용자")).not.toBeInTheDocument();
});
