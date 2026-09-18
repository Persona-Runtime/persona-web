import { screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import {
  authenticate,
  persona,
  personaApi,
  personaNav,
  renderApp,
} from "../test/renderApp";

test("아직 만들지 않은 기능을 누를 수 있는 요소로 배치하지 않는다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
    }),
  });

  await authenticate(user);
  await user.click(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  );
  await screen.findByRole("heading", { name: "합성 모루" });

  // 자료 업로드·대화·삭제는 서버에도 화면에도 없다. 비활성 버튼으로도 두지 않는다.
  const forbidden = /업로드|자료 입력하기|대화|채팅|삭제하기|편집/;
  expect(screen.queryByRole("button", { name: forbidden })).toBeNull();
  expect(screen.queryByRole("link", { name: forbidden })).toBeNull();
  // 대신 다음 단계는 문장으로 안내한다.
  expect(
    screen.getByText(
      "다음 단계는 자료 입력입니다. 자료 업로드 화면은 아직 준비 중이라 지금은 이름만 관리할 수 있습니다.",
    ),
  ).toBeInTheDocument();
});

test("개요는 서버가 준 값만 보여준다", async () => {
  const { user } = renderApp({
    api: personaApi({
      listPersonas: vi
        .fn()
        .mockResolvedValue({ items: [persona], next_cursor: null }),
    }),
    path: `/personas/${persona.id}`,
  });

  await authenticate(user);
  await screen.findByRole("heading", { name: "합성 모루" });

  expect(screen.getByText("상태")).toBeInTheDocument();
  expect(screen.getByText("생성일")).toBeInTheDocument();
  // 방금 만든 캐릭터가 아니므로 생성 성공 안내는 나오지 않는다.
  expect(screen.queryByText("“합성 모루” 캐릭터를 만들었습니다.")).toBeNull();
});

test("목록 조회는 화면을 옮겨도 다시 시작되지 않는다", async () => {
  const listPersonas = vi
    .fn()
    .mockResolvedValue({ items: [persona], next_cursor: null });
  const { user } = renderApp({ api: personaApi({ listPersonas }) });

  await authenticate(user);
  await user.click(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  );
  await screen.findByRole("heading", { name: "합성 모루" });
  await user.click(screen.getByRole("link", { name: "← 목록으로" }));

  await waitFor(() => expect(listPersonas).toHaveBeenCalledTimes(1));
});

test("생성 안내는 그 이동에서 한 번만 보여준다", async () => {
  const listPersonas = vi
    .fn()
    .mockResolvedValueOnce({ items: [], next_cursor: null })
    .mockResolvedValue({ items: [persona], next_cursor: null });
  const { user } = renderApp({ api: personaApi({ listPersonas }) });

  await authenticate(user);
  await user.click(screen.getByRole("link", { name: "캐릭터 생성" }));
  await user.type(screen.getByLabelText("이름"), "합성 모루");
  await user.click(screen.getByRole("button", { name: "생성" }));
  expect(
    await screen.findByText("“합성 모루” 캐릭터를 만들었습니다."),
  ).toBeInTheDocument();

  // 목록에서 같은 캐릭터를 다시 열면 방금 만든 것이 아니므로 안내가 다시 뜨면 안 된다.
  await user.click(screen.getByRole("link", { name: "← 목록으로" }));
  await user.click(
    await personaNav().findByRole("link", { name: /합성 모루/ }),
  );
  await screen.findByRole("heading", { name: "합성 모루" });

  expect(screen.queryByText("“합성 모루” 캐릭터를 만들었습니다.")).toBeNull();
});
