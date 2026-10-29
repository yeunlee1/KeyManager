// @vitest-environment node
/// <reference types="node" />
// 브라우저 암호 모듈(Argon2id·HKDF·AES-GCM·RSA-OAEP·ECDSA·서명 입력·복구 키·계정·금고)의 단위 시험. Node의 Web Crypto로 돈다.
import { argon2Sync, createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  changePasswordMaterial,
  createAccount,
  loginValues,
  newRecoveryMaterial,
  openWithRecovery,
  parseRecoveryKey,
  unlockAccount,
} from "./account";
import { assertKdfParams, deriveMaster, KDF_DEFAULT } from "./argon2";
import { canonicalInput, safetyNumber } from "./canonical";
import { b64uDecode, b64uEncode, utf8 } from "./encoding";
import { aesDecrypt, aesEncrypt, importAesKey, randomBytes } from "./primitives";
import { inviteMac } from "./trust";
import {
  decryptItem,
  decryptSecret,
  encryptItem,
  generateGroupKey,
  openGroupKey,
  shareGroupKey,
  unwrapItemKey,
  wrapItemKey,
} from "./vault";

const RFC9106_ARGON2ID = "0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659";

describe("Argon2id", () => {
  it("시험 도구(Node 내장 argon2)가 RFC 9106 시험 벡터를 재현한다", () => {
    const tag = argon2Sync("argon2id", {
      message: Buffer.alloc(32, 1),
      nonce: Buffer.alloc(16, 2),
      secret: Buffer.alloc(8, 3),
      associatedData: Buffer.alloc(12, 4),
      parallelism: 4,
      tagLength: 32,
      memory: 32,
      passes: 3,
    });
    expect(tag.toString("hex")).toBe(RFC9106_ARGON2ID);
  });

  it("hash-wasm 결과가 우리 설정에서 Node 내장 구현과 같다", async () => {
    const salt = randomBytes(16);
    const password = "회사 비밀번호 2026 !";
    const ours = await deriveMaster(password, b64uEncode(salt), KDF_DEFAULT);
    const reference = argon2Sync("argon2id", {
      message: Buffer.from(password.normalize("NFC"), "utf8"),
      nonce: Buffer.from(salt),
      parallelism: 4,
      tagLength: 32,
      memory: 65536,
      passes: 3,
    });
    expect(Buffer.from(ours).toString("hex")).toBe(reference.toString("hex"));
  }, 30_000);

  it("조합형·분해형 한글을 같은 비밀번호로 본다(NFC)", async () => {
    const salt = b64uEncode(randomBytes(16));
    const composed = await deriveMaster("가나다라마바사아자", salt, KDF_DEFAULT);
    const decomposed = await deriveMaster("가나다라마바사아자".normalize("NFD"), salt, KDF_DEFAULT);
    expect(b64uEncode(composed)).toBe(b64uEncode(decomposed));
  }, 30_000);

  it("너무 약하거나 무거운 설정은 계산하지 않는다", () => {
    expect(() => assertKdfParams({ ...KDF_DEFAULT, memoryKiB: 1024 })).toThrow();
    expect(() => assertKdfParams({ ...KDF_DEFAULT, iterations: 2 })).toThrow();
    expect(() => assertKdfParams({ ...KDF_DEFAULT, parallelism: 8 })).toThrow();
    expect(() => assertKdfParams({ ...KDF_DEFAULT, memoryKiB: 1_048_576 })).toThrow();
    expect(() => assertKdfParams({ ...KDF_DEFAULT, algorithm: "pbkdf2" } as never)).toThrow();
    expect(() => assertKdfParams(KDF_DEFAULT)).not.toThrow();
  });
});

describe("AES-GCM 암호문", () => {
  it("같은 열쇠·문맥이면 풀리고, 한 바이트 위조·다른 문맥·다른 열쇠면 풀리지 않는다", async () => {
    const key = await importAesKey(randomBytes(32));
    const other = await importAesKey(randomBytes(32));
    const blob = await aesEncrypt(key, utf8("비밀"), "km:v1:item-secret:a:r1");
    expect(blob).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/);
    expect(new TextDecoder().decode(await aesDecrypt(key, blob, "km:v1:item-secret:a:r1"))).toBe("비밀");
    const [v, iv, data] = blob.split(".");
    const bytes = b64uDecode(data);
    bytes[0] ^= 1;
    await expect(aesDecrypt(key, `${v}.${iv}.${b64uEncode(bytes)}`, "km:v1:item-secret:a:r1")).rejects.toThrow();
    await expect(aesDecrypt(key, blob, "km:v1:item-summary:a:r1")).rejects.toThrow();
    await expect(aesDecrypt(other, blob, "km:v1:item-secret:a:r1")).rejects.toThrow();
  });

  it("매번 새 IV를 쓴다", async () => {
    const key = await importAesKey(randomBytes(32));
    const ivs = new Set<string>();
    for (let i = 0; i < 50; i++) ivs.add((await aesEncrypt(key, utf8("x"), "c")).split(".")[1]);
    expect(ivs.size).toBe(50);
  });
});

