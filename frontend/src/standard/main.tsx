// 프론트 표준 견본 화면(standard.html)의 진입점. 개발 서버에서만 열리고 운영 빌드에는 들어가지 않는다
import React from "react";
import ReactDOM from "react-dom/client";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "../index.css";
import StandardPage from "./StandardPage";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* Base UI의 대화상자·팝업이 페이지 위에 겹치도록 새 쌓임 맥락을 만든다(coss ui 권장). */}
    <div className="isolate">
      <StandardPage />
    </div>
  </React.StrictMode>,
);
