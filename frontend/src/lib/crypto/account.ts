// 계정 열쇠 만들기와 열기(설계서 4.1~4.3절): 마스터 비밀번호 → 로그인 확인값·마스터 잠금 열쇠, 복구 키, 암호화·서명 개인키
import { type KdfParams, KDF_DEFAULT, deriveMaster } from "./argon2";
import { type Bytes, b64uEncode, concatBytes, crockfordDecode, crockfordEncode } from "./encoding";
import {
  aesDecrypt,
  aesEncrypt,
  exportPkcs8,
  exportSpki,
  generateEncKeyPair,
  generateSignKeyPair,
  hkdf32,
  importAesKey,
  importEncPrivateKey,
  importSignPrivateKey,
  randomBytes,
  sha256,
} from "./primitives";

const AAD = {
  master: (userId: string) => `km:v1:account-key:master:${userId}`,
  recovery: (userId: string) => `km:v1:account-key:recovery:${userId}`,
  encPrivate: (userId: string) => `km:v1:private-key:enc:${userId}`,
  signPrivate: (userId: string) => `km:v1:private-key:sign:${userId}`,
};

// 서버에 올리는 계정 자료(모두 잠긴 값이거나 공개 값)
export interface AccountMaterial {
  id: string;
  kdfSalt: string;
  kdfParams: KdfParams;
  authValue: string;
  recoveryAuthValue: string;
  accountKeyMaster: string;
  accountKeyRecovery: string;
  encPublicKey: string;
  encPrivateKey: string;
  signPublicKey: string;
  signPrivateKey: string;
}

// 금고를 연 동안 메모리에만 두는 열쇠들
export interface UnlockedKeys {
  accountKeyRaw: Bytes;
  accountKey: CryptoKey;
  encPrivateKey: CryptoKey;
  signPrivateKey: CryptoKey;
}

export async function loginValues(
  password: string,
  kdfSalt: string,
  kdfParams: KdfParams,
): Promise<{ authValue: string; masterWrapKey: CryptoKey }> {
  const master = await deriveMaster(password, kdfSalt, kdfParams);
  const authValue = b64uEncode(await hkdf32(master, "km:v1:auth"));
  const masterWrapKey = await importAesKey(await hkdf32(master, "km:v1:master-wrap"));
  return { authValue, masterWrapKey };
}

// 새 마스터 비밀번호로 계정 열쇠를 다시 잠근 자료(가입·비밀번호 바꾸기·복구 완료에서 쓴다)
export async function changePasswordMaterial(accountKeyRaw: Uint8Array, password: string, userId: string) {
  const kdfSalt = b64uEncode(randomBytes(16));
  const kdfParams = { ...KDF_DEFAULT };
  const { authValue, masterWrapKey } = await loginValues(password, kdfSalt, kdfParams);
  const accountKeyMaster = await aesEncrypt(masterWrapKey, accountKeyRaw, AAD.master(userId));
  return { kdfSalt, kdfParams, authValue, accountKeyMaster };
}

async function recoveryValues(raw: Uint8Array) {
  const recoveryAuthValue = b64uEncode(await hkdf32(raw, "km:v1:recovery-auth"));
  const recoveryWrapKey = await importAesKey(await hkdf32(raw, "km:v1:recovery-wrap"));
  return { recoveryAuthValue, recoveryWrapKey };
}

function groupBy4(text: string): string {
  return text.match(/.{1,4}/g)?.join("-") ?? text;
}

// 복구 키: 무작위 30바이트 + SHA-256 앞 2바이트 검사값 = 32바이트 → Crockford 52자, 4자씩 13묶음
export async function newRecoveryMaterial(accountKeyRaw: Uint8Array, userId: string) {
  const raw = randomBytes(30);
  const check = (await sha256(raw)).slice(0, 2);
  const recoveryKey = groupBy4(crockfordEncode(concatBytes(raw, check)));
  const { recoveryAuthValue, recoveryWrapKey } = await recoveryValues(raw);
  const accountKeyRecovery = await aesEncrypt(recoveryWrapKey, accountKeyRaw, AAD.recovery(userId));
  return { recoveryKey, recoveryAuthValue, accountKeyRecovery };
}

