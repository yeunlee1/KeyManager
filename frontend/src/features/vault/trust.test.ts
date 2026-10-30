// @vitest-environment node
/// <reference types="node" />
// 신뢰 계산(buildTrust) 시험: 확인 기록·관리자 승인 서명 사슬로 확인된 사람과 관리자를 정하고, 바뀐 공개키는 믿지 않는다.
import { canonicalInput } from "@/lib/crypto/canonical";
import { b64uEncode } from "@/lib/crypto/encoding";
import { exportSpki, generateSignKeyPair, importAesKey, randomBytes, sign } from "@/lib/crypto/primitives";
import { sealTrustRecord } from "@/lib/crypto/trust";
import type { DirectoryUser, TrustRow } from "@/api/vault";
import { buildTrust } from "./trust";

interface Person {
  user: DirectoryUser;
  signPrivateKey: CryptoKey;
}

async function person(id: string, loginId: string, role: "admin" | "member" = "member"): Promise<Person> {
  const pair = await generateSignKeyPair();
  return {
    signPrivateKey: pair.privateKey,
    user: {
      id,
      loginId,
      name: loginId,
      role,
      status: "active",
      encPublicKey: b64uEncode(randomBytes(64)),
      signPublicKey: await exportSpki(pair.publicKey),
      adminGrantSig: null,
      adminGrantedBy: null,
    },
  };
}

async function grantAdmin(target: Person, granter: Person) {
  const { id, loginId, encPublicKey, signPublicKey } = target.user;
  target.user.role = "admin";
  target.user.adminGrantedBy = granter.user.id;
  target.user.adminGrantSig = await sign(granter.signPrivateKey, canonicalInput("admin-grant", [id, loginId, encPublicKey, signPublicKey]));
}

async function recordFor(accountKey: CryptoKey, ownerId: string, subject: DirectoryUser): Promise<TrustRow> {
  const recordEnc = await sealTrustRecord(accountKey, ownerId, {
    subjectId: subject.id,
    loginId: subject.loginId,
    encPublicKey: subject.encPublicKey,
    signPublicKey: subject.signPublicKey,
    method: "invite",
    verifiedAt: "2026-10-29T00:00:00.000Z",
  });
  return { subjectUserId: subject.id, recordEnc, updatedAt: "2026-10-29T00:00:00.000Z" };
}

const ids = {
  a: "00000000-0000-4000-8000-00000000000a",
  b: "00000000-0000-4000-8000-00000000000b",
  c: "00000000-0000-4000-8000-00000000000c",
  m: "00000000-0000-4000-8000-00000000000d",
};

describe("buildTrust", () => {
  it("첫 관리자는 자기 자신에서 시작해 자기가 서명한 관리자까지 확인한다", async () => {
    const a = await person(ids.a, "first", "admin");
    await grantAdmin(a, a);
    const b = await person(ids.b, "second");
    await grantAdmin(b, a);
    const accountKey = await importAesKey(randomBytes(32));
    const trust = await buildTrust({ me: a.user, accountKey, directory: [a.user, b.user], trustRows: [] });
    expect([...trust.verifiedAdmins].sort()).toEqual([ids.a, ids.b]);
    expect(trust.known.get(ids.b)?.via).toBe("admin-chain");
    expect(trust.unverifiedAdmins.size).toBe(0);
  });

  it("직원은 확인 기록이 있는 관리자에서 시작해 그 사슬만 따라가고, 서명이 틀린 관리자는 믿지 않는다", async () => {
    const a = await person(ids.a, "first", "admin");
    await grantAdmin(a, a);
    const b = await person(ids.b, "second");
    await grantAdmin(b, a);
    const fake = await person(ids.c, "fake");
    const stranger = await person(ids.m, "stranger");
    await grantAdmin(fake, stranger);
    fake.user.adminGrantedBy = ids.a;
    const me = await person("00000000-0000-4000-8000-0000000000ee", "member");
    const accountKey = await importAesKey(randomBytes(32));
    const trustRows = [await recordFor(accountKey, me.user.id, a.user)];
    const trust = await buildTrust({ me: me.user, accountKey, directory: [a.user, b.user, fake.user, me.user], trustRows });
    expect(trust.known.get(ids.a)?.via).toBe("record");
    expect([...trust.verifiedAdmins].sort()).toEqual([ids.a, ids.b]);
    expect([...trust.unverifiedAdmins]).toEqual([ids.c]);
    expect(trust.known.has(ids.c)).toBe(false);
  });

  it("확인 기록과 서버의 공개키가 다르면 그 사람을 믿지 않고 바뀐 것으로 알린다", async () => {
    const a = await person(ids.a, "first", "admin");
    await grantAdmin(a, a);
    const me = await person("00000000-0000-4000-8000-0000000000ee", "member");
    const accountKey = await importAesKey(randomBytes(32));
    const trustRows = [await recordFor(accountKey, me.user.id, a.user)];
    const swapped = { ...a.user, encPublicKey: b64uEncode(randomBytes(64)) };
    const trust = await buildTrust({ me: me.user, accountKey, directory: [swapped, me.user], trustRows });
    expect(trust.changed.has(ids.a)).toBe(true);
    expect(trust.known.has(ids.a)).toBe(false);
    expect(trust.verifiedAdmins.has(ids.a)).toBe(false);
  });
});
