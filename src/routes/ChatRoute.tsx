import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router";
import { WorkspaceHeading } from "../components/WorkspaceHeading";
import { useStudio } from "../lib/studioContext";
import { useDraft } from "../lib/useDraft";

/**
 * 대화 화면 골격.
 *
 * vLLM 연결 전이라 실제 응답은 없다. status가 ready가 아니면 자료를 먼저 적용하라고
 * 안내하고, ready라도 전송 시 "GPU 연결 후" 안내만 한다. 메시지 목록 컴포넌트·타입은
 * 만들어 두되 API 호출은 하지 않는다.
 */
export function ChatRoute() {
  const { personaId } = useParams();
  const { api, findPersona } = useStudio();
  const persona = personaId === undefined ? null : findPersona(personaId);

  if (persona === null || personaId === undefined) {
    return (
      <>
        <WorkspaceHeading id="workspace-title">대화</WorkspaceHeading>
        <p className="notice">이 캐릭터를 찾을 수 없습니다.</p>
        <Link className="text-button" to="/personas">
          목록으로 돌아가기
        </Link>
      </>
    );
  }

  return (
    <ChatSkeleton api={api} personaId={personaId} personaName={persona.name} />
  );
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

function ChatSkeleton({
  api,
  personaId,
  personaName,
}: {
  api: ReturnType<typeof useStudio>["api"];
  personaId: string;
  personaName: string;
}) {
  const { state, draft } = useDraft(api, personaId, personaName);
  // 아직 아무 메시지도 보내지 않는다 — 목록·타입만 준비해 둔다.
  const [messages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  if (state === "loading" || state === "idle") {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 대화
        </WorkspaceHeading>
        <p className="guide" role="status">
          상태를 확인하는 중입니다…
        </p>
      </>
    );
  }

  if (draft === null || draft.status !== "ready") {
    return (
      <>
        <WorkspaceHeading id="workspace-title">
          {personaName} — 대화
        </WorkspaceHeading>
        <p className="guide">자료를 먼저 적용하세요.</p>
        <Link className="text-button" to={`/personas/${personaId}/draft`}>
          자료 편집으로 이동
        </Link>
      </>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (input.trim() === "") return;
    setNotice("대화 기능은 GPU 연결 후 열립니다.");
    setInput("");
  };

  return (
    <>
      <WorkspaceHeading id="workspace-title">
        {personaName} — 대화
      </WorkspaceHeading>

      <ul className="chat-messages">
        {messages.map((message) => (
          <li key={message.id} data-role={message.role}>
            {message.text}
          </li>
        ))}
      </ul>

      {notice !== null && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <form onSubmit={submit}>
        <label htmlFor="chat-input">메시지</label>
        <input
          id="chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit">보내기</button>
      </form>
    </>
  );
}
