import { useEffect } from "react";
import { Link, Outlet, useMatch } from "react-router";
import { PersonaNav } from "../components/PersonaNav";
import { TopBar } from "../components/TopBar";
import { MAX_PERSONAS_PER_USER } from "../lib/limits";
import type { StudioContextValue } from "../lib/studioContext";
import type { PersonaApi } from "../lib/types";
import { useCreatePersona } from "../lib/useCreatePersona";
import { usePersonaList } from "../lib/usePersonaList";

/**
 * 캐릭터 스튜디오 셸. 좌측 목록과 우측 작업 영역을 함께 둔다.
 *
 * 목록·생성 상태를 이 셸이 소유한다. 하위 화면에 두면 주소가 바뀔 때마다 상태가
 * 사라져 다시 조회하게 되고, 생성 성공 직후 개요로 넘어갈 때 방금 만든 캐릭터를
 * 잃는다. 진행 중 요청 취소도 여기가 아니라 SessionProvider가 맡는다.
 */
export function StudioLayout({ api }: { api: PersonaApi }) {
  const list = usePersonaList(api);
  const create = useCreatePersona(api, list.reload);
  const { reload } = list;

  // reload는 참조가 고정돼 있어 이 효과는 셸이 마운트될 때 한 번만 조회한다.
  useEffect(() => {
    reload();
  }, [reload]);

  // "/personas/new"도 ":personaId" 규칙에 걸리므로 먼저 구분한다.
  const creatingMatch = useMatch("/personas/new");
  const detailMatch = useMatch("/personas/:personaId");
  const selectedId =
    creatingMatch !== null ? null : (detailMatch?.params.personaId ?? null);
  const showsWorkspace = creatingMatch !== null || detailMatch !== null;

  const personas = list.page?.items ?? [];
  // 목록이 잘려 있으면 전체 개수를 알 수 없다. "없음"과 "모름"을 같이 취급하지 않는다.
  const listIncomplete = list.page !== null && list.page.next_cursor !== null;
  const atLimit = personas.length === MAX_PERSONAS_PER_USER;
  const creationBlocked = listIncomplete || atLimit;
  const blockMessage = !creationBlocked
    ? null
    : listIncomplete
      ? "목록이 완전하지 않아 생성 가능 여부를 확인할 수 없습니다."
      : "캐릭터는 최대 3개까지 만들 수 있습니다.";

  const studio: StudioContextValue = {
    list,
    create,
    personas,
    listIncomplete,
    creationBlocked,
    blockMessage,
    // 목록 갱신이 실패해도 방금 서버가 돌려준 캐릭터는 보여줄 수 있다.
    // 지어낸 값이 아니라 생성 응답 그대로이며, 보유 개수에는 더하지 않는다.
    findPersona: (personaId) =>
      personas.find((persona) => persona.id === personaId) ??
      (create.result?.persona.id === personaId ? create.result.persona : null),
  };

  return (
    <div className="shell">
      <TopBar />
      <main className="studio" data-pane={showsWorkspace ? "detail" : "list"}>
        <PersonaNav
          headingId="persona-list-title"
          personas={personas}
          listState={list.state}
          listError={list.error}
          onReload={list.reload}
          listIncomplete={listIncomplete}
          creationBlocked={creationBlocked}
          blockMessage={blockMessage}
          selectedId={selectedId}
        />
        <section
          className="studio__workspace"
          aria-labelledby="workspace-title"
        >
          {showsWorkspace && (
            // 좁은 화면에서는 목록이 가려지므로 돌아갈 길이 필요하다.
            <Link className="text-button back-link" to="/personas">
              ← 목록으로
            </Link>
          )}
          <Outlet context={studio} />
        </section>
      </main>
    </div>
  );
}