export async function parseRecoveryKey(text: string) {
  let bytes: Bytes;
  try {
    bytes = crockfordDecode(text, 32);
  } catch {
    throw new Error("복구 키 글자 수나 글자가 맞지 않아요. 보관한 복구 키를 다시 확인해 주세요.");
  }
  const raw = bytes.slice(0, 30);
  const check = (await sha256(raw)).slice(0, 2);
  if (check[0] !== bytes[30] || check[1] !== bytes[31]) {
    throw new Error("복구 키를 잘못 옮겨 적은 것 같아요. 보관한 복구 키를 다시 확인해 주세요.");
  }
  return recoveryValues(raw);
}

export async function openWithRecovery(accountKeyRecovery: string, recoveryWrapKey: CryptoKey, userId: string): Promise<Bytes> {
  return aesDecrypt(recoveryWrapKey, accountKeyRecovery, AAD.recovery(userId));
}

export async function createAccount(password: string, userId: string) {
  const accountKeyRaw = randomBytes(32);
  const accountKey = await importAesKey(accountKeyRaw);
  const passwordPart = await changePasswordMaterial(accountKeyRaw, password, userId);
  const recovery = await newRecoveryMaterial(accountKeyRaw, userId);
  const encPair = await generateEncKeyPair();
  const signPair = await generateSignKeyPair();
  const encPkcs8 = await exportPkcs8(encPair.privateKey);
  const signPkcs8 = await exportPkcs8(signPair.privateKey);
  const material: AccountMaterial = {
    id: userId,
    ...passwordPart,
    recoveryAuthValue: recovery.recoveryAuthValue,
    accountKeyRecovery: recovery.accountKeyRecovery,
    encPublicKey: await exportSpki(encPair.publicKey),
    encPrivateKey: await aesEncrypt(accountKey, encPkcs8, AAD.encPrivate(userId)),
    signPublicKey: await exportSpki(signPair.publicKey),
    signPrivateKey: await aesEncrypt(accountKey, signPkcs8, AAD.signPrivate(userId)),
  };
  // 내보낼 수 있게 만든 개인키는 사본을 잠근 뒤 버리고, 쓸 때는 내보낼 수 없는 열쇠로 다시 들여온다.
  const keys: UnlockedKeys = {
    accountKeyRaw,
    accountKey,
    encPrivateKey: await importEncPrivateKey(encPkcs8),
    signPrivateKey: await importSignPrivateKey(signPkcs8),
  };
  encPkcs8.fill(0);
  signPkcs8.fill(0);
  return { material, recoveryKey: recovery.recoveryKey, keys };
}

export async function unlockAccount(
  me: Pick<AccountMaterial, "id" | "accountKeyMaster" | "encPrivateKey" | "signPrivateKey">,
  masterWrapKey: CryptoKey,
): Promise<UnlockedKeys> {
  const accountKeyRaw = await aesDecrypt(masterWrapKey, me.accountKeyMaster, AAD.master(me.id));
  return openAccountKeys(me, accountKeyRaw);
}

// 계정 열쇠 원래 바이트로 개인키들을 연다(복구 때는 복구 사본에서 꺼낸 계정 열쇠로 연다).
export async function openAccountKeys(
  me: Pick<AccountMaterial, "id" | "encPrivateKey" | "signPrivateKey">,
  accountKeyRaw: Bytes,
): Promise<UnlockedKeys> {
  const accountKey = await importAesKey(accountKeyRaw);
  const encPkcs8 = await aesDecrypt(accountKey, me.encPrivateKey, AAD.encPrivate(me.id));
  const signPkcs8 = await aesDecrypt(accountKey, me.signPrivateKey, AAD.signPrivate(me.id));
  const keys = {
    accountKeyRaw,
    accountKey,
    encPrivateKey: await importEncPrivateKey(encPkcs8),
    signPrivateKey: await importSignPrivateKey(signPkcs8),
  };
  encPkcs8.fill(0);
  signPkcs8.fill(0);
  return keys;
}
