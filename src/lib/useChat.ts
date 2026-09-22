import { useCallback, useEffect, useRef, useState } from "react";
import { messageFor } from "./personaCopy";
import { useSession } from "./session";
import {
  type ChatEvent,
  type Citation,
  type Conversation,
  type Generation,
  type GenerationMode,
  type LoadState,
  type MessageTurn,
  type PersonaApi,
  type UserMessage,
} from "./types";

/** 지금 스트리밍 중인 generation 하나. 완료·실패·취소되면 turns로 합쳐지고 사라진다. */
export interface StreamingGeneration {
  generationId: string;
  userMessage: UserMessage;
  mode: GenerationMode;
  citations: Citation[];
  content: string;
  /** cancel_requested·reconciling은 서버가 준 SseError.status를 그대로 담는다. */
  status:
    | "streaming"
    | "cancel_requested"
    | "failed"
    | "cancelled"
    | "reconciling";
  failureCode: string | null;
  /** retry일 때만 채워진다 — 완료 시 이 generation을 교체(추가)할 turn을 찾는 데 쓴다. */
  retryOfGenerationId: string | null;
}

export interface ChatHookState {
  state: LoadState;
  loadError: string | null;
  conversation: Conversation | null;
  turns: MessageTurn[];
  streaming: StreamingGeneration | null;
  sendState: LoadState;
  sendError: string | null;
  send: (text: string) => void;
  cancel: () => void;
  retry: (generationId: string) => void;
}

function turnByGenerationId(
  turns: MessageTurn[],
  generationId: string,
): MessageTurn | undefined {
  return turns.find((turn) =>
    turn.generations.some((generation) => generation.id === generationId),
  );
}

/**
 * 캐릭터 하나의 대화 하나(가장 최근 것, 없으면 자동 생성)를 관리한다.
 *
 * 대화 자체는 이 화면 진입 시 하나로 고정한다 — 여러 대화를 오가는 UI는 이번
 * 범위가 아니다(계약은 대화가 여러 개일 수 있다고만 허용할 뿐, 화면이 그걸 다
 * 보여줘야 한다고 요구하지 않는다).
 */
