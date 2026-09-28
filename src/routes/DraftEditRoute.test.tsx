import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router";
import { expect, test, vi } from "vitest";
import App from "../App";
import {
  ApiError,
  type Draft,
  type DraftActivated,
  type PersonaApi,
} from "../lib/types";
import {
  authenticate,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

/**
 * 편집 중, 소스 없음. 대부분의 테스트가 여기서 시작한다.
 * 소개는 비워두지 않는다 — 기본 소개가 비면 저장 자체가 막히므로(Gateway 필수값),
 * 저장 흐름을 보는 테스트가 그 규칙에 걸리지 않게 합성 소개를 채워 둔다.
 */
const editingDraft: Draft = {
  version_id: "10000000-0000-4000-8000-000000000001",
  revision: 1,
  status: "editing",
  job_id: null,
  requires_processing: true,
  persona_id: persona.id,
  base_version_id: null,
  settings: { name: persona.name, profile: "합성 소개", speech_examples: "" },
  sources: [],
  warnings: [],
  // 실제 gateway 기본값과 맞춘다 — 색인 버튼은 이제 이 값과 무관하다(활성화
  // 판정값일 뿐이라서). 색인 버튼을 눌러야 하는 테스트는 sources를 채운 변형을
  // 따로 만든다.
  can_activate: false,
  updated_at: "2026-09-10T00:00:00Z",
  indexed_revision: null,
  indexed_at: null,
  error_code: null,
};

async function openDraftScreen(user: ReturnType<typeof renderApp>["user"]) {
  await authenticate(user);
  await user.click(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  );
  await screen.findByRole("heading", { name: "합성 모루" });
  await user.click(screen.getByRole("link", { name: "자료 편집" }));
  await screen.findByRole("heading", { name: /자료 편집/ });
}

test("본문·대사를 붙여넣고 저장하면 kind별 소스로 보낸다(합성 텍스트)", async () => {
  const patchDraft = vi.fn().mockResolvedValue({
    ...editingDraft,
    revision: 2,
    sources: [
      {
        id: "s1",
        kind: "events",
        filename: null,
        content: "합성 본문",
        byte_size: 10,
        sha256: "0".repeat(64),
      },
    ],
  });
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(editingDraft),
      patchDraft,
    }),
  });

  await openDraftScreen(user);
  await user.type(
    screen.getByLabelText(/본문/),
    "합성 본문 — 가상 캐릭터의 행적",
  );
  await user.type(screen.getByLabelText(/대사/), "합성화자: 안녕하세요");
  await user.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(patchDraft).toHaveBeenCalledTimes(1));
  const [, , patch] = patchDraft.mock.calls[0];
  expect(patch.expected_revision).toBe(1);
  expect(patch.upsert_sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "events" }),
      expect.objectContaining({ kind: "speech_examples" }),
    ]),
  );
  // 관계·능력은 비워 뒀으므로 upsert 대상이 아니다.
  expect(
    patch.upsert_sources.some(
      (s: { kind: string }) => s.kind === "relationships",
    ),
  ).toBe(false);
});

test("안내용 카운터는 상한을 넘어도 저장을 막지 않는다", async () => {
  const longBody = "가".repeat(10);
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(editingDraft),
      patchDraft: vi.fn().mockResolvedValue(editingDraft),
    }),
  });

  await openDraftScreen(user);
  await user.type(screen.getByLabelText(/본문/), longBody);

  // 본문은 200,000자 안내 카운터뿐이라 이만큼으로는 저장 버튼이 막히지 않는다.
  expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
});

test("profile 상한(1,500자)을 넘으면 실제로 저장을 막는다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(editingDraft),
    }),
  });

  await openDraftScreen(user);
  const profileInput = screen.getByLabelText(/기본 소개/);
  // 진짜로 1,500자를 넘게 입력하면 느리니, 값 자체를 붙여넣기로 채운다.
  await user.click(profileInput);
  await user.paste("가".repeat(1501));

  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
});

test("PATCH가 409 revision_conflict면 배너를 보여주고 입력을 지우지 않는다", async () => {
  const patchDraft = vi
    .fn()
    .mockRejectedValue(new ApiError(409, "revision_conflict"));
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(editingDraft),
      patchDraft,
    }),
  });

  await openDraftScreen(user);
  await user.type(screen.getByLabelText(/본문/), "합성 본문");
  await user.click(screen.getByRole("button", { name: "저장" }));

  await screen.findByText("다른 곳에서 수정됨 — 다시 불러오기");
  // 입력한 내용은 그대로 남아 있어야 한다.
  expect(screen.getByLabelText(/본문/)).toHaveValue("합성 본문");
});

