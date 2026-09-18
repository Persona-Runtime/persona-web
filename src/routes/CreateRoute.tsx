import { type FormEvent, useRef, useState } from "react";
import { Navigate } from "react-router";
import { PersonaCard } from "../components/PersonaCard";
import { WorkspaceHeading } from "../components/WorkspaceHeading";
import { useStudio } from "../lib/studioContext";

/** 캐릭터 생성 화면. 이름만 입력받고, 미리보기는 실제로 보낼 값만 보여준다. */
export function CreateRoute() {
  const { create } = useStudio();
  const [name, setName] = useState("");
  // 이 화면에서 보낸 전송의 id. 제출과 재시도가 모두 여기를 거쳐야 한다.
  const startedSubmission = useRef<number | null>(null);

  // 이 화면에서 보낸 그 전송이 성공했을 때만 결과로 이동한다. 이전 방문에서 성공한
  // 결과가 남아 있다고 이동해 버리면, 방금 보낸 요청이 실패해도 그 오류를 볼 수 없다.
  if (
    create.result !== null &&
    create.result.submissionId === startedSubmission.current
  ) {
    return (
      <Navigate
        to={`/personas/${create.result.persona.id}`}
        replace
        state={{ created: true }}
      />
    );
  }

  const rememberSubmission = (submissionId: number | null) => {
    if (submissionId === null) return;
    startedSubmission.current = submissionId;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    rememberSubmission(create.submit(name));
  };

  // 재시도도 일반 제출과 같은 완료 경로를 쓴다. 예전처럼 create.retrySame을 그대로
  // onClick에 넘기면 전송 id가 기록되지 않아 성공해도 화면이 넘어가지 않는다.
  const retry = () => rememberSubmission(create.retrySame());

  const previewName = name.trim();

  return (
    <>
      <WorkspaceHeading id="workspace-title">캐릭터 생성</WorkspaceHeading>
      <p className="guide">
        생성한 캐릭터는 자료 입력 필요 상태로 시작합니다. 자료 업로드 화면은
        아직 준비 중입니다.
      </p>

      <div className="preview" aria-hidden="true">
        {previewName === "" ? (
          <p className="preview__placeholder">
            이름을 입력하면 카드 미리보기가 나타납니다.
          </p>
        ) : (
          <PersonaCard name={previewName} status="needs_material" />
        )}
      </div>

      <form onSubmit={submit}>
        <label htmlFor="persona-name">이름</label>
        <input
          id="persona-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
        />
        {create.error !== null && (
          <div className="error" role="alert">
            <p>{create.error}</p>
            {create.requestId !== null && <p>요청 ID: {create.requestId}</p>}
          </div>
        )}
        {create.canRetrySame && (
          // 새 키로 다시 보내면 캐릭터가 두 개 생길 수 있다. 같은 키로만 재전송한다.
          <button className="secondary" type="button" onClick={retry}>
            같은 요청 다시 전송
          </button>
        )}
        <button type="submit" disabled={create.state === "loading"}>
          {create.state === "loading" ? "생성 중…" : "생성"}
        </button>
      </form>
    </>
  );
}
