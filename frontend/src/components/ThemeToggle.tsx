// 라이트(기본)·다크 화면 전환. 고른 값은 이 브라우저에만 저장한다.
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readTheme, THEME_KEY, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // 저장소를 쓸 수 없는 브라우저에서는 이번 방문 동안만 유지한다.
    }
  }, [theme]);
  const label = theme === "dark" ? "라이트 화면으로 바꾸기" : "다크 화면으로 바꾸기";
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
