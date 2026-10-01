import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * fonts.css(생성물)가 첫 로드 CSS 예산을 지키는지 검사한다.
 *
 * 패키지 CSS를 그대로 import하던 때로 되돌아가면(woff 포함·굵기 4개) CSS가 300 kB를
 * 넘는다. 생성 스크립트를 바꾸거나 패키지를 올린 뒤에도 같은 조건이 유지돼야 한다.
 */
const stylesDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(stylesDir, "fonts.css"), "utf8");
const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);

describe("fonts.css", () => {
  test("woff2만 참조하고 woff 폴백을 넣지 않는다", () => {
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.endsWith(".woff2"))).toBe(true);
    expect(css).not.toMatch(/format\(["']woff["']\)/);
  });

  test("굵기는 400과 600 두 가지뿐이다", () => {
    const weights = new Set(
      [...css.matchAll(/font-weight:\s*(\d+)/g)].map((match) => match[1]),
    );
    expect([...weights].sort()).toEqual(["400", "600"]);
  });

  test("참조한 글꼴 파일이 설치된 패키지에 실제로 있다", () => {
    // 경로가 틀리면 Vite 빌드는 url을 그대로 남기고 런타임에 404가 난다.
    const missing = urls.filter((url) => !existsSync(resolve(stylesDir, url)));
    expect(missing).toEqual([]);
  });
});