test("색인 202 접수 뒤 폴링으로 ready를 확인한다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const processingDraft: Draft = { ...editingDraft, status: "processing" };
    const readyDraft: Draft = { ...editingDraft, status: "ready" };
    const getDraft = vi
      .fn()
      .mockResolvedValueOnce({
        ...editingDraft,
        sources: [
          {
            id: "s1",
            kind: "events",
            filename: null,
            content: "합성 본문",
            byte_size: 10,
            sha256: "0".repeat(64),
          },
        ],
      })
      .mockResolvedValueOnce(processingDraft)
      .mockResolvedValue(readyDraft);
    const applyDraft = vi.fn().mockResolvedValue({
      version_id: editingDraft.version_id,
      status: "processing",
    });

    const { user } = renderApp({
      api: personaApi({
        listPersonas: vi
          .fn()
          .mockResolvedValue({ items: [persona], next_cursor: null }),
        getDraft,
        applyDraft,
      }),
    });

    await openDraftScreen(user);
    await user.click(screen.getByRole("button", { name: "색인" }));

    // apply 202 뒤 reload가 한 번 더 불려 processing을 반영한다(이때부터 폴링이 켜진다).
    await screen.findByText("처리 중");
    expect(getDraft).toHaveBeenCalledTimes(2);

    // 3초 간격 폴링이 다음 조회에서 ready를 받는다.
    await vi.advanceTimersByTimeAsync(3000);
    await screen.findByText("색인됨");
    expect(getDraft).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

/** 소스가 하나 있는 draft — 색인 버튼을 눌러야 하는 테스트가 공유한다. */
const draftWithSource: Draft = {
  ...editingDraft,
  sources: [
    {
      id: "s1",
      kind: "events",
      filename: null,
      content: "합성 본문",
      byte_size: 10,
      sha256: "0".repeat(64),
    },
  ],
};

test("색인이 409 indexing_in_progress면 문구를 보여준다", async () => {
  const applyDraft = vi
    .fn()
    .mockRejectedValue(new ApiError(409, "indexing_in_progress"));
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(draftWithSource),
      applyDraft,
    }),
  });

  await openDraftScreen(user);
  await user.click(screen.getByRole("button", { name: "색인" }));

  await screen.findByText("이미 처리 중입니다. 완료된 뒤 다시 시도해주세요.");
});

test("색인이 422 no_content면 문구를 보여준다", async () => {
  // 로컬에서는 자료가 있어 버튼이 활성이지만, 서버는(예: 동시 수정으로) no_content로
  // 거절할 수 있다 — 로컬 사전 검사가 서버 판정을 대신하지 않는다는 걸 보여준다.
  const applyDraft = vi.fn().mockRejectedValue(new ApiError(422, "no_content"));
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(draftWithSource),
      applyDraft,
    }),
  });

  await openDraftScreen(user);
  await user.click(screen.getByRole("button", { name: "색인" }));

  await screen.findByText(
    "색인할 자료가 없습니다. 본문이나 대사를 먼저 입력해주세요.",
  );
});

test("can_activate가 false여도 자료가 있는 editing 초안에서 색인 버튼이 활성이고 apply 호출이 나간다", async () => {
  const applyDraft = vi.fn().mockResolvedValue({
    version_id: draftWithSource.version_id,
    status: "processing",
  });
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(draftWithSource),
      applyDraft,
    }),
  });

  await openDraftScreen(user);
  expect(screen.getByRole("button", { name: "색인" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "색인" }));

  await waitFor(() => expect(applyDraft).toHaveBeenCalledTimes(1));
});

test("can_activate가 true일 때만 활성화 가능 안내를 보여준다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi
        .fn()
        .mockResolvedValue({ ...draftWithSource, can_activate: true }),
    }),
  });

  await openDraftScreen(user);
  await screen.findByText("이 색인 결과는 적용본으로 활성화할 수 있습니다.");
});

test("can_activate가 false면 활성화 가능 안내를 보여주지 않는다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(draftWithSource),
    }),
  });

  await openDraftScreen(user);
  await screen.findByRole("button", { name: "색인" });
  expect(
    screen.queryByText("이 색인 결과는 적용본으로 활성화할 수 있습니다."),
  ).not.toBeInTheDocument();
});