describe("서명·MAC 입력 형식과 안전 번호", () => {
  it("목적 줄 아래에 값을 한 줄씩 잇고, 줄 바꿈이 든 값은 받지 않는다", () => {
    expect(canonicalInput("admin-grant", ["u1", "hong", "AAA", "BBB"])).toBe("km:v1:admin-grant\nu1\nhong\nAAA\nBBB");
    expect(() => canonicalInput("admin-grant", ["a\nb"])).toThrow();
  });

  it("안전 번호는 두 사람이 어느 쪽에서 계산해도 같고, 정한 규칙(SHA-256 앞 30바이트 → 5바이트씩 % 100000)을 따른다", async () => {
    const a = { id: "11111111-1111-4111-8111-111111111111", encPublicKey: "ENC_A", signPublicKey: "SIG_A" };
    const b = { id: "22222222-2222-4222-8222-222222222222", encPublicKey: "ENC_B", signPublicKey: "SIG_B" };
    const fromA = await safetyNumber(a, b);
    const fromB = await safetyNumber(b, a);
    expect(fromA).toBe(fromB);
    const digest = createHash("sha256")
      .update(`km:v1:safety-number\n${a.id}\nENC_A\nSIG_A\n${b.id}\nENC_B\nSIG_B`, "utf8")
      .digest();
    const expected = Array.from({ length: 6 }, (_, i) =>
      String(Number(digest.readUIntBE(i * 5, 5) % 100000)).padStart(5, "0"),
    ).join(" ");
    expect(fromA).toBe(expected);
  });

  it("초대 MAC은 정한 입력 형식의 HMAC-SHA256이다", async () => {
    const secret = randomBytes(32);
    const values = ["inv", "admin", "kim", b64uEncode(utf8("김직원")), "member", "2026-11-01T00:00:00.000Z", "E", "S"];
    const mac = await inviteMac(secret, "invite-offer", values);
    const expected = createHmac("sha256", Buffer.from(secret))
      .update(`km:v1:invite-offer\n${values.join("\n")}`, "utf8")
      .digest("base64url");
    expect(mac).toBe(expected);
  });
});

describe("계정 열쇠·복구 키", () => {
  it("계정을 만들고 같은 비밀번호로 열면 같은 계정 열쇠·개인키가 나온다", async () => {
    const userId = crypto.randomUUID();
    const created = await createAccount("튼튼한 마스터 비밀번호 2026", userId);
    expect(created.material.authValue).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.material.encPrivateKey).toMatch(/^v1\./);
    const login = await loginValues("튼튼한 마스터 비밀번호 2026", created.material.kdfSalt, created.material.kdfParams);
    expect(login.authValue).toBe(created.material.authValue);
    const keys = await unlockAccount(created.material, login.masterWrapKey);
    expect(keys.accountKeyRaw).toEqual(created.keys.accountKeyRaw);
    const wrong = await loginValues("틀린 비밀번호입니다 2026", created.material.kdfSalt, created.material.kdfParams);
    await expect(unlockAccount(created.material, wrong.masterWrapKey)).rejects.toThrow();
  }, 60_000);

  it("복구 키 글자는 오타를 검사값으로 잡고, 복구 키로 계정 열쇠를 꺼낼 수 있다", async () => {
    const userId = crypto.randomUUID();
    const created = await createAccount("튼튼한 마스터 비밀번호 2026", userId);
    expect(created.recoveryKey).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
    const typo = created.recoveryKey.replace(/^(.)/, (c) => (c === "A" ? "B" : "A"));
    await expect(parseRecoveryKey(typo)).rejects.toThrow();
    const parsed = await parseRecoveryKey(created.recoveryKey.toLowerCase().replace(/-/g, " "));
    expect(parsed.recoveryAuthValue).toBe(created.material.recoveryAuthValue);
    const accountKeyRaw = await openWithRecovery(created.material.accountKeyRecovery, parsed.recoveryWrapKey, userId);
    expect(accountKeyRaw).toEqual(created.keys.accountKeyRaw);
    const renewed = await newRecoveryMaterial(accountKeyRaw, userId);
    expect(renewed.recoveryKey).not.toBe(created.recoveryKey);
  }, 60_000);

  it("비밀번호를 바꾸면 새 비밀번호로만 같은 계정 열쇠가 열린다", async () => {
    const userId = crypto.randomUUID();
    const created = await createAccount("처음 마스터 비밀번호 2026", userId);
    const next = await changePasswordMaterial(created.keys.accountKeyRaw, "새로운 마스터 비밀번호 2027", userId);
    const login = await loginValues("새로운 마스터 비밀번호 2027", next.kdfSalt, next.kdfParams);
    expect(login.authValue).toBe(next.authValue);
    const keys = await unlockAccount({ ...created.material, ...next }, login.masterWrapKey);
    expect(keys.accountKeyRaw).toEqual(created.keys.accountKeyRaw);
  }, 60_000);
});

