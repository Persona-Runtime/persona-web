import { httpPersonaApi } from "./api";
import { mockPersonaApi } from "./mockApi";
import type { PersonaApi } from "./types";

// mock은 개발자가 명시적으로 선택했을 때만 쓴다. 실제 API 오류를 mock 성공으로 바꾸지 않는다.
export function createPersonaApi(
  mode = import.meta.env.VITE_API_MODE,
): PersonaApi {
  return mode === "mock" ? mockPersonaApi : httpPersonaApi;
}
