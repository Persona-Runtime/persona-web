import { useOutletContext } from "react-router";
import type { Persona, PersonaApi } from "./types";
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
}

export function useStudio(): StudioContextValue {
  return useOutletContext<StudioContextValue>();
}
