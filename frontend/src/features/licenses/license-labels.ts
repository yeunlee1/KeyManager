// 라이선스 카테고리 코드의 화면 이름과 사용 상태 거르기 값
import type { StatusFilter } from "@/types/item";

const CATEGORY_LABEL: Record<string, string> = { Windows: "Windows", MS_Office: "MS Office", Hancom: "한컴오피스" };

export function categoryLabel(code: string): string {
  return CATEGORY_LABEL[code] ?? code;
}

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "assigned", label: "사용 중" },
  { value: "unassigned", label: "미사용" },
];
