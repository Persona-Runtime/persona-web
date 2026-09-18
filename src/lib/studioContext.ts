import { useOutletContext } from "react-router";
import type { Persona } from "./types";
import type { CreatePersonaState } from "./useCreatePersona";
import type { PersonaListState } from "./usePersonaList";

/**
 * 스튜디오 셸이 하위 화면에 넘겨주는 값.
 *
 * 목록·생성 상태를 셸이 소유하는 이유는 화면을 옮겨도 살아 있어야 하기 때문이다.
 * 생성 화면에 두면 성공 직후 개요로 넘어갈 때 방금 만든 캐릭터를 잃는다.
 */
export interface StudioContextValue {
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
