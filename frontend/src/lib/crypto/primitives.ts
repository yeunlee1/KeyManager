// Web Crypto 기본 연산: 무작위 바이트, HKDF, AES-256-GCM(v1 형식), RSA-OAEP 3072(v1r), ECDSA P-256(v1s), SHA-256, HMAC-SHA256
import { type Bytes, b64uDecode, b64uEncode, utf8 } from "./encoding";

const subtle = (): SubtleCrypto => {
  if (!globalThis.crypto?.subtle) {
    throw new Error("이 주소에서는 브라우저 암호화를 쓸 수 없어요. HTTPS 주소(또는 localhost)로 접속하세요.");
  }
  return globalThis.crypto.subtle;
};

export function randomBytes(length: number): Bytes {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export async function sha256(data: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await subtle().digest("SHA-256", data as BufferSource));
}

export async function hkdf32(ikm: Uint8Array, info: string): Promise<Bytes> {
  const key = await subtle().importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: utf8(info) },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hmacSha256(key: Uint8Array, message: string): Promise<string> {
  const hmacKey = await subtle().importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64uEncode(new Uint8Array(await subtle().sign("HMAC", hmacKey, utf8(message))));
}

// 풀어 쓰는 AES 열쇠는 내보낼 수 없게 들여온다. 원래 바이트가 필요한 곳(다시 잠그기)은 호출하는 쪽이 따로 들고 있다.
export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error("열쇠 길이가 올바르지 않아요.");
  return subtle().importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<string> {
  const iv = randomBytes(12);
  const data = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(aad), tagLength: 128 },
    key,
    plaintext as BufferSource,
  );
  return `v1.${b64uEncode(iv)}.${b64uEncode(new Uint8Array(data))}`;
}

export async function aesDecrypt(key: CryptoKey, blob: string, aad: string): Promise<Bytes> {
  const parts = blob.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("암호문 형식이 아니에요.");
  const iv = b64uDecode(parts[1]);
  const data = b64uDecode(parts[2]);
  if (iv.length !== 12 || data.length < 16) throw new Error("암호문 형식이 아니에요.");
  const plain = await subtle().decrypt({ name: "AES-GCM", iv, additionalData: utf8(aad), tagLength: 128 }, key, data);
  return new Uint8Array(plain);
}

export async function generateEncKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey(
    { name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function generateSignKeyPair(): Promise<CryptoKeyPair> {
  return subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
}

export async function exportSpki(key: CryptoKey): Promise<string> {
  return b64uEncode(new Uint8Array(await subtle().exportKey("spki", key)));
}

export async function exportPkcs8(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await subtle().exportKey("pkcs8", key));
}

export async function importEncPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("pkcs8", pkcs8 as BufferSource, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
}

export async function importSignPrivateKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("pkcs8", pkcs8 as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

// 받는 사람 공개키로 작은 열쇠(32바이트)를 잠근다. label에 묶음·세대·받는 사람을 넣어 사본끼리 바꿔치기할 수 없게 한다.
export async function rsaWrap(publicKeySpki: string, raw: Uint8Array, label: string): Promise<string> {
  const key = await subtle().importKey("spki", b64uDecode(publicKeySpki), { name: "RSA-OAEP", hash: "SHA-256" }, false, [
    "encrypt",
  ]);
  const data = await subtle().encrypt({ name: "RSA-OAEP", label: utf8(label) }, key, raw as BufferSource);
  return `v1r.${b64uEncode(new Uint8Array(data))}`;
}

export async function rsaUnwrap(privateKey: CryptoKey, blob: string, label: string): Promise<Bytes> {
  if (!blob.startsWith("v1r.")) throw new Error("열쇠 사본 형식이 아니에요.");
  const plain = await subtle().decrypt({ name: "RSA-OAEP", label: utf8(label) }, privateKey, b64uDecode(blob.slice(4)));
  return new Uint8Array(plain);
}

export async function sign(privateKey: CryptoKey, message: string): Promise<string> {
  const signature = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, utf8(message));
  return `v1s.${b64uEncode(new Uint8Array(signature))}`;
}

export async function verify(publicKeySpki: string, message: string, signature: string): Promise<boolean> {
  if (!signature.startsWith("v1s.")) return false;
  const key = await subtle().importKey("spki", b64uDecode(publicKeySpki), { name: "ECDSA", namedCurve: "P-256" }, false, [
    "verify",
  ]);
  return subtle().verify({ name: "ECDSA", hash: "SHA-256" }, key, b64uDecode(signature.slice(4)), utf8(message));
}
