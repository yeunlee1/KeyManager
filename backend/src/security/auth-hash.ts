// 로그인 확인값·복구 확인값을 PBKDF2-SHA256으로 한 번 더 해시하고 일정한 시간으로 비교한다
import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

export const AUTH_HASH_ITERATIONS = 600_000;
const MAX_CONCURRENT = 4;

export interface SecretHash {
  hash: string;
  salt: string;
}

// 서버 CPU를 지키려고 PBKDF2는 동시에 네 개까지만 돌린다. 끝난 자리는 기다리던 요청에 바로 넘긴다.
let running = 0;
const waiting: (() => void)[] = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    running++;
  }
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

function derive(value: Buffer, salt: Buffer, iterations: number): Promise<Buffer> {
  return limited(() => pbkdf2Async(value, salt, iterations, 32, "sha256"));
}

export async function hashSecret(value: Buffer, iterations = AUTH_HASH_ITERATIONS): Promise<SecretHash> {
  if (value.length !== 32) throw new Error("확인값은 32바이트여야 합니다.");
  const salt = randomBytes(16);
  const hash = await derive(value, salt, iterations);
  return { hash: hash.toString("base64"), salt: salt.toString("base64") };
}

export async function verifySecret(
  value: Buffer,
  stored: SecretHash,
  iterations = AUTH_HASH_ITERATIONS,
): Promise<boolean> {
  if (value.length !== 32) return false;
  const expected = Buffer.from(stored.hash, "base64");
  const actual = await derive(value, Buffer.from(stored.salt, "base64"), iterations);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
