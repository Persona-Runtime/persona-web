import { describe, expect, test } from "vitest";
import { ACCENT_COUNT, personaAccent, personaInitial } from "./avatar";

describe("personaAccent", () => {
  test("같은 이름은 항상 같은 색을 고른다", () => {
    expect(personaAccent("합성 모루")).toBe(personaAccent("합성 모루"));
  });

  test("앞뒤 공백만 다른 이름은 같은 색으로 본다", () => {
    // 생성 요청 전에 이름을 trim 하므로 미리보기와 생성 결과의 색이 같아야 한다.
    expect(personaAccent("  합성 모루  ")).toBe(personaAccent("합성 모루"));
  });

  test("색 인덱스는 팔레트 범위를 벗어나지 않는다", () => {
    const names = ["합성 모루", "둘", "셋", "", "🙂", "a".repeat(200)];
    for (const name of names) {
      const accent = personaAccent(name);
      expect(accent).toBeGreaterThanOrEqual(0);
      expect(accent).toBeLessThan(ACCENT_COUNT);
    }
  });

  test("다른 이름은 서로 다른 색을 고를 수 있다", () => {
    // 팔레트가 6색이라 충돌은 정상이지만, 모든 이름이 한 색으로 몰리면 해시가 고장 난 것이다.
    const accents = new Set(
      ["가", "나", "다", "라", "마", "바", "사", "아"].map(personaAccent),
    );
    expect(accents.size).toBeGreaterThan(1);
  });
});

describe("personaInitial", () => {
  test("이름의 첫 글자를 쓴다", () => {
    expect(personaInitial("합성 모루")).toBe("합");
  });

  test("이모지 이름도 깨지지 않고 한 글자로 남는다", () => {
    expect(personaInitial("🙂 캐릭터")).toBe("🙂");
  });

  test("이름이 비어 있으면 물음표로 대신한다", () => {
    expect(personaInitial("   ")).toBe("?");
  });
});
