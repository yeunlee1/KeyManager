// KeyManager 변경: 화면과 화면 읽기 프로그램에 나오는 coss ui 영어 문구를 한국어로 바꿨다. coss ui를 다시 받으면 이 문구를 다시 적용한다.
import { Loader2Icon } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof Loader2Icon>): React.ReactElement {
  return (
    <Loader2Icon
      aria-label="불러오는 중"
      className={cn("animate-spin", className)}
      role="status"
      {...props}
    />
  );
}
