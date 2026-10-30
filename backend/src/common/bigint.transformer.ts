// PostgreSQL bigint(문자열로 읽힘)를 숫자로 바꾸는 TypeORM 변환기. 안전한 정수 범위 안의 값(시간 구간 번호 등)에만 쓴다.
import type { ValueTransformer } from "typeorm";

export const bigintToNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
