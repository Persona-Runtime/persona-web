import { PROGRESS_STEPS, type Progress } from "../lib/progress";

const TONE_LABEL: Record<Progress["tone"], string> = {
  current: "지금 단계",
  processing: "처리 중",
  failed: "실패",
};

/**
 * 4단계 진행 표시.
 *
 * 순서 있는 목록(ol)으로 두고 현재 항목에 aria-current="step"을 붙인다. 색만으로
 * 상태를 전하지 않도록 현재 단계에는 "처리 중"·"실패" 같은 글자 라벨도 함께 둔다.
 * compact는 폰 카드 목록용으로 단계 이름을 숨기고 칸만 보여준다(이름은 스크린리더용으로 남긴다).
 */
export function StepBar({
  progress,
  compact = false,
}: {
  progress: Progress;
  compact?: boolean;
}) {
  return (
    <ol
      className="step-bar"
      data-compact={compact ? "true" : undefined}
      aria-label="진행 단계"
    >
      {PROGRESS_STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const isCurrent = stepNumber === progress.step;
        const state =
          stepNumber < progress.step
            ? "done"
            : isCurrent
              ? progress.tone
              : "todo";
        return (
          <li
            key={label}
            className="step-bar__step"
            data-state={state}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className={compact ? "visually-hidden" : "step-bar__label"}>
              {stepNumber}. {label}
              {isCurrent && progress.tone !== "current" && (
                <> · {TONE_LABEL[progress.tone]}</>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
