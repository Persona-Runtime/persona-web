import { type FormEvent, useState } from "react";
import { useSession } from "../lib/session";

/**
 * 토큰 입력 폼.
 *
 * 입력값은 이 컴포넌트 안에만 둔다. 인증에 성공하면 화면이 바뀌면서 이 컴포넌트가
 * 사라지므로 입력값도 함께 없어진다. 토큰을 브라우저 저장소·URL에 남기지 않는
 * 계약을 화면 쪽에서도 지키기 위한 구조다.
 */
export function TokenForm() {
  const { authState, authError, authenticate } = useSession();
  const [tokenInput, setTokenInput] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void authenticate(tokenInput);
  };

  // 안내 문구는 짧지만 뜻은 전과 같다: 토큰은 이 탭의 메모리에만 있고, 새로고침하면
  // 사라져 다시 입력해야 한다.
  return (
    <form className="token-form" onSubmit={submit}>
      <label htmlFor="token">토큰</label>
      <input
        id="token"
        type="password"
        autoComplete="off"
        aria-describedby="token-hint"
        value={tokenInput}
        onChange={(event) => setTokenInput(event.target.value)}
      />
      <p className="hint" id="token-hint">
        로그인 상태는 이 탭에서만 유지돼요.
      </p>
      {authError !== null && (
        <p className="error" role="alert">
          {authError}
        </p>
      )}
      <button type="submit" disabled={authState === "loading"}>
        {authState === "loading" ? "확인 중…" : "접속"}
      </button>
    </form>
  );
}
