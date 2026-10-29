// 초대·공개키 확인·관리자 올리기·묶음·구성원·열쇠 교체·항목·비밀 제공·비활성화·열람 기록 e2e 시험
import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DataSource } from "typeorm";
import { TOTP_CLOCK } from "../src/auth/auth.service.js";
import { resetTotp } from "../src/cli/totp-reset.js";
import { ADMIN_OPERATIONS_LOCK } from "../src/vault/vault-access.service.js";
import { createTestApp } from "./setup/test-app.js";
import { loadTestEnv, truncateAccounts } from "./setup/test-db.js";
import {
  Client,
  FakeClock,
  type SignedInUser,
  acceptInvite,
  accountMaterial,
  aesBlob,
  b64u,
  createInvite,
  grant,
  rsaBlob,
  setupFirstAdmin,
  sigBlob,
  totpCode,
} from "./setup/vault-fixtures.js";

describe("금고·초대·사용자 관리", () => {
  let app: NestExpressApplication;
  let ds: DataSource;
  const clock = new FakeClock();

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(TOTP_CLOCK).useValue(clock));
    ds = app.get(DataSource);
  });

  beforeEach(async () => {
    await truncateAccounts(ds);
  });

  afterAll(async () => {
    await app.close();
  });

  const code = (user: SignedInUser) => totpCode(user.totpSecret, clock);

  async function joinAsMember(admin: SignedInUser, loginId: string): Promise<SignedInUser> {
    const { inviteId, token } = await createInvite(admin, clock, { loginId });
    const member = await acceptInvite(app, token, loginId, clock);
    await admin.client.post(`/invites/${inviteId}/verify`, { trustRecordEnc: aesBlob(200) }).expect(204);
    return member;
  }

  async function createGroup(admin: SignedInUser, extra: ReturnType<typeof grant>[] = []): Promise<string> {
    const id = randomUUID();
    await admin.client
      .post("/vault/groups", { id, nameEnc: aesBlob(), accesses: [grant(admin.material.id, "edit", true), ...extra] })
      .expect(201);
    return id;
  }

  function item(groupId: string | null, keyGeneration: number | null = groupId ? 1 : null) {
    return { id: randomUUID(), groupId, keyGeneration, itemKeyEnc: aesBlob(), summaryEnc: aesBlob(300), secretEnc: aesBlob(500) };
  }

  it("초대 링크로 직원이 가입하고, 초대한 관리자가 확인하면 확인 완료가 된다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const { inviteId, token } = await createInvite(admin, clock, { loginId: "kim", role: "member", name: "김직원" });
    const lookup = await new Client(app).post("/invites/lookup", { token }).expect(200);
    expect(lookup.body).toMatchObject({ inviteId, loginId: "kim", name: "김직원", role: "member" });
    expect(lookup.body.inviter).toMatchObject({ id: admin.material.id, encPublicKey: admin.material.encPublicKey });
    expect(lookup.body).not.toHaveProperty("secretEnc");

    const member = await acceptInvite(app, token, "kim", clock);
    expect((await member.client.get("/auth/me").expect(200)).body).toMatchObject({ role: "member", status: "active" });
    await new Client(app).post("/invites/lookup", { token }).expect(404);

    const pending = await admin.client.get("/invites/pending-verification").expect(200);
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0]).toMatchObject({ inviteId, user: { id: member.material.id, loginId: "kim" } });
    expect(pending.body[0].secretEnc).toBeDefined();
    await admin.client.post(`/invites/${inviteId}/verify`, { trustRecordEnc: aesBlob(200) }).expect(204);
    expect((await admin.client.get("/invites/pending-verification").expect(200)).body).toHaveLength(0);
    const list = await admin.client.get("/invites").expect(200);
    expect(list.body[0]).toMatchObject({ id: inviteId, status: "verified" });
  });

  it("취소하거나 만료된 초대 링크는 쓸 수 없고, 직원은 초대를 만들 수 없다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const revoked = await createInvite(admin, clock, { loginId: "lee" });
    await admin.client.post(`/invites/${revoked.inviteId}/revoke`, { totpCode: code(admin) }).expect(204);
    await new Client(app).post("/invites/lookup", { token: revoked.token }).expect(404);

    const expired = await createInvite(admin, clock, { loginId: "park" });
    await ds.query("UPDATE invites SET expires_at = now() - interval '1 second' WHERE id = $1", [expired.inviteId]);
    await new Client(app).post("/invites/lookup", { token: expired.token }).expect(404);

    const member = await joinAsMember(admin, "kim");
    await member.client
      .post("/invites", { id: randomUUID(), token: b64u(32), loginId: "x", name: "x", role: "member", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), secretEnc: aesBlob(), inviterMac: b64u(32), totpCode: code(member) })
      .expect(403);
  });

  it("관리자로 초대한 사람은 확인할 때 모든 묶음 열쇠 사본이 있어야 관리자가 된다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const groupId = await createGroup(admin);
    const { inviteId, token } = await createInvite(admin, clock, { loginId: "boss", role: "admin" });
    const boss = await acceptInvite(app, token, "boss", clock);
    expect((await boss.client.get("/auth/me").expect(200)).body.role).toBe("member");
    await admin.client.post(`/invites/${inviteId}/verify`, { trustRecordEnc: aesBlob(200) }).expect(409);
    await admin.client
      .post(`/invites/${inviteId}/verify`, { trustRecordEnc: aesBlob(200), promotion: { adminGrantSig: sigBlob(), keyShares: [] }, totpCode: code(admin) })
      .expect(409);
    await admin.client
      .post(`/invites/${inviteId}/verify`, {
        trustRecordEnc: aesBlob(200),
        promotion: {
          adminGrantSig: sigBlob(),
          keyShares: [{ groupId, generation: 1, wrappedKey: rsaBlob(), shareSignature: sigBlob() }],
        },
        totpCode: code(admin),
      })
      .expect(204);
    expect((await boss.client.get("/auth/me").expect(200)).body.role).toBe("admin");
    const groups = await boss.client.get("/vault/groups").expect(200);
    expect(groups.body.map((g: { id: string }) => g.id)).toEqual([groupId]);
    expect(groups.body[0].myAccess).toMatchObject({ isMember: false, permission: "edit" });
  });

  it("묶음은 모든 관리자 사본이 있어야 만들 수 있고, 구성원만 그 묶음을 본다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    const lee = await joinAsMember(admin, "lee");
    const id = randomUUID();
    await admin.client.post("/vault/groups", { id, nameEnc: aesBlob(), accesses: [grant(kim.material.id)] }).expect(409);
    const groupId = await createGroup(admin, [grant(kim.material.id, "view")]);
    expect((await kim.client.get("/vault/groups").expect(200)).body).toHaveLength(1);
    expect((await lee.client.get("/vault/groups").expect(200)).body).toHaveLength(0);
    await kim.client.post("/vault/groups", { id: randomUUID(), nameEnc: aesBlob(), accesses: [] }).expect(403);
    const members = await admin.client.get(`/vault/groups/${groupId}/members`).expect(200);
    expect(members.body).toHaveLength(2);
    expect(members.body[0]).toHaveProperty("shareSignature");
  });

  it("보기 권한은 항목을 못 만들고, 묶음에 없는 사람은 항목·비밀을 못 받는다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    const lee = await joinAsMember(admin, "lee");
    const groupId = await createGroup(admin, [grant(kim.material.id, "view")]);
    await kim.client.post("/vault/items", item(groupId)).expect(403);
    const created = item(groupId);
    await admin.client.post("/vault/items", created).expect(201);
    expect((await kim.client.get("/vault/items").expect(200)).body).toHaveLength(1);
    expect((await lee.client.get("/vault/items").expect(200)).body).toHaveLength(0);
    await lee.client.post(`/vault/items/${created.id}/secret`, { purpose: "view", expectedRevision: 1 }).expect(403);
    await kim.client.put(`/vault/items/${created.id}`, { expectedRevision: 1, keyGeneration: 1, itemKeyEnc: aesBlob(), summaryEnc: aesBlob(), secretEnc: aesBlob(), clearRotation: false }).expect(403);
  });

  it("비밀은 비밀 요청으로만 나가고, 받을 때마다 개정과 목적을 기록한다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const personal = item(null);
    await admin.client.post("/vault/items", personal).expect(201);
    const list = await admin.client.get("/vault/items").expect(200);
    expect(list.body[0]).not.toHaveProperty("secretEnc");
    await admin.client.post(`/vault/items/${personal.id}/secret`, { purpose: "copy", expectedRevision: 2 }).expect(409);
    const secret = await admin.client.post(`/vault/items/${personal.id}/secret`, { purpose: "copy", expectedRevision: 1 }).expect(200);
    expect(secret.body).toMatchObject({ secretEnc: personal.secretEnc, revision: 1, itemKeyEnc: personal.itemKeyEnc });
    const events: { detail: { purpose: string; revision: number } }[] = await ds.query(
      "SELECT detail FROM audit_events WHERE action = 'secret_delivered' AND target_id = $1",
      [personal.id],
    );
    expect(events).toHaveLength(1);
    expect(events[0].detail).toMatchObject({ purpose: "copy", revision: 1 });
    const kim = await joinAsMember(admin, "kim");
    await kim.client.post(`/vault/items/${personal.id}/secret`, { purpose: "view", expectedRevision: 1 }).expect(403);
  });

  it("항목을 고치면 개정이 오르고, 옛 개정·옛 세대로는 고칠 수 없다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const groupId = await createGroup(admin);
    const created = item(groupId);
    await admin.client.post("/vault/items", created).expect(201);
    const body = (revision: number, keyGeneration: number) => ({ expectedRevision: revision, keyGeneration, itemKeyEnc: aesBlob(), summaryEnc: aesBlob(), secretEnc: aesBlob(), clearRotation: false });
    expect((await admin.client.put(`/vault/items/${created.id}`, body(1, 1)).expect(200)).body.revision).toBe(2);
    await admin.client.put(`/vault/items/${created.id}`, body(1, 1)).expect(409);
    await admin.client.put(`/vault/items/${created.id}`, body(2, 5)).expect(409);
    await admin.client.delete(`/vault/items/${created.id}`).expect(204);
  });

  it("직원을 묶음에서 빼면 남은 사람·항목 열쇠가 빠짐없이 새 세대로 바뀌고 교체 권장이 표시된다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    const groupId = await createGroup(admin, [grant(kim.material.id)]);
    const created = item(groupId);
    await admin.client.post("/vault/items", created).expect(201);
    const remove = (rotation: object) => admin.client.post(`/vault/groups/${groupId}/members/${kim.material.id}/remove`, { rotation });
    await admin.client.post(`/vault/groups/${groupId}/members/${kim.material.id}/remove`, {}).expect(400);
    // 빠지는 사람을 받을 사람에 넣거나, 항목 하나를 빠뜨리면 거절한다.
    await remove({ groupId, fromGeneration: 1, nameEnc: aesBlob(), accesses: [grant(admin.material.id), grant(kim.material.id)], itemKeys: [{ itemId: created.id, itemKeyEnc: aesBlob(), revision: 1 }] }).expect(409);
    await remove({ groupId, fromGeneration: 1, nameEnc: aesBlob(), accesses: [grant(admin.material.id)], itemKeys: [] }).expect(409);
    // 남아야 할 사람(관리자)의 새 사본을 빠뜨려도 거절한다. 빠뜨리면 그 사람은 옛 세대 사본만 갖게 된다.
    await remove({ groupId, fromGeneration: 1, nameEnc: aesBlob(), accesses: [], itemKeys: [{ itemId: created.id, itemKeyEnc: aesBlob(), revision: 1 }] }).expect(409);
    await remove({ groupId, fromGeneration: 1, nameEnc: aesBlob(), accesses: [grant(admin.material.id)], itemKeys: [{ itemId: created.id, itemKeyEnc: aesBlob(), revision: 1 }] }).expect(204);
    const [group] = await ds.query("SELECT generation FROM vault_groups WHERE id = $1", [groupId]);
    expect(group.generation).toBe(2);
    const [row] = await ds.query("SELECT key_generation, needs_rotation FROM vault_items WHERE id = $1", [created.id]);
    expect(row).toEqual({ key_generation: 2, needs_rotation: true });
    expect((await kim.client.get("/vault/items").expect(200)).body).toHaveLength(0);
    await remove({ groupId, fromGeneration: 1, nameEnc: aesBlob(), accesses: [grant(admin.material.id)], itemKeys: [{ itemId: created.id, itemKeyEnc: aesBlob(), revision: 1 }] }).expect(404);
  });

  it("비활성화는 그 사람이 열던 모든 묶음의 교체가 있어야 되고, 세션도 끊긴다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    const groupId = await createGroup(admin, [grant(kim.material.id)]);
    await admin.client.post(`/users/${kim.material.id}/disable`, { totpCode: code(admin), rotations: [] }).expect(409);
    await admin.client
      .post(`/users/${kim.material.id}/disable`, {
        totpCode: code(admin),
        rotations: [{ groupId, fromGeneration: 1, nameEnc: aesBlob(), accesses: [grant(admin.material.id)], itemKeys: [] }],
      })
      .expect(204);
    await kim.client.get("/auth/me").expect(401);
    const directory = await admin.client.get("/directory").expect(200);
    expect(directory.body.map((u: { id: string }) => u.id)).toEqual([admin.material.id]);
    expect(await ds.query("SELECT * FROM vault_group_access WHERE user_id = $1", [kim.material.id])).toHaveLength(0);
  });

  it("마지막 관리자는 내리거나 비활성화할 수 없고, 관리자 작업에는 본인 인증 코드가 필요하다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    await admin.client.patch(`/users/${admin.material.id}/role`, { role: "member", totpCode: code(admin), rotations: [] }).expect(409);
    await admin.client.post(`/users/${kim.material.id}/totp-reset`, { totpCode: "000000" }).expect(403);
    await admin.client.post(`/users/${kim.material.id}/totp-reset`, { totpCode: code(admin) }).expect(204);
    await kim.client.get("/auth/me").expect(401);
    const relogin = await new Client(app).post("/auth/login", { loginId: "kim", authValue: kim.material.authValue }).expect(200);
    expect(relogin.body).toEqual({ next: "enroll_totp" });
  });

  it("열람 기록은 관리자만 보고 종류로 거를 수 있다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    await kim.client.get("/audit").expect(403);
    const all = await admin.client.get("/audit").expect(200);
    expect(all.body.events.length).toBeGreaterThan(3);
    const accepted = await admin.client.get("/audit").query({ action: "invite_accepted" }).expect(200);
    expect(accepted.body.events).toHaveLength(1);
    expect(accepted.body.events[0].actorUserId).toBe(kim.material.id);
  });

  it("서버 콘솔의 2단계 인증 초기화는 대상의 세션을 끊고 다시 등록하게 한다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const env = loadTestEnv();
    const client = new pg.Client({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME });
    await client.connect();
    try {
      expect(await resetTotp(client, { loginId: "ADMIN" })).toBe(1);
    } finally {
      await client.end();
    }
    await admin.client.get("/auth/me").expect(401);
    const relogin = await new Client(app).post("/auth/login", { loginId: "admin", authValue: admin.material.authValue }).expect(200);
    expect(relogin.body).toEqual({ next: "enroll_totp" });
  });

  it("관리자 두 명이 동시에 스스로 직원이 되려 해도 관리자는 한 명 남는다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const { inviteId, token } = await createInvite(admin, clock, { loginId: "boss", role: "admin" });
    const boss = await acceptInvite(app, token, "boss", clock);
    await admin.client
      .post(`/invites/${inviteId}/verify`, { trustRecordEnc: aesBlob(200), promotion: { adminGrantSig: sigBlob(), keyShares: [] }, totpCode: code(admin) })
      .expect(204);
    const results = await Promise.all([
      admin.client.patch(`/users/${admin.material.id}/role`, { role: "member", totpCode: code(admin), rotations: [] }),
      boss.client.patch(`/users/${boss.material.id}/role`, { role: "member", totpCode: code(boss), rotations: [] }),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([204, 409]);
    const [count] = await ds.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND status = 'active'");
    expect(count.n).toBe(1);
  });

  it("묶음 만들기와 그 사람 비활성화가 동시에 와도 비활성 사용자에게 열쇠 사본이 남지 않는다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    const results = await Promise.all([
      admin.client.post("/vault/groups", { id: randomUUID(), nameEnc: aesBlob(), accesses: [grant(admin.material.id), grant(kim.material.id)] }),
      admin.client.post(`/users/${kim.material.id}/disable`, { totpCode: code(admin), rotations: [] }),
    ]);
    expect(results.filter((res) => res.status < 300)).toHaveLength(1);
    expect(results.every((res) => res.status < 500)).toBe(true);
    const [leak] = await ds.query(
      "SELECT COUNT(*)::int AS n FROM vault_group_access a JOIN users u ON u.id = a.user_id WHERE u.status = 'disabled'",
    );
    expect(leak.n).toBe(0);
  });

  it("항목 고치기와 열쇠 교체가 동시에 와도 교착 없이 한쪽만 반영되고, 옛 항목 열쇠로 덮어쓰지 않는다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    const groupId = await createGroup(admin, [grant(kim.material.id)]);
    const created = item(groupId);
    await admin.client.post("/vault/items", created).expect(201);
    const newKey = aesBlob();
    const results = await Promise.all([
      admin.client.put(`/vault/items/${created.id}`, { expectedRevision: 1, keyGeneration: 1, itemKeyEnc: newKey, summaryEnc: aesBlob(), secretEnc: aesBlob(), clearRotation: false }),
      admin.client.post(`/vault/groups/${groupId}/members/${kim.material.id}/remove`, {
        rotation: { groupId, fromGeneration: 1, nameEnc: aesBlob(), accesses: [grant(admin.material.id)], itemKeys: [{ itemId: created.id, itemKeyEnc: aesBlob(), revision: 1 }] },
      }),
    ]);
    expect(results.every((res) => res.status < 500)).toBe(true);
    expect(results.filter((res) => res.status < 300)).toHaveLength(1);
    const [row] = await ds.query("SELECT revision, key_generation, item_key_enc FROM vault_items WHERE id = $1", [created.id]);
    if (results[0].status === 200) {
      // 고치기가 이겼으면 새 항목 열쇠가 그대로 남고 세대는 그대로다.
      expect(row).toMatchObject({ revision: 2, key_generation: 1, item_key_enc: newKey });
    } else {
      expect(row).toMatchObject({ revision: 1, key_generation: 2 });
    }
  });

  // 아래 두 시험은 경합을 우연에 맡기지 않고, 별도 DB 연결로 잠금을 먼저 잡아 순서를 강제한다.
  async function holdWith(sql: string, params: unknown[] = []): Promise<pg.Client> {
    const env = loadTestEnv();
    const holder = new pg.Client({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME });
    await holder.connect();
    await holder.query("BEGIN");
    await holder.query(sql, params);
    return holder;
  }

  // 잠금을 쥔 채 요청을 보내고, 정한 시간 안에 끝나지 않는지(=그 잠금에서 기다리는지) 본 뒤 잠금을 푼다.
  // 시험이 실패해도 잠금은 반드시 풀어 뒤 시험이 줄줄이 막히지 않게 한다.
  async function expectBlockedUntilReleased(
    holder: pg.Client,
    send: () => PromiseLike<{ status: number }>,
  ): Promise<number> {
    try {
      let finished = false;
      const pending = Promise.resolve(send()).then((res) => {
        finished = true;
        return res;
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(finished).toBe(false);
      await holder.query("COMMIT");
      return (await pending).status;
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      await holder.end();
    }
  }

  it("관리자 작업(묶음 만들기·비활성화·초대·역할)은 같은 잠금을 잡아 하나씩 처리한다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    const lee = await joinAsMember(admin, "lee");
    const lock = () => holdWith("SELECT pg_advisory_xact_lock($1)", [ADMIN_OPERATIONS_LOCK]);
    // 본인 인증 코드는 요청을 보내는 순간에 만들어, 앞 요청의 코드보다 늘 뒤 구간이 되게 한다.
    const newGroupId = randomUUID();
    expect(await expectBlockedUntilReleased(await lock(), () => admin.client.post("/vault/groups", { id: newGroupId, nameEnc: aesBlob(), accesses: [grant(admin.material.id)] }))).toBe(201);
    expect(await expectBlockedUntilReleased(await lock(), () => admin.client.post(`/users/${lee.material.id}/disable`, { totpCode: code(admin), rotations: [] }))).toBe(204);
    expect(await expectBlockedUntilReleased(await lock(), () => admin.client.post("/invites", { id: randomUUID(), token: b64u(32), loginId: "park", name: "박", role: "member", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), secretEnc: aesBlob(), inviterMac: b64u(32), totpCode: code(admin) }))).toBe(201);
    expect(await expectBlockedUntilReleased(await lock(), () => admin.client.patch(`/users/${kim.material.id}/role`, { role: "admin", totpCode: code(admin), promotion: { adminGrantSig: sigBlob(), keyShares: [{ groupId: newGroupId, generation: 1, wrappedKey: rsaBlob(), shareSignature: sigBlob() }] } }))).toBe(204);
  });

  it("항목 고치기는 묶음을 먼저 잠근 뒤 항목을 잠근다(열쇠 교체와 같은 순서라 교착하지 않는다)", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const groupId = await createGroup(admin);
    const created = item(groupId);
    await admin.client.post("/vault/items", created).expect(201);
    // 다른 연결이 항목 행을 잡고 있으면 항목 고치기는 그 앞에서 기다린다. 그때 묶음 행은 이미 공유 잠금 상태여야 한다.
    const holder = await holdWith("SELECT id FROM vault_items WHERE id = $1 FOR UPDATE", [created.id]);
    let update: Promise<{ status: number }> | undefined;
    try {
      update = Promise.resolve(
        admin.client.put(`/vault/items/${created.id}`, { expectedRevision: 1, keyGeneration: 1, itemKeyEnc: aesBlob(), summaryEnc: aesBlob(), secretEnc: aesBlob(), clearRotation: false }),
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      await holder.query("SAVEPOINT probe");
      await expect(holder.query("SELECT id FROM vault_groups WHERE id = $1 FOR UPDATE NOWAIT", [groupId])).rejects.toThrow();
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      await holder.end();
    }
    expect((await update)?.status).toBe(200);
  });

  it("이미 사본이 있는 사람의 권한을 바꿀 때는 지금 세대·사본에 대한 서명만 받는다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const kim = await joinAsMember(admin, "kim");
    const groupId = await createGroup(admin, [grant(kim.material.id, "view")]);
    const members = await admin.client.get(`/vault/groups/${groupId}/members`).expect(200);
    const row = members.body.find((m: { userId: string }) => m.userId === kim.material.id);
    // 열쇠 교체 전 세대나 다른 사본에 대해 만든 서명은 거절한다.
    await admin.client
      .put(`/vault/groups/${groupId}/members/${kim.material.id}`, { permission: "edit", generation: 99, wrappedKey: row.wrappedKey, shareSignature: sigBlob() })
      .expect(409);
    await admin.client
      .put(`/vault/groups/${groupId}/members/${kim.material.id}`, { permission: "edit", generation: 1, wrappedKey: rsaBlob(), shareSignature: sigBlob() })
      .expect(409);
    await admin.client
      .put(`/vault/groups/${groupId}/members/${kim.material.id}`, { permission: "edit", generation: 1, wrappedKey: row.wrappedKey, shareSignature: sigBlob() })
      .expect(204);
  });

  it("두 관리자가 같은 아이디로 동시에 초대해도 유효한 초대는 하나만 생긴다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const { inviteId, token } = await createInvite(admin, clock, { loginId: "boss", role: "admin" });
    const boss = await acceptInvite(app, token, "boss", clock);
    await admin.client
      .post(`/invites/${inviteId}/verify`, { trustRecordEnc: aesBlob(200), promotion: { adminGrantSig: sigBlob(), keyShares: [] }, totpCode: code(admin) })
      .expect(204);
    const body = (user: SignedInUser) => ({
      id: randomUUID(),
      token: b64u(32),
      loginId: "same",
      name: "같은 사람",
      role: "member",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      secretEnc: aesBlob(),
      inviterMac: b64u(32),
      totpCode: code(user),
    });
    const results = await Promise.all([admin.client.post("/invites", body(admin)), boss.client.post("/invites", body(boss))]);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it("초대한 관리자가 비활성화되면 그 초대로는 가입할 수 없다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const { inviteId, token } = await createInvite(admin, clock, { loginId: "boss", role: "admin" });
    const boss = await acceptInvite(app, token, "boss", clock);
    await admin.client
      .post(`/invites/${inviteId}/verify`, { trustRecordEnc: aesBlob(200), promotion: { adminGrantSig: sigBlob(), keyShares: [] }, totpCode: code(admin) })
      .expect(204);
    const pending = await createInvite(boss, clock, { loginId: "kim" });
    await admin.client.post(`/users/${boss.material.id}/disable`, { totpCode: code(admin), rotations: [] }).expect(204);
    await new Client(app)
      .post("/invites/accept", { ...accountMaterial(), token: pending.token, acceptMac: b64u(32), inviterTrustRecordEnc: aesBlob(200) })
      .expect(404);
  });

  it("관리자로 올리는 초대 확인은 본인 인증 코드가 있어야 한다", async () => {
    const admin = await setupFirstAdmin(app, clock);
    const { inviteId, token } = await createInvite(admin, clock, { loginId: "boss", role: "admin" });
    await acceptInvite(app, token, "boss", clock);
    await admin.client
      .post(`/invites/${inviteId}/verify`, { trustRecordEnc: aesBlob(200), promotion: { adminGrantSig: sigBlob(), keyShares: [] } })
      .expect(403);
  });

  it("로그인하지 않으면 라이선스 API를 쓸 수 없다", async () => {
    await new Client(app).get("/items").expect(401);
    await new Client(app).get("/categories").expect(401);
  });
});
