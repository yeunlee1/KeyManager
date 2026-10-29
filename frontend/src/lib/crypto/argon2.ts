// 마스터 비밀번호를 Argon2id(hash-wasm, MIT)로 32바이트 값으로 바꾼다. 서버가 준 설정은 정한 범위 안일 때만 계산한다.
import { argon2id } from "hash-wasm";
import { type Bytes, b64uDecode, utf8 } from "./encoding";

export interface KdfParams {
  algorithm: "argon2id";
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

// RFC 9106의 두 번째 권장 설정(64MiB, 3회, 병렬 4)
export const KDF_DEFAULT: KdfParams = { algorithm: "argon2id", memoryKiB: 65536, iterations: 3, parallelism: 4 };

const isIntIn = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;

// 너무 약한 설정(오프라인 추측이 쉬워짐)과 너무 무거운 설정(기기가 멈춤)을 모두 거부한다.
export function assertKdfParams(params: KdfParams): void {
  if (
    params.algorithm !== "argon2id" ||
    !isIntIn(params.memoryKiB, 65536, 262144) ||
    !isIntIn(params.iterations, 3, 10) ||
    !isIntIn(params.parallelism, 1, 4)
  ) {
    throw new Error("안전하지 않은 비밀번호 변환 설정이라 계산하지 않았어요. 관리자에게 알려 주세요.");
  }
}

export async function deriveMaster(password: string, saltB64u: string, params: KdfParams): Promise<Bytes> {
  assertKdfParams(params);
  const salt = b64uDecode(saltB64u);
  if (salt.length !== 16) throw new Error("비밀번호 변환 소금이 올바르지 않아요.");
  // 같은 한글도 입력기에 따라 조합형·분해형이 달라질 수 있어 NFC로 맞춘다.
  const result = await argon2id({
    password: utf8(password.normalize("NFC")),
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    hashLength: 32,
    outputType: "binary",
  });
  return new Uint8Array(result);
}