test("failed 상태에서도 이전에 성공한 indexed_revision은 그대로 보인다", async () => {
  // 계약: status/error_code는 최신 적용 시도, indexed_revision/indexed_at은
  // 마지막 색인 성공 — rev4 적용이 실패해도 rev3 색인 결과는 그대로 살아 있다.
  const failedWithPriorIndex: Draft = {
    ...editingDraft,
    revision: 4,
    status: "failed",
    error_code: "no_content",
    indexed_revision: 3,
    indexed_at: "2026-09-20T00:00:00Z",
  };
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(failedWithPriorIndex),
    }),
  });

  await openDraftScreen(user);

  await screen.findByText(
    "색인할 자료가 없습니다. 본문이나 대사를 먼저 입력해주세요.",
  );
  expect(screen.getByText(/rev 3/)).toBeInTheDocument();
});

/**
 * 적용본은 있는데 초안 슬롯이 비어 있는 상태(409 draft_not_started).
 *
 * 활성화하면 서버가 초안 포인터를 비우므로 정상적인 사용 흐름에서 반드시 지나가는
 * 상태다. 실패가 아니라 다음 행동이 정해져 있으므로, 화면은 "다시 조회"가 아니라
 * 새 초안을 시작하게 안내해야 한다.
 */
const activatedPersona = {
  ...persona,
  status: "ready" as const,
  active_version_id: "90000000-0000-4000-8000-000000000001",
};

function activatedApi(overrides: Partial<PersonaApi> = {}) {
  return personaApi({
    listPersonas: vi
      .fn()
      .mockResolvedValue({ items: [activatedPersona], next_cursor: null }),
    getDraft: vi.fn().mockRejectedValue(new ApiError(409, "draft_not_started")),
    ...overrides,
  });
}

test("409 draft_not_started면 재조회가 아니라 새 초안 만들기를 안내한다", async () => {
  const { user } = renderApp({ api: activatedApi() });

  await openDraftScreen(user);

  expect(
    screen.getByRole("button", { name: "새 초안 만들기" }),
  ).toBeInTheDocument();
  // 되돌릴 수 없는 실패처럼 보이면 안 된다.
  expect(screen.queryByRole("button", { name: "다시 조회" })).toBeNull();
});

test("새 초안 만들기는 적용본에서 파생한다(base_version_id)", async () => {
  // 빈 초안으로 시작하면 이미 적용한 자료를 다시 붙여넣어야 한다. 서버가 적용본의
  // 설정·자료를 복사해 주는 파생 경로를 쓴다.
  const createDraft = vi.fn().mockResolvedValue(editingDraft);
  const { user } = renderApp({ api: activatedApi({ createDraft }) });

  await openDraftScreen(user);
  await user.click(screen.getByRole("button", { name: "새 초안 만들기" }));

  await screen.findByLabelText("기본 소개");
  expect(createDraft).toHaveBeenCalledTimes(1);
  expect(createDraft).toHaveBeenCalledWith(
    expect.anything(),
    activatedPersona.id,
    { base_version_id: activatedPersona.active_version_id },
    expect.any(String),
    expect.anything(),
  );
});

test("활성화 전 색인이 안 끝났으면 409 not_activatable 문구를 보여준다", async () => {
  const applyDraft = vi
    .fn()
    .mockRejectedValue(new ApiError(409, "not_activatable"));
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(draftWithSource),
      applyDraft,
    }),
  });

  await openDraftScreen(user);
  await user.click(screen.getByRole("button", { name: "색인" }));

  await screen.findByText(
    "아직 활성화할 수 없습니다. 지금 내용으로 색인을 먼저 끝내주세요.",
  );
});

test("409 schema_not_ready는 초안 시작 안내와 섞이지 않는다", async () => {
  // 코드마다 원인이 다르다 — schema_not_ready는 잠시 뒤 재시도할 일이고,
  // draft_not_started는 사용자가 새 초안을 시작해야 하는 일이다.
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [activatedPersona], next_cursor: null }),
      getDraft: vi
        .fn()
        .mockRejectedValue(new ApiError(409, "schema_not_ready")),
    }),
  });

  await openDraftScreen(user);

  await screen.findByText(
    "아직 이 기능을 쓸 수 없습니다. 잠시 후 다시 시도해주세요.",
  );
  expect(screen.queryByRole("button", { name: "새 초안 만들기" })).toBeNull();
});

