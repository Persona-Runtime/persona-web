import { Route, Routes } from "react-router";
import { SessionProvider } from "./components/SessionProvider";
import { createPersonaApi } from "./lib/client";
import type { PersonaApi } from "./lib/types";
import { ChatRoute } from "./routes/ChatRoute";
import { CreateRoute } from "./routes/CreateRoute";
import { DraftEditRoute } from "./routes/DraftEditRoute";
import { NotFoundRoute } from "./routes/NotFoundRoute";
import { PersonaOverviewRoute } from "./routes/PersonaOverviewRoute";
import { RequireSession } from "./routes/RequireSession";
import { StudioHome } from "./routes/StudioHome";
import { StudioLayout } from "./routes/StudioLayout";
import { TokenRoute } from "./routes/TokenRoute";

/**
 * 세션과 주소 표만 담는다. 라우터 자체는 이 컴포넌트 밖에 두어 테스트가
 * MemoryRouter로 바꿔 끼울 수 있게 한다.
 *
 * api를 prop으로 받는 이유는 테스트에서 합성 구현을 넣기 위해서다. 기본값은
 * 실제 구현이며 mock은 개발자가 VITE_API_MODE로 명시했을 때만 쓰인다.
 */
export default function App({
  api = createPersonaApi(),
}: {
  api?: PersonaApi;
}) {
  return (
    <SessionProvider api={api}>
      <Routes>
        <Route path="/" element={<TokenRoute />} />
        <Route element={<RequireSession />}>
          <Route path="/personas" element={<StudioLayout api={api} />}>
            <Route index element={<StudioHome />} />
            <Route path="new" element={<CreateRoute />} />
            <Route path=":personaId" element={<PersonaOverviewRoute />} />
            <Route path=":personaId/draft" element={<DraftEditRoute />} />
            <Route path=":personaId/chat" element={<ChatRoute />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </SessionProvider>
  );
}