describe("묶음 열쇠·항목", () => {
  it("관리자가 서명해 건넨 묶음 열쇠는 받는 사람만 열고, 서명·세대·받는 사람이 다르면 거부한다", async () => {
    const admin = await createAccount("관리자 마스터 비밀번호 2026", crypto.randomUUID());
    const member = await createAccount("직원 마스터 비밀번호 2026", crypto.randomUUID());
    const groupId = crypto.randomUUID();
    const groupKey = generateGroupKey();
    const share = await shareGroupKey(groupKey, {
      groupId,
      generation: 1,
      recipient: { id: member.material.id, encPublicKey: member.material.encPublicKey },
      sharer: { id: admin.material.id, signPrivateKey: admin.keys.signPrivateKey },
      permission: "edit",
      isMember: true,
    });
    const opened = await openGroupKey(
      { ...share, groupId, generation: 1, sharedBy: admin.material.id, permission: "edit", isMember: true },
      { id: member.material.id, encPrivateKey: member.keys.encPrivateKey },
      admin.material.signPublicKey,
    );
    expect(opened).toEqual(groupKey);
    await expect(
      openGroupKey(
        { ...share, groupId, generation: 2, sharedBy: admin.material.id, permission: "edit", isMember: true },
        { id: member.material.id, encPrivateKey: member.keys.encPrivateKey },
        admin.material.signPublicKey,
      ),
    ).rejects.toThrow();
    await expect(
      openGroupKey(
        { ...share, groupId, generation: 1, sharedBy: admin.material.id, permission: "view", isMember: true },
        { id: member.material.id, encPrivateKey: member.keys.encPrivateKey },
        admin.material.signPublicKey,
      ),
    ).rejects.toThrow();
    await expect(
      openGroupKey(
        { ...share, groupId, generation: 1, sharedBy: member.material.id, permission: "edit", isMember: true },
        { id: member.material.id, encPrivateKey: member.keys.encPrivateKey },
        member.material.signPublicKey,
      ),
    ).rejects.toThrow();
  }, 120_000);

  it("항목은 개정이 들어간 문맥으로 잠기고, 고칠 때마다 새 항목 열쇠를 쓴다", async () => {
    const groupKey = generateGroupKey();
    const itemId = crypto.randomUUID();
    const groupId = crypto.randomUUID();
    const summary = { type: "remote", name: "고객사 A 서버", host: "10.0.0.5", username: "admin" };
    const secret = { password: "S3cret!", note: "가".repeat(10000) };
    const first = await encryptItem({ summary, secret }, itemId, 1);
    const wrapped = await wrapItemKey(first.itemKeyRaw, groupKey, { itemId, groupId, generation: 1 });
    const itemKey = await unwrapItemKey(wrapped, groupKey, { itemId, groupId, generation: 1 });
    expect(await decryptItem(first.summaryEnc, itemKey, itemId, 1)).toEqual(summary);
    expect(await decryptSecret(first.secretEnc, itemKey, itemId, 1)).toEqual(secret);
    await expect(decryptItem(first.summaryEnc, itemKey, itemId, 2)).rejects.toThrow();
    await expect(unwrapItemKey(wrapped, groupKey, { itemId, groupId, generation: 2 })).rejects.toThrow();
    const second = await encryptItem({ summary, secret }, itemId, 2);
    expect(b64uEncode(second.itemKeyRaw)).not.toBe(b64uEncode(first.itemKeyRaw));
    // 옛 항목 열쇠를 가진 사람은 고친 뒤의 내용을 풀 수 없다(짝 검토 3).
    await expect(decryptSecret(second.secretEnc, itemKey, itemId, 2)).rejects.toThrow();
    expect(first.secretEnc.length).toBeLessThanOrEqual(48000);
  });

  it("정한 크기보다 큰 내용은 암호화하지 않는다", async () => {
    await expect(
      encryptItem({ summary: { name: "x" }, secret: { note: "가".repeat(12000) } }, crypto.randomUUID(), 1),
    ).rejects.toThrow();
  });
});