/**
 * 초안이 아직 한 번도 만들어지지 않은 캐릭터(404 draft_not_found).
 *
 * Gateway는 settings 경로에서 비공백 이름·소개를 요구하므로, 화면은 빈 소개로 생성
 * API를 자동 호출하지 않고 사용자가 입력한 값으로만 초안을 만들어야 한다.
 */
function noDraftApi(overrides: Partial<PersonaApi> = {}) {
  return personaApi({
    listPersonas: vi
      .fn()
      .mockResolvedValue({ items: [persona], next_cursor: null }),
    getDraft: vi.fn().mockRejectedValue(new ApiError(404, "draft_not_found")),
    ...overrides,
  });
}

test("초안이 없으면 생성 API를 자동 호출하지 않고 이름·소개 입력 폼을 보여준다", async () => {
  const createDraft = vi.fn();
  const { user } = renderApp({ api: noDraftApi({ createDraft }) });

  await openDraftScreen(user);

  // 이름은 캐릭터 이름으로 미리 채우고, 소개는 사용자가 직접 입력해야 한다.
  expect(await screen.findByLabelText("이름")).toHaveValue(persona.name);
  expect(screen.getByLabelText("기본 소개")).toHaveValue("");
  expect(screen.getByRole("button", { name: "초안 만들기" })).toBeDisabled();
  // 일반 오류 화면이 아니다.
  expect(screen.queryByRole("button", { name: "다시 조회" })).toBeNull();
  expect(createDraft).not.toHaveBeenCalled();
});

test("공백뿐인 소개로는 초안을 만들 수 없다", async () => {
  const createDraft = vi.fn();
  const { user } = renderApp({ api: noDraftApi({ createDraft }) });

  await openDraftScreen(user);
  await user.type(await screen.findByLabelText("기본 소개"), "   ");

  expect(screen.getByRole("button", { name: "초안 만들기" })).toBeDisabled();
  expect(createDraft).not.toHaveBeenCalled();
});

test("초안 없음 → 입력 폼 → 소개 입력 → 생성 성공이면 편집 폼으로 넘어간다", async () => {
  const createdDraft: Draft = {
    ...editingDraft,
    settings: {
      name: persona.name,
      profile: "합성 소개 — 가상 캐릭터",
      speech_examples: "",
    },
  };
  const createDraft = vi.fn().mockResolvedValue(createdDraft);
  const { user } = renderApp({ api: noDraftApi({ createDraft }) });

  await openDraftScreen(user);
  await user.type(
    await screen.findByLabelText("기본 소개"),
    "합성 소개 — 가상 캐릭터",
  );
  await user.click(screen.getByRole("button", { name: "초안 만들기" }));

  // 생성 뒤에는 기존 편집 폼이 새 초안 값으로 채워진다.
  expect(await screen.findByLabelText(/본문/)).toBeInTheDocument();
  expect(screen.getByLabelText("기본 소개")).toHaveValue(
    "합성 소개 — 가상 캐릭터",
  );
  expect(createDraft).toHaveBeenCalledTimes(1);
  expect(createDraft).toHaveBeenCalledWith(
    expect.anything(),
    persona.id,
    {
      settings: {
        name: persona.name,
        profile: "합성 소개 — 가상 캐릭터",
        speech_examples: "",
      },
    },
    expect.any(String),
    expect.anything(),
  );
});

test("초안 생성이 422 invalid_settings면 이름·소개 확인을 안내하고 입력을 유지한다", async () => {
  const createDraft = vi
    .fn()
    .mockRejectedValue(new ApiError(422, "invalid_settings"));
  const { user } = renderApp({ api: noDraftApi({ createDraft }) });

  await openDraftScreen(user);
  await user.type(await screen.findByLabelText("기본 소개"), "합성 소개");
  await user.click(screen.getByRole("button", { name: "초안 만들기" }));

  await screen.findByText(
    "이름과 기본 소개를 확인해주세요. 둘 다 비워둘 수 없습니다.",
  );
  // 일반 실패 문구로 바뀌지 않고, 사용자가 고쳐 다시 저장할 수 있게 폼이 남는다.
  expect(
    screen.queryByText(
      "요청을 처리하지 못했습니다. 문제가 계속되면 요청 ID를 알려주세요.",
    ),
  ).toBeNull();
  expect(screen.getByLabelText("기본 소개")).toHaveValue("합성 소개");
  expect(screen.getByRole("button", { name: "초안 만들기" })).toBeEnabled();
});

