import { useOutletContext } from "react-router";
import type {
  Conversation,
  GenerationMode,
  Persona,
  PersonaApi,
} from "./types";
import type { CreatePersonaState } from "./useCreatePersona";
import type { PersonaListState } from "./usePersonaList";

/**
 * 스튜디오 셸이 하위 화면에 넘겨주는 값.
 *
 * 목록·생성 상태를 셸이 소유하는 이유는 화면을 옮겨도 살아 있어야 하기 때문이다.
 * 생성 화면에 두면 성공 직후 개요로 넘어갈 때 방금 만든 캐릭터를 잃는다.
 *
 * api도 여기 둔다 — 초안 편집·적용 화면은 자신만의 훅(useDraft)으로 직접 요청을
 * 보내야 하는데, App까지 올라가지 않고 이 컨텍스트에서 바로 받게 하려는 것이다.
 */
/**
 * 대화 화면이 보조 패널에 올려 보내는 값.
 *
 * 대화 상태(useChat)는 대화 화면이 소유하고, 패널은 셸에 있다. 패널이 같은 데이터를
 * 다시 조회하면 요청이 두 배가 되므로, 대화 화면이 이미 가진 값을 그대로 올려 준다.
 */
export interface ChatPanelInfo {
  personaName: string;
  activeVersionId: string;
  /** 아직 불러오는 중이거나 실패했으면 null. */
  conversation: Conversation | null;
  /** 화면에 확정된 질문 수. 스트리밍 중인 질문은 세지 않는다. */
  turnCount: number;
}

export interface StudioContextValue {
  api: PersonaApi;
  list: PersonaListState;
  create: CreatePersonaState;
  personas: Persona[];
  /** 목록이 잘려 있어 보유 개수를 단정할 수 없는 상태. */
  listIncomplete: boolean;
  creationBlocked: boolean;
  blockMessage: string | null;
  /** 목록에서 찾고, 없으면 방금 만든 캐릭터에서 찾는다. 못 찾으면 null. */
  findPersona: (personaId: string) => Persona | null;
  /**
   * 대화 응답에서 관측한 generation.mode를 셸에 알린다. 레일의 "모의 응답" 배지가
   * 이 값을 쓴다. 서버의 서비스 상태 API(M5)가 생기기 전까지 응답에서만 알 수 있다.
   */
  reportGenerationMode: (mode: GenerationMode) => void;
  /** 보조 패널 내용을 바꾼다. 대화 화면을 떠날 때 null로 되돌린다. */
  setChatPanel: (info: ChatPanelInfo | null) => void;
}

export function useStudio(): StudioContextValue {
  return useOutletContext<StudioContextValue>();
}
