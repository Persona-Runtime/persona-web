import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
/*
 * 글꼴은 번들에 포함한다. 외부 폰트 CDN을 부르지 않는 이유: nginx 정적 번들만으로
 * 동작해야 하고(네트워크 제약), 사용자의 접속 정보를 제3자에 보내지 않기 위해서다.
 * 각 CSS는 unicode-range로 나뉘어 있어 브라우저는 화면에 실제로 쓰인 글자 구간만 받는다.
 */
import "@fontsource/ibm-plex-sans-kr/400.css";
import "@fontsource/ibm-plex-sans-kr/500.css";
import "@fontsource/ibm-plex-sans-kr/600.css";
import "@fontsource/ibm-plex-sans-kr/700.css";
import App from "./App";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
