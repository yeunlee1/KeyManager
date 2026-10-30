// 서버가 준 사람 목록을 그대로 믿지 않고, 내 확인 기록과 관리자 승인 서명 사슬로 확인된 사람·관리자를 정한다(설계서 4.4·4.5절).
import type { DirectoryUser, TrustRow } from "@/api/vault";
import { canonicalInput } from "@/lib/crypto/canonical";
import { verify } from "@/lib/crypto/primitives";
import { openTrustRecord, type TrustRecordBody } from "@/lib/crypto/trust";

export type KnownVia = "me" | "record" | "admin-chain";

export interface KnownKeys {
  encPublicKey: string;
  signPublicKey: string;
  via: KnownVia;
}

export interface TrustState {
  // 공개키를 믿을 수 있는 사람(나, 확인 기록과 공개키가 같은 사람, 확인된 관리자가 승인한 관리자)
  known: Map<string, KnownKeys>;
  // 확인 기록과 지금 서버의 공개키가 다른 사람. 다시 확인하기 전까지 믿지 않는다.
  changed: Set<string>;
  // 승인 서명 사슬이 내가 믿는 사람에게 닿는 관리자
  verifiedAdmins: Set<string>;
  // 서버는 관리자라고 하지만 확인되지 않은 관리자
  unverifiedAdmins: Set<string>;
  records: Map<string, TrustRecordBody>;
}

export interface BuildTrustInput {
  me: Pick<DirectoryUser, "id" | "role" | "encPublicKey" | "signPublicKey">;
  accountKey: CryptoKey;
  directory: DirectoryUser[];
  trustRows: TrustRow[];
}

export function adminGrantInput(user: Pick<DirectoryUser, "id" | "loginId" | "encPublicKey" | "signPublicKey">): string {
  return canonicalInput("admin-grant", [user.id, user.loginId, user.encPublicKey, user.signPublicKey]);
}

export async function buildTrust({ me, accountKey, directory, trustRows }: BuildTrustInput): Promise<TrustState> {
  const known = new Map<string, KnownKeys>();
  const changed = new Set<string>();
  const records = new Map<string, TrustRecordBody>();
  known.set(me.id, { encPublicKey: me.encPublicKey, signPublicKey: me.signPublicKey, via: "me" });

  const byId = new Map(directory.map((user) => [user.id, user]));
  for (const row of trustRows) {
    let body: TrustRecordBody;
    try {
      body = await openTrustRecord(accountKey, me.id, row.subjectUserId, row.recordEnc);
    } catch {
      // 내 계정 열쇠로 풀리지 않는 기록은 내가 만든 것이 아니다. 믿지 않는다.
      continue;
    }
    records.set(row.subjectUserId, body);
    const current = byId.get(row.subjectUserId);
    if (!current || row.subjectUserId === me.id) continue;
    if (current.encPublicKey === body.encPublicKey && current.signPublicKey === body.signPublicKey) {
      known.set(current.id, { encPublicKey: body.encPublicKey, signPublicKey: body.signPublicKey, via: "record" });
    } else {
      changed.add(current.id);
    }
  }

  const candidates = directory.filter((user) => user.role === "admin" && user.status === "active" && !changed.has(user.id));
  const verifiedAdmins = new Set<string>();
  if (me.role === "admin") verifiedAdmins.add(me.id);
  // 확인된 관리자가 서명한 승인만 따라간다. 스스로 서명한 첫 관리자는 내가 이미 믿는 사람일 때만 받아들인다.
  let grew = true;
  while (grew) {
    grew = false;
    for (const user of candidates) {
      if (verifiedAdmins.has(user.id) || !user.adminGrantSig || !user.adminGrantedBy) continue;
      const selfSigned = user.adminGrantedBy === user.id;
      const granterKey = selfSigned
        ? known.get(user.id)?.signPublicKey
        : verifiedAdmins.has(user.adminGrantedBy)
          ? known.get(user.adminGrantedBy)?.signPublicKey
          : undefined;
      if (!granterKey) continue;
      if (await verify(granterKey, adminGrantInput(user), user.adminGrantSig)) {
        verifiedAdmins.add(user.id);
        if (!known.has(user.id)) {
          known.set(user.id, { encPublicKey: user.encPublicKey, signPublicKey: user.signPublicKey, via: "admin-chain" });
        }
        grew = true;
      }
    }
  }
  const unverifiedAdmins = new Set(
    directory.filter((user) => user.role === "admin" && user.status === "active" && !verifiedAdmins.has(user.id)).map((user) => user.id),
  );
  return { known, changed, verifiedAdmins, unverifiedAdmins, records };
}