export function useChat(api: PersonaApi, personaId: string): ChatHookState {
  const { request } = useSession();
  const [state, setState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [turns, setTurns] = useState<MessageTurn[]>([]);
  const [streaming, setStreaming] = useState<StreamingGeneration | null>(null);
  const [sendState, setSendState] = useState<LoadState>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const latestLoad = useRef(0);
  // 취소 버튼이 지금 스트리밍 중인 fetch만 끊을 수 있게, request()가 만드는 내부
  // signal과 별개로 이 세션 동안만 쓰는 컨트롤러를 따로 둔다.
  const cancelController = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    const loadId = ++latestLoad.current;
    setState("loading");
    setLoadError(null);
    void request((token, signal) =>
      api.listConversations(token, personaId, null, signal),
    ).then((outcome) => {
      if (latestLoad.current !== loadId) return;
      if (outcome.status === "stale") return;
      if (outcome.status === "failed") {
        setLoadError(messageFor(outcome.error));
        setState("error");
        return;
      }
      const existing = outcome.value.items[0];
      const ensureConversation = existing
        ? Promise.resolve({ status: "ok" as const, value: existing })
        : request((token, signal) =>
            api.createConversation(
              token,
              personaId,
              crypto.randomUUID(),
              signal,
            ),
          );
      void ensureConversation.then((created) => {
        if (latestLoad.current !== loadId) return;
        if (created.status === "stale") return;
        if (created.status === "failed") {
          setLoadError(messageFor(created.error));
          setState("error");
          return;
        }
        setConversation(created.value);
        void request((token, signal) =>
          api.listMessages(token, created.value.id, null, signal),
        ).then((messages) => {
          if (latestLoad.current !== loadId) return;
          if (messages.status === "stale") return;
          if (messages.status === "failed") {
            setLoadError(messageFor(messages.error));
            setState("error");
            return;
          }
          setTurns(messages.value.items);
          setState("ready");
        });
      });
    });
  }, [api, personaId, request]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId]);

  const runStream = useCallback(
    (
      call: (
        token: string,
        onEvent: (event: ChatEvent) => void,
        signal: AbortSignal,
      ) => Promise<
        { replayed: true; generation: Generation } | { replayed: false }
      >,
      userMessage: UserMessage,
      retryOfGenerationId: string | null,
    ) => {
      setSendState("loading");
      setSendError(null);
      const controller = new AbortController();
      cancelController.current = controller;

      const onEvent = (event: ChatEvent) => {
        switch (event.type) {
          case "meta":
            setSendState("ready");
            setStreaming({
              generationId: event.data.generation_id,
              userMessage,
              mode: event.data.mode,
              citations: [],
              content: "",
              status: "streaming",
              failureCode: null,
              retryOfGenerationId,
            });
            return;
          case "citations":
            setStreaming((current) =>
              current === null
                ? current
                : { ...current, citations: event.data.items },
            );
            return;
          case "delta":
            setStreaming((current) =>
              current === null
                ? current
                : { ...current, content: current.content + event.data.text },
            );
            return;
          case "done":
            setStreaming((current) => {
              if (current === null) return current;
              finalizeGeneration(current, "completed", null);
              return null;
            });
            return;
          case "error":
            setStreaming((current) => {
              if (current === null) return current;
              finalizeGeneration(
                { ...current, status: event.data.status },
                event.data.status,
                event.data.code,
              );
              return null;
            });
            return;
        }
      };

      function finalizeGeneration(
        current: StreamingGeneration,
        status: Generation["status"],
        failureCode: string | null,
      ) {
        const finished: Generation = {
          id: current.generationId,
          conversation_id: conversation?.id ?? "",
          user_message_id: current.userMessage.id,
          assistant_message_id: current.generationId,
          version_id: conversation?.initial_version_id ?? "",
          retry_of_generation_id: current.retryOfGenerationId,
          mode: current.mode,
          status,
          content: current.content,
          citations: current.citations,
          failure_code: failureCode,
          can_retry:
            status === "completed" ||
            status === "failed" ||
            status === "cancelled",
          created_at: current.userMessage.created_at,
          finished_at: new Date().toISOString(),
        };
        setTurns((prev) => {
          if (current.retryOfGenerationId !== null) {
            return prev.map((turn) =>
              turn.generations.some((g) => g.id === current.retryOfGenerationId)
                ? { ...turn, generations: [...turn.generations, finished] }
                : turn,
            );
          }
          return [
            ...prev,
            { user_message: current.userMessage, generations: [finished] },
          ];
        });
      }

      void request((token, signal) => {
        const combined = AbortSignal.any([signal, controller.signal]);
        return call(token, onEvent, combined);
      }).then((outcome) => {
        cancelController.current = null;
        if (outcome.status === "stale") {
          // 취소 버튼이 끊었으면 별도로 처리한다(cancel()이 담당) — 그 외 stale은
          // 세션 정리·언마운트이므로 화면에 남길 상태가 없다.
          return;
        }
        if (outcome.status === "failed") {
          setSendState("error");
          setSendError(messageFor(outcome.error));
          setStreaming(null);
          return;
        }
        if (outcome.value.replayed) {
          // 동일 Idempotency-Key 재전송 — 새 스트림을 안 열었으므로 현재 저장 상태를
          // 바로 반영한다.
          setStreaming(null);
          const replayed = outcome.value.generation;
          setTurns((prev) => {
            if (turnByGenerationId(prev, replayed.id) !== undefined)
              return prev;
            if (retryOfGenerationId !== null) {
              return prev.map((turn) =>
                turn.generations.some((g) => g.id === retryOfGenerationId)
                  ? { ...turn, generations: [...turn.generations, replayed] }
                  : turn,
              );
            }
            return [
              ...prev,
              { user_message: userMessage, generations: [replayed] },
            ];
          });
        }
        setSendState("ready");
      });
    },
    [conversation?.id, conversation?.initial_version_id, request],
  );

  const send = useCallback(
    (text: string) => {
      if (conversation === null) return;
      const userMessage: UserMessage = {
        id: crypto.randomUUID(),
        content: text,
        created_at: new Date().toISOString(),
      };
      runStream(
        (token, onEvent, signal) =>
          api.startChatCompletion(
            token,
            conversation.id,
            text,
            crypto.randomUUID(),
            onEvent,
            signal,
          ),
        userMessage,
        null,
      );
    },
    [api, conversation, runStream],
  );

  const retry = useCallback(
    (generationId: string) => {
      const turn = turnByGenerationId(turns, generationId);
      if (turn === undefined) return;
      runStream(
        (token, onEvent, signal) =>
          api.retryGeneration(
            token,
            generationId,
            crypto.randomUUID(),
            onEvent,
            signal,
          ),
        turn.user_message,
        generationId,
      );
    },
    [api, runStream, turns],
  );

  const cancel = useCallback(() => {
    if (streaming === null) return;
    setStreaming((current) =>
      current === null ? current : { ...current, status: "cancel_requested" },
    );
    // 브라우저 연결은 즉시 끊고, 서버 취소 통지는 별도로 보낸다(계약: 취소 버튼은
    // AbortController + 별도 cancel API 호출). 서버 응답(권위 있는 최종 상태)이
    // 오면 그걸로 turns를 확정한다 — 로컬에서 지어내지 않는다.
    cancelController.current?.abort();
    const generationId = streaming.generationId;
    void request((token, signal) =>
      api.cancelGeneration(token, generationId, signal),
    ).then((outcome) => {
      if (outcome.status !== "ok") return;
      setStreaming((current) => {
        if (current === null || current.generationId !== generationId)
          return current;
        setTurns((prev) => [
          ...prev,
          { user_message: current.userMessage, generations: [outcome.value] },
        ]);
        return null;
      });
    });
  }, [api, request, streaming]);

  return {
    state,
    loadError,
    conversation,
    turns,
    streaming,
    sendState,
    sendError,
    send,
    cancel,
    retry,
  };
}
