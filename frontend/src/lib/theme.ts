// 라이트(기본)·다크 화면 설정을 이 브라우저에 저장하고 읽는다.
export const THEME_KEY = "km-theme";
export type Theme = "light" | "dark";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

// 첫 화면을 그리기 전에 저장된 테마를 적용한다.
export function applyStoredTheme(): void {
  document.documentElement.classList.toggle("dark", readTheme() === "dark");
}
