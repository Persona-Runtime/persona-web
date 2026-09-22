import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ApiError, type Draft } from "../lib/types";
import {
  authenticate,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

/** 편집 중, 소스 없음. 대부분의 테스트가 여기서 시작한다. */
const editingDraft: Draft = {
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
