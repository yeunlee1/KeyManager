// DTO의 @Transform에서 쓰는 문자열 앞뒤 공백 제거 함수 (문자열이 아니면 그대로 두어 타입 검사가 걸러내게 한다)
import type { TransformFnParams } from "class-transformer";

export function trimString({ value }: TransformFnParams): unknown {
  return typeof value === "string" ? value.trim() : value;
}
