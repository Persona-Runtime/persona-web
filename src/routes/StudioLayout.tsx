import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useMatch } from "react-router";
import { ContextPanel } from "../components/ContextPanel";
import { Icon } from "../components/Icon";
import { PersonaAvatar } from "../components/PersonaAvatar";
import { PersonaNav } from "../components/PersonaNav";
import { StatusBadge } from "../components/StatusBadge";
import { MAX_PERSONAS_PER_USER } from "../lib/limits";
import { useSession } from "../lib/session";
import type { ChatPanelInfo, StudioContextValue } from "../lib/studioContext";
import type { GenerationMode, PersonaApi } from "../lib/types";
import { useCreatePersona } from "../lib/useCreatePersona";
import { usePersonaList } from "../lib/usePersonaList";

/**
 * 빌드 때 mock 모드를 골랐는지. 이 값만으로도 모든 응답이 모의 응답임을 알 수 있다.
 * 실제 모드에서는 응답의 generation.mode를 관측하기 전까지 알 수 없다.
 */
const BUILT_AS_MOCK = import.meta.env.VITE_API_MODE === "mock";

/**
 * 캐릭터 스튜디오 셸. 레일(캐릭터 목록) · 메인(작업 영역) · 보조 패널 세 칸이다.
 *
 * 폭에 따른 배치는 app.css가 정한다.
 * - 1100px 이상: 세 칸. 보조 패널은 내용이 있을 때(대화 화면)만 열린다.
 * - 720~1099px: 레일 + 메인. 보조 패널은 메인 상단 버튼으로 여는 오른쪽 서랍이다.
 * - 720px 미만: 한 칸. 레일이 홈 화면이 되고, 상세 화면은 상단 바와 함께 전면으로 뜬다.
 *
 * 목록·생성 상태를 이 셸이 소유한다. 하위 화면에 두면 주소가 바뀔 때마다 상태가
 * 사라져 다시 조회하게 되고, 생성 성공 직후 개요로 넘어갈 때 방금 만든 캐릭터를
 * 잃는다. 진행 중 요청 취소도 여기가 아니라 SessionProvider가 맡는다.
 */
export function StudioLayout({ api }: { api: PersonaApi }) {
  const { sessionExpired } = useSession();
  const list = usePersonaList(api);
  const create = useCreatePersona(api, list.reload);
  const { reload } = list;

  // 레일 배지용. 서버 서비스 상태 API(M5)가 생기기 전까지는 응답에서만 알 수 있다.
  const [observedMode, setObservedMode] = useState<GenerationMode | null>(null);
  const [chatPanel, setChatPanelState] = useState<ChatPanelInfo | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelToggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // 대화 화면을 떠나면(null) 서랍도 닫는다. 다시 들어왔을 때 서랍이 저절로 열려
  // 대화 본문을 가리지 않게 하기 위해서다.
  const setChatPanel = useCallback((info: ChatPanelInfo | null) => {
    setChatPanelState(info);
    if (info === null) setPanelOpen(false);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    // 서랍을 닫으면 포커스를 연 버튼으로 돌려준다. 그대로 두면 사라진 서랍 안에서
    // 포커스가 문서 처음으로 떨어진다.
    panelToggleRef.current?.focus();
  }, []);

  // 서랍이 열리면 그 안의 닫기 버튼으로 포커스를 옮긴다. 키보드 사용자가 서랍이
  // 열렸다는 것을 알고, Esc나 닫기 버튼으로 바로 돌아올 수 있게 하기 위해서다.
  useEffect(() => {
    if (!panelOpen) return;
    panelRef.current
      ?.querySelector<HTMLElement>(".context-panel__close")
      ?.focus();
  }, [panelOpen]);

  // reload는 참조가 고정돼 있어 이 효과는 셸이 마운트될 때 한 번만 조회한다.
  useEffect(() => {
    reload();
  }, [reload]);

  // "/personas/new"도 ":personaId" 규칙에 걸리므로 먼저 구분한다.
  const creatingMatch = useMatch("/personas/new");
  // 와일드카드로 개요·자료 편집·대화(:personaId, :personaId/draft, :personaId/chat)를
  // 전부 "상세 보기 중"으로 취급한다 — 셋 다 같은 캐릭터를 다루는 작업 영역이다.
  const detailMatch = useMatch("/personas/:personaId/*");
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

  const findPersona: StudioContextValue["findPersona"] = (personaId) =>
    personas.find((persona) => persona.id === personaId) ??
    (create.result?.persona.id === personaId ? create.result.persona : null);

  const studio: StudioContextValue = {
    api,
    list,
    create,
    personas,
    listIncomplete,
    creationBlocked,
    blockMessage,
    // 목록 갱신이 실패해도 방금 서버가 돌려준 캐릭터는 보여줄 수 있다.
    // 지어낸 값이 아니라 생성 응답 그대로이며, 보유 개수에는 더하지 않는다.
    findPersona,
    reportGenerationMode: setObservedMode,
    setChatPanel,
  };

  const selectedPersona = selectedId === null ? null : findPersona(selectedId);
  const showMockBadge = BUILT_AS_MOCK || observedMode === "mock";

  return (
    <div
      className="studio"
      data-pane={showsWorkspace ? "detail" : "list"}
      data-panel={chatPanel === null ? "none" : panelOpen ? "open" : "closed"}
    >
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
        showMockBadge={showMockBadge}
      />

      <main className="studio__main" aria-labelledby="workspace-title">
        {sessionExpired && (
          <p className="error" role="alert">
            로그인이 만료됐습니다. 페이지를 새로고침해 다시 로그인해주세요.
          </p>
        )}

        {(showsWorkspace || chatPanel !== null) && (
          // 폰에서는 레일이 가려지므로 돌아갈 길과 지금 어느 캐릭터인지가 필요하다.
          // 넓은 화면에서는 레일이 늘 보이므로 CSS가 이 바의 뒤로가기·이름을 숨기고,
          // 보조 패널 버튼만 서랍 폭(1099px 이하)에서 남긴다.
          <div className="workspace-bar">
            {showsWorkspace && (
              <Link className="icon-button workspace-bar__back" to="/personas">
                <Icon name="back" />
                목록으로
              </Link>
            )}
            {selectedPersona !== null && (
              <span className="workspace-bar__identity">
                <PersonaAvatar name={selectedPersona.name} size={32} />
                <span className="workspace-bar__name">
                  {selectedPersona.name}
                </span>
                <StatusBadge status={selectedPersona.status} />
              </span>
            )}
            {chatPanel !== null && (
              <button
                ref={panelToggleRef}
                type="button"
                className="icon-button workspace-bar__panel"
                aria-expanded={panelOpen}
                aria-controls="context-panel"
                onClick={() => setPanelOpen((open) => !open)}
              >
                <Icon name="panel" />
                대화 정보
              </button>
            )}
          </div>
        )}

        <div className="studio__content">
          <Outlet context={studio} />
        </div>
      </main>

      {chatPanel !== null && (
        <aside
          id="context-panel"
          ref={panelRef}
          className="context-panel"
          aria-labelledby="context-panel-title"
          onKeyDown={(event) => {
            if (event.key === "Escape" && panelOpen) closePanel();
          }}
        >
          <ContextPanel info={chatPanel} onClose={closePanel} />
        </aside>
      )}
    </div>
  );
}