/**
 * 채팅에 적용(POST draft/activate).
 *
 * 누를 수 있는지는 서버 판정값 can_activate만 따르고, 성공하면 목록을 다시 조회해
 * 캐릭터가 준비됨이 된 뒤에 채팅 이동 버튼을 보여준다.
 */
const activatableDraft: Draft = {
  ...draftWithSource,
  status: "ready",
  revision: 3,
  indexed_revision: 3,
  indexed_at: "2026-09-10T00:00:00Z",
  can_activate: true,
};

const readyPersona = {
  ...persona,
  status: "ready" as const,
  active_version_id: activatableDraft.version_id,
};

test("can_activate가 false면 채팅에 적용 버튼이 비활성이고 요청을 보내지 않는다", async () => {
  const activateDraft = vi.fn();
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(draftWithSource),
      activateDraft,
    }),
  });

  await openDraftScreen(user);

  expect(screen.getByRole("button", { name: "채팅에 적용" })).toBeDisabled();
  expect(activateDraft).not.toHaveBeenCalled();
});

test("채팅에 적용 성공이면 목록을 다시 조회해 준비됨과 채팅 이동 버튼을 보여준다", async () => {
  // 준비: 첫 목록은 활성화 전, 재조회 목록은 적용본이 생긴 뒤의 캐릭터다.
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [persona], next_cursor: null })
    .mockResolvedValue({ items: [readyPersona], next_cursor: null });
  // 응답을 붙잡아 두고 요청 중 중복 클릭이 막히는지 본다.
  let resolveActivate: (value: DraftActivated) => void = () => {};
  const activateDraft = vi.fn(
    () =>
      new Promise<DraftActivated>((resolve) => {
        resolveActivate = resolve;
      }),
  );
  const getDraft = vi.fn().mockResolvedValue(activatableDraft);
  const { user } = renderApp({
    api: personaApi({ listPersonas, getDraft, activateDraft }),
  });

  await openDraftScreen(user);
  const listCallsBefore = listPersonas.mock.calls.length;

  // 실행: 연속 클릭
  await user.click(screen.getByRole("button", { name: "채팅에 적용" }));
  const pendingButton = screen.getByRole("button", { name: "적용 중…" });
  expect(pendingButton).toBeDisabled();
  await user.click(pendingButton);
  expect(activateDraft).toHaveBeenCalledTimes(1);

  resolveActivate({
    persona_id: persona.id,
    version_id: activatableDraft.version_id,
    activated_at: "2026-09-10T00:01:00Z",
  });

  // 검증: 지금 초안 revision으로 요청했고, 목록을 다시 조회해 준비됨을 반영한다.
  expect(activateDraft).toHaveBeenCalledWith(
    expect.anything(),
    persona.id,
    activatableDraft.revision,
    expect.any(String),
    expect.anything(),
  );
  const chatLink = await screen.findByRole("link", { name: "채팅으로 이동" });
  expect(chatLink).toHaveAttribute("href", `/personas/${persona.id}/chat`);
  expect(screen.getByText(/캐릭터 상태: 준비됨/)).toBeInTheDocument();
  expect(listPersonas.mock.calls.length).toBeGreaterThan(listCallsBefore);
  // 서버가 초안 슬롯을 비웠으므로 초안을 다시 조회하지 않는다.
  expect(getDraft).toHaveBeenCalledTimes(1);
});

test("채팅에 적용이 실패하면 오류를 보여주고 채팅 이동 버튼을 보여주지 않는다", async () => {
  const activateDraft = vi
    .fn()
    .mockRejectedValue(new ApiError(409, "not_activatable"));
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(activatableDraft),
      activateDraft,
    }),
  });

  await openDraftScreen(user);
  await user.click(screen.getByRole("button", { name: "채팅에 적용" }));

  await screen.findByText(
    "아직 활성화할 수 없습니다. 지금 내용으로 색인을 먼저 끝내주세요.",
  );
  expect(screen.queryByRole("link", { name: "채팅으로 이동" })).toBeNull();
  // 다시 시도할 수 있도록 버튼이 돌아온다.
  expect(screen.getByRole("button", { name: "채팅에 적용" })).toBeEnabled();
});

// ---- 저장 → 색인 → 채팅에 적용 순서 가드 ----

