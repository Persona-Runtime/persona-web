// @vitest-environment node
//
// 이 파일만 jsdom이 아니라 node에서 돈다. jsdom의 fetch 주변 구현과 Node의 undici를
// 섞으면 요청이 끝나지 않는 경우가 있었다. 여기서 보려는 것은 DOM이 아니라 HTTP다.
import { beforeAll, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { httpPersonaApi } from "./api";
import { ApiError } from "./types";

/*
 * 실제 Gateway·PostgreSQL을 상대로 도는 유일한 테스트다.
 *
 * 다른 층과 구분해서 읽는다.
 *   - 화면 테스트     : 합성 PersonaApi. 화면 로직만 본다.
 *   - api.test.ts     : 실제 api.ts + 가짜 fetch 응답. 요청 형태와 응답 검증을 본다.
 *   - 이 파일         : 실제 서버. 계약이 실제로 지켜지는지 본다.
 *
 * 준비:
 *   persona-gateway/scripts/local-stack.sh up
 *   PERSONA_LIVE_API=<주소> PERSONA_LIVE_TOKEN=<토큰> npx vitest run src/lib/api.live.test.ts
 *
 * **비어 있는 스택을 전제로 한다.** 캐릭터 삭제 API가 아직 없어 3개 한도를 되돌릴 수 없다.
 * 다시 돌리려면 local-stack.sh up으로 새로 만든다.
 *
 * 합성 데이터만 쓴다. 실제 토큰·사용자 자료를 넣지 않는다.
 */

const baseUrl = process.env.PERSONA_LIVE_API;
const token = process.env.PERSONA_LIVE_TOKEN;
const live = Boolean(baseUrl && token);

/*
 * local-stack.sh가 발급하는 합성 신원. **환경변수로 받지 않는다.**
 * 기대값을 밖에서 주게 하면 운영 신원을 넣어 이 방어를 그대로 우회할 수 있다.
 * 운영의 PERSONA_STATIC_USER_ID는 Secret에서 오므로 이 값과 같을 수 없다.
 * 스택 쪽 값을 바꾸면 여기도 함께 고친다.
 */
const SYNTHETIC_USER_ID = "stack-user-0001";
const SYNTHETIC_DISPLAY_NAME = "합성 사용자";

if (!live) {
  // skip으로만 두면 "통과"처럼 읽힌다. 리포터가 console을 가리므로 stderr에 직접 쓴다.
  process.stderr.write(
    "\n[미실행] 실제 Gateway 연동 검사를 건너뜁니다. 실연동은 검증되지 않았습니다.\n" +
      "         persona-gateway/scripts/local-stack.sh up 뒤\n" +
      "         PERSONA_LIVE_API·PERSONA_LIVE_TOKEN을 주고 다시 실행하세요.\n\n",
  );
}

/** api.ts는 상대 경로로 요청한다. 실제 서버 주소를 붙이려면 fetch를 한 겹 감싼다. */
function useLiveOrigin(): void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    original(
      typeof input === "string" && input.startsWith("/")
        ? `${baseUrl}${input}`
        : input,
      init,
    )) as typeof fetch;
}

const key = () => crypto.randomUUID();

/** 스택 스크립트는 이 파일 기준으로 찾는다. 실행 위치에 따라 달라지지 않게 한다. */
const stackScript = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../persona-gateway/scripts/local-stack.sh",
);

/**
 * 조회 대상(PERSONA_LIVE_API)과 스크립트가 실제로 관리하는 컨테이너가 같은지 확인한다.
 *
 * 모든 합성 스택이 같은 신원을 쓰므로 신원 검사만으로는 둘을 이어 주지 못한다. 다른 합성
 * 서버를 조회하면서 로컬 컨테이너만 재시작해도 신원 검사는 통과해 버린다.
 *
 * beforeAll 맨 앞(첫 HTTP 요청보다 먼저)에서 호출해 불일치를 요청 부작용 전에 잡고,
 * 재시작 직전에도 한 번 더 호출해 그 사이 대상이 바뀌지 않았는지 재확인한다.
 */
function assertManagedTargetMatches(): void {
  const managed = execFileSync(stackScript, ["url"], {
    encoding: "utf8",
  }).trim();
  if (managed !== baseUrl) {
    throw new Error(
      `[중단] 조회 대상과 재시작 대상이 다릅니다. ` +
        `조회=${baseUrl} 재시작=${managed}. 스크립트가 출력한 주소를 그대로 쓰세요.`,
    );
  }
}

/**
 * 재시작 직후의 첫 조회. **연결이 끊긴 경우에만** 한 번 더 시도한다.
 *
 * 서버는 이미 떠 있다 — restart가 /readyz 200을 확인하고 돌아온다. 그런데 이 프로세스의
 * fetch 풀에는 죽은 이전 프로세스로 열어 둔 keep-alive 소켓이 남아 있어, 그 소켓을 재사용한
 * 첫 요청이 ECONNRESET으로 끝난다. 재시작을 겪는 클라이언트라면 누구나 겪는 일이고
 * 서버 동작이 아니다.
 *
 * HTTP 오류(4xx·5xx)는 재시도하지 않는다. 그것까지 감싸면 정작 검사하려던 실패를 숨긴다.
 */
