// 복구 키·예비 코드처럼 한 번만 보여 주는 값을 기본으로 가리고, 보기·복사·파일 저장을 함께 두는 상자
import { Copy, Download, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastManager } from "@/components/ui/toast";
import { copyWithAutoClear } from "@/lib/clipboard";

const REVEAL_MS = 60_000;

interface RevealBoxProps {
  label: string;
  lines: string[];
  fileName: string;
  fileHeader: string;
}

function notifyNotCleared() {
  toastManager.add({
    title: "클립보드를 자동으로 지우지 못했어요",
    description: "붙여 넣은 뒤 다른 글자를 복사해 덮어 두세요.",
    type: "warning",
  });
}

export function RevealBox({ label, lines, fileName, fileHeader }: RevealBoxProps) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  const copy = async () => {
    try {
      await copyWithAutoClear(lines.join("\n"), notifyNotCleared);
      toastManager.add({ title: "클립보드에 복사했어요", description: `${label}: 30초 뒤 클립보드에서 지워요. 붙여 넣을 곳에 바로 넣으세요.`, type: "success" });
    } catch {
      toastManager.add({ title: "복사하지 못했어요", description: "보기를 누른 뒤 직접 옮겨 적으세요.", type: "error" });
    }
  };

  const download = () => {
    const blob = new Blob([`${fileHeader}\n\n${lines.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-sm">{label}</p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" aria-pressed={shown} onClick={() => setShown((value) => !value)}>
            {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {shown ? "가리기" : "보기"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={copy}>
            <Copy aria-hidden />
            복사
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={download}>
            <Download aria-hidden />
            파일로 저장
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-x-6 gap-y-1 font-mono text-sm sm:grid-cols-2" aria-live="polite">
        {lines.map((line, index) => (
          <span key={index} className="break-all tabular-nums">
            {shown ? line : "•".repeat(Math.min(line.length, 24))}
          </span>
        ))}
      </div>
      {!shown && <p className="mt-2 text-muted-foreground text-xs">주변에 보는 사람이 없을 때 보기를 누르세요. 1분 뒤 다시 가려요.</p>}
    </div>
  );
}