test("변경이 없으면 저장 버튼이 비활성이다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(editingDraft),
    }),
  });

  await openDraftScreen(user);

  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
});

test("미저장 변경이 있으면 색인·채팅에 적용을 막고 먼저 저장하라고 안내한다", async () => {
  const applyDraft = vi.fn();
  const activateDraft = vi.fn();
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(activatableDraft),
      applyDraft,
      activateDraft,
    }),
  });

  await openDraftScreen(user);
  // 준비: 저장된 상태에서는 두 버튼 모두 누를 수 있다.
  expect(screen.getByRole("button", { name: "색인" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "채팅에 적용" })).toBeEnabled();

  // 실행: 화면에서만 본문을 고친다.
  await user.type(screen.getByLabelText(/본문/), " 추가");

  // 검증: 저장 전에는 이전 저장본이 색인·적용되지 않도록 막는다.
  expect(screen.getByRole("button", { name: "색인" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "채팅에 적용" })).toBeDisabled();
  expect(screen.getByText(/먼저 저장하세요/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  expect(applyDraft).not.toHaveBeenCalled();
  expect(activateDraft).not.toHaveBeenCalled();
});

test("저장 요청 중에는 색인·채팅에 적용이 비활성이다", async () => {
  // 저장 응답을 붙잡아 둔다.
  const patchDraft = vi.fn(() => new Promise<Draft>(() => {}));
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(activatableDraft),
      patchDraft,
    }),
  });

  await openDraftScreen(user);
  await user.type(screen.getByLabelText(/본문/), " 추가");
  await user.click(screen.getByRole("button", { name: "저장" }));

  expect(screen.getByRole("button", { name: "저장 중…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "색인" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "채팅에 적용" })).toBeDisabled();
});

test("기존 초안에서 기본 소개를 공백으로 비우면 저장을 막고 필수 안내를 보여준다", async () => {
  const patchDraft = vi.fn();
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
      getDraft: vi.fn().mockResolvedValue(editingDraft),
      patchDraft,
    }),
  });

  await openDraftScreen(user);
  const profileInput = screen.getByLabelText("기본 소개");
  await user.clear(profileInput);
  await user.type(profileInput, "   ");

  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  expect(screen.getByText(/기본 소개는 필수입니다/)).toBeInTheDocument();
  expect(patchDraft).not.toHaveBeenCalled();
});

// ---- 캐릭터 전환 ----

test("A 편집에서 B 편집으로 바로 옮기면 A의 입력이 남지 않는다", async () => {
  const personaB = {
    ...persona,
    id: "00000000-0000-4000-8000-000000000002",
    name: "합성 루나",
  };
  const draftB: Draft = {
    ...editingDraft,
    version_id: "10000000-0000-4000-8000-000000000002",
    persona_id: personaB.id,
    settings: { name: personaB.name, profile: "B 소개", speech_examples: "" },
  };
  const api = personaApi({
    listPersonas: vi
      .fn()
      .mockResolvedValue({ items: [persona, personaB], next_cursor: null }),
    getDraft: vi.fn((_token: unknown, personaId: string) =>
      Promise.resolve(personaId === personaB.id ? draftB : editingDraft),
    ),
  });
  const user = userEvent.setup();
  // 같은 DraftEditRoute가 재사용되는 경로 전환(A draft → B draft)을 재현하려고
  // 앱 밖에 테스트용 링크를 둔다. 목록 링크는 개요 화면을 거쳐 이 상황이 생기지 않는다.
  render(
    <MemoryRouter initialEntries={["/"]}>
      <App api={api} />
      <Link to={`/personas/${persona.id}/draft`}>테스트: A 편집</Link>
      <Link to={`/personas/${personaB.id}/draft`}>테스트: B 편집</Link>
    </MemoryRouter>,
  );

  await authenticate(user);
  await user.click(screen.getByRole("link", { name: "테스트: A 편집" }));
  await user.type(await screen.findByLabelText(/본문/), "A만의 합성 본문");

  await user.click(screen.getByRole("link", { name: "테스트: B 편집" }));

  await screen.findByRole("heading", { name: /합성 루나 — 자료 편집/ });
  await waitFor(() =>
    expect(screen.getByLabelText("기본 소개")).toHaveValue("B 소개"),
  );
  expect(screen.getByLabelText(/본문/)).toHaveValue("");
  expect(screen.getByLabelText("이름")).toHaveValue(personaB.name);
});
