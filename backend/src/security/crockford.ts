// 사람이 옮겨 적기 쉬운 Crockford base32(예비 코드·처음 설정 코드·복구 키 형식) 인코딩
import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function crockfordEncode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >>> bits) & 31];
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// 사람이 입력한 값을 정리한다: 대문자로, 하이픈·공백 빼기, 헷갈리는 글자(O→0, I·L→1) 바꾸기
export function normalizeCrockford(text: string): string {
  return text
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export function crockfordDecode(text: string, byteLength: number): Buffer {
  const clean = normalizeCrockford(text);
  if (clean.length !== Math.ceil((byteLength * 8) / 5)) {
    throw new Error("코드 길이가 맞지 않습니다.");
  }
  const out = Buffer.alloc(byteLength);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const char of clean) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error("코드에 쓸 수 없는 글자가 있습니다.");
    value = ((value << 5) | digit) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (value >>> bits) & 0xff;
    }
  }
  // 마지막 글자에서 남은 비트는 0이어야 한다. 아니면 다른 값을 잘못 옮겨 적은 것이다.
  if ((value & ((1 << bits) - 1)) !== 0) throw new Error("코드가 올바르지 않습니다.");
  return out;
}

// 무작위 글자 코드. 256은 32로 나누어떨어지므로 바이트를 32로 나눈 나머지가 고르게 나온다.
export function randomCrockford(length: number): string {
  let out = "";
  for (const byte of randomBytes(length)) out += ALPHABET[byte & 31];
  return out;
}
