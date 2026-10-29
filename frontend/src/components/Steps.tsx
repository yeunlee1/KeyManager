// 여러 단계로 이어지는 절차(처음 설정·초대 수락·복구)에서 지금 몇 번째 단계인지 보여 주는 목록
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label={`전체 ${steps.length}단계 중 ${current + 1}단계`}>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex items-center gap-1.5" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border text-xs tabular-nums",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary",
              )}
              aria-hidden
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            <span className={cn(active ? "font-medium text-foreground" : "text-muted-foreground")}>
              {step}
              {done && <span className="sr-only"> (마침)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
