// IBM Plex Sans KR의 @font-face CSS를 굵기 400·600, woff2 전용으로 생성한다.
//
// 왜 직접 생성하나: @fontsource/ibm-plex-sans-kr의 굵기별 CSS는 한글 서브셋(~94개)마다
// woff2와 woff를 함께 적은 @font-face를 담는다. 굵기 4개를 그대로 import하면 CSS만 331 kB
// (gzip 137 kB)가 되고, 이 CSS는 글꼴 파일과 달리 첫 로드마다 통째로 받는다. woff2는 대상
// 브라우저가 모두 지원하므로 woff 줄을 빼고, 굵기는 본문(400)과 강조(600) 둘만 둔다.
//
// 입력: node_modules/@fontsource/ibm-plex-sans-kr/{400,600}.css (패키지 버전은 lockfile이 고정)
// 출력: src/styles/fonts.css — 생성물이므로 손으로 고치지 않는다. 다시 만들 때는
//       `npm run fonts:generate`(생성 + prettier)를 쓴다.
// 실패: 입력 CSS 형식이 예상과 달라 woff2 src를 찾지 못하면 빈 파일을 쓰지 않고 멈춘다.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WEIGHTS = [400, 600];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(root, "node_modules/@fontsource/ibm-plex-sans-kr");
const outputFile = join(root, "src/styles/fonts.css");

// 출력 CSS 위치 기준 상대 경로. Vite가 이 url()을 따라가 실제로 참조된 woff2만 번들에 복사한다.
const filesUrl = relative(dirname(outputFile), join(packageDir, "files"))
  .split("\\")
  .join("/");

const FACE_PATTERN = /@font-face\s*\{[^}]*\}/g;
const WOFF2_PATTERN = /url\(\.\/files\/([^)]+\.woff2)\)\s*format\('woff2'\)/;

const faces = [];
for (const weight of WEIGHTS) {
  const css = readFileSync(join(packageDir, `${weight}.css`), "utf8");
  const blocks = css.match(FACE_PATTERN) ?? [];
  if (blocks.length === 0) {
    throw new Error(`${weight}.css에서 @font-face를 찾지 못했습니다`);
  }
  for (const block of blocks) {
    const woff2 = block.match(WOFF2_PATTERN);
    if (woff2 === null) {
      throw new Error(`woff2 src가 없는 @font-face가 있습니다 (${weight})`);
    }
    // src 한 줄만 woff2로 바꾸고 나머지(unicode-range·font-display 등)는 패키지 값을 그대로 둔다.
    faces.push(
      block.replace(
        /src:[^;]*;/,
        `src: url(${filesUrl}/${woff2[1]}) format("woff2");`,
      ),
    );
  }
}

const header = `/*
 * 생성물 — 손으로 고치지 않는다. scripts/generate-font-css.mjs가 만든다.
 * IBM Plex Sans KR(OFL-1.1, @fontsource/ibm-plex-sans-kr) 400·600, woff2 전용.
 * 굵기 500·700은 쓰지 않는다(app.css에서 600으로 통일). 브라우저는 unicode-range가
 * 맞는 서브셋 파일만 내려받는다.
 */
`;

writeFileSync(outputFile, `${header}\n${faces.join("\n\n")}\n`);
console.log(`${faces.length}개 @font-face → ${relative(root, outputFile)}`);