async function listAfterRestart() {
  try {
    return await httpPersonaApi.listPersonas(token!);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return await httpPersonaApi.listPersonas(token!);
  }
}

async function errorOf(action: Promise<unknown>): Promise<ApiError> {
  const reason = await action.then(
    () => null,
    (error: unknown) => error,
  );
  expect(reason).toBeInstanceOf(ApiError);
  return reason as ApiError;
}

describe.skipIf(!live)("실제 Gateway 연동", () => {
  beforeAll(async () => {
    /*
     * **HTTP 요청을 보내기 전에** 조회 대상과 관리 대상이 같은지부터 확인한다.
     * 이 확인이 늦으면, 뒤 검사들이 이미 다른(그러나 합성인) 스택에 캐릭터·초안을 만든
     * 뒤에야 불일치를 발견하게 된다.
     */
    assertManagedTargetMatches();

    useLiveOrigin();

    /*
     * **변경 요청을 보내기 전에** 대상이 합성 스택인지 확인한다.
     * 아래 두 검사는 모두 읽기 전용이라 잘못된 대상에도 흔적을 남기지 않는다.
     *
     * 주소로 판단하지 않는다 — localhost 제한은 운영 port-forward를 구분하지 못한다.
     */
    const user = await httpPersonaApi.getMe(token!);
    if (
      user.id !== SYNTHETIC_USER_ID ||
      user.display_name !== SYNTHETIC_DISPLAY_NAME
    ) {
      // 실제 id·display_name은 남기지 않는다 — 이 방어 자체가 운영 오접속을 막으려는
      // 것인데, 예외 메시지에 운영 식별자를 그대로 남기면 그 목적과 어긋난다.
      throw new Error(
        "[중단] 합성 스택이 아닙니다. 이 검사는 캐릭터를 만들므로 실행하지 않습니다. " +
          "합성 신원 불일치.",
      );
    }

    // 이 검사는 3개 한도를 끝까지 쓴다. 비어 있지 않다면 남의 데이터이거나 이전 실행의 잔재다.
    const page = await httpPersonaApi.listPersonas(token!);
    if (page.items.length > 0) {
      throw new Error(
        `[중단] 스택이 비어 있지 않습니다(${page.items.length}개). ` +
          `local-stack.sh up으로 새로 만든 뒤 실행하세요.`,
      );
    }
  });

  const createdIds: Record<string, string> = {};

  test("잘못된 토큰은 401, 올바른 토큰은 사용자를 돌려준다", async () => {
    const rejected = await errorOf(
      httpPersonaApi.getMe("wrong-token-not-real"),
    );
    expect(rejected.status).toBe(401);

    const user = await httpPersonaApi.getMe(token!);
    expect(user.id).toBe(SYNTHETIC_USER_ID);
  });

  test("생성한 캐릭터가 목록에 그대로 나타난다", async () => {
    const persona = await httpPersonaApi.createPersona(
      token!,
      "합성 하나",
      key(),
    );
    createdIds.first = persona.id;
    expect(persona.name).toBe("합성 하나");

    const page = await httpPersonaApi.listPersonas(token!);
    const listed = page.items.find((item) => item.id === persona.id);
    expect(listed).toBeDefined();
    expect(listed!.name).toBe("합성 하나");
    expect(listed!.status).toBe("needs_material");
  });

  test("같은 이름은 409로 거절한다", async () => {
    const conflict = await errorOf(
      httpPersonaApi.createPersona(token!, "합성 하나", key()),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe("duplicate_persona_name");
  });

  test("같은 키 재전송은 캐릭터를 새로 만들지 않는다", async () => {
    const sameKey = key();
    const first = await httpPersonaApi.createPersona(
      token!,
      "합성 둘",
      sameKey,
    );
    const replayed = await httpPersonaApi.createPersona(
      token!,
      "합성 둘",
      sameKey,
    );

    // 응답이 유실된 요청의 재전송이다. 새로 만들면 캐릭터가 두 개가 되고 한도를 갉아먹는다.
    expect(replayed.id).toBe(first.id);
    const page = await httpPersonaApi.listPersonas(token!);
    expect(page.items.filter((item) => item.name === "합성 둘")).toHaveLength(
      1,
    );
  });

  test("캐릭터는 3개까지만 만들 수 있다", async () => {
    await httpPersonaApi.createPersona(token!, "합성 셋", key());

    const over = await errorOf(
      httpPersonaApi.createPersona(token!, "합성 넷", key()),
    );
    expect(over.status).toBe(409);
    expect(over.code).toBe("persona_limit_exceeded");
  });

  test("초안을 만들고 다시 열어 설정과 자료를 고친다", async () => {
    /*
     * 사용자 흐름 그대로다 — 소개를 넣어 저장하고, 나중에 다시 열어 고치고 자료를 붙인다.
     * 처리기가 없으므로 job은 만들어지지 않고 적용도 할 수 없다.
     */
    const created = await httpPersonaApi.createDraft(
      token!,
      createdIds.first,
      {
        settings: {
          name: "합성 모루",
          profile: "침착한 도서관 안내자다.",
          speech_examples: "",
        },
      },
      key(),
    );
    expect(created.revision).toBe(1);
    expect(created.job_id).toBeNull();
    expect(created.can_activate).toBe(false);

    // 다시 열기. 저장이 앱 메모리가 아니라 서버에 있는지 본다.
    const reopened = await httpPersonaApi.getDraft(token!, createdIds.first);
    expect(reopened.settings.profile).toBe("침착한 도서관 안내자다.");

    const patched = await httpPersonaApi.patchDraft(
      token!,
      createdIds.first,
      {
        expected_revision: reopened.revision,
        settings: { profile: "침착하며 모르는 것은 모른다고 말한다." },
        upsert_sources: [
          {
            kind: "events",
            filename: "events.md",
            content: "개관 첫날 지도책을 찾아냈다.",
          },
        ],
      },
      key(),
    );
    expect(patched.revision).toBe(reopened.revision + 1);
    expect(patched.settings.profile).toBe(
      "침착하며 모르는 것은 모른다고 말한다.",
    );
    expect(patched.sources).toHaveLength(1);
    expect(patched.sources[0].kind).toBe("events");
    expect(patched.sources[0].sha256).toMatch(/^[0-9a-f]{64}$/);

    // 초안이 생기면 캐릭터 상태가 바뀐다(계약 2절). job이 없으므로 preparing이 아니다.
    const page = await httpPersonaApi.listPersonas(token!);
    const listed = page.items.find((item) => item.id === createdIds.first);
    expect(listed!.status).toBe("review_required");
  });

  test("낡은 revision으로 고치면 409로 막는다", async () => {
    // 다른 화면에서 이미 고친 뒤다. 그대로 덮으면 앞선 수정이 조용히 사라진다.
    const conflict = await errorOf(
      httpPersonaApi.patchDraft(
        token!,
        createdIds.first,
        { expected_revision: 1, settings: { name: "덮어쓰기" } },
        key(),
      ),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe("revision_conflict");
  });

  test("초안은 캐릭터당 하나다", async () => {
    const conflict = await errorOf(
      httpPersonaApi.createDraft(
        token!,
        createdIds.first,
        {
          settings: {
            name: "둘째 초안",
            profile: "있을 수 없다.",
            speech_examples: "",
          },
        },
        key(),
      ),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe("draft_exists");
  });

  test("폐기하면 초안만 사라지고 캐릭터는 남는다", async () => {
    const removeKey = key();
    await expect(
      httpPersonaApi.discardDraft(token!, createdIds.first, removeKey),
    ).resolves.toBeUndefined();
    // 응답이 유실된 폐기 요청의 재전송이다. 404를 내면 실패한 줄 알고 되돌리려 한다.
    await expect(
      httpPersonaApi.discardDraft(token!, createdIds.first, removeKey),
    ).resolves.toBeUndefined();

    const gone = await errorOf(
      httpPersonaApi.getDraft(token!, createdIds.first),
    );
    expect(gone.status).toBe(404);
    expect(gone.code).toBe("draft_not_found");

    const page = await httpPersonaApi.listPersonas(token!);
    const listed = page.items.find((item) => item.id === createdIds.first);
    expect(listed).toBeDefined();
    expect(listed!.status).toBe("needs_material");
  });

  test("Gateway를 재시작해도 저장한 캐릭터가 남아 있다", async () => {
    /*
     * 저장이 앱 메모리가 아니라 실제 DB에 있는지 본다.
     *
     * 같은 프로세스에서 앱 객체만 다시 만드는 통합 테스트와 **다른 검증**이다.
     * 여기서는 컨테이너 프로세스 자체가 죽었다 다시 뜬다.
     */
    // beforeAll에서 이미 확인했지만, 재시작 직전에 대상이 그대로인지 한 번 더 확인한다.
    assertManagedTargetMatches();

    const before = await httpPersonaApi.listPersonas(token!);
    expect(before.items).toHaveLength(3);

    // 스크립트가 /readyz 200까지 기다린 뒤 돌아온다.
    execFileSync(stackScript, ["restart"], { stdio: "ignore" });

    const after = await listAfterRestart();
    expect(after.items.map((item) => item.id).sort()).toEqual(
      before.items.map((item) => item.id).sort(),
    );
    expect(
      after.items.find((item) => item.id === createdIds.first),
    ).toBeDefined();
  });
});
