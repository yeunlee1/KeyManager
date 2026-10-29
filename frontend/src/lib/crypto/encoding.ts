// 바이트·글자 변환 도우미: base64url(패딩 없음), UTF-8, Crockford base32(복구 키 표시용)
export type Bytes = Uint8Array<ArrayBuffer>;

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text) as Bytes;
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function b64uEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64uDecode(text: string): Bytes {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("base64url 형식이 아닙니다.");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

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

export function crockfordDecode(text: string, byteLength: number): Bytes {
  const clean = normalizeCrockford(text);
  if (clean.length !== Math.ceil((byteLength * 8) / 5)) throw new Error("글자 수가 맞지 않아요.");
  const out = new Uint8Array(byteLength);
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const char of clean) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) throw new Error("쓸 수 없는 글자가 들어 있어요.");
    value = ((value << 5) | digit) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (value >>> bits) & 0xff;
    }
  }
  if ((value & ((1 << bits) - 1)) !== 0) throw new Error("글자가 올바르지 않아요.");
  return out;
}
