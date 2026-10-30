// 관리자 API: 초대(만들기·취소·확인), 사용자(역할·비활성화·활성화·2단계 인증 초기화), 열람 기록. 초대받은 사람의 조회·수락도 여기 둔다.
import type { AccountMaterial } from "@/lib/crypto/account";
import { apiClient } from "./client";
import type { Rotation } from "./vault";

export type InviteStatus = "pending" | "accepted" | "verified" | "expired" | "revoked";

export interface InviteRow {
  id: string;
  loginId: string;
  name: string;
  role: "admin" | "member";
  createdBy: string;
  expiresAt: string;
  acceptedUserId: string | null;
  createdAt: string;
  status: InviteStatus;
}

export interface PendingVerification {
  inviteId: string;
  loginId: string;
  name: string;
  role: "admin" | "member";
  expiresAt: string;
  secretEnc: string;
  inviterMac: string;
  acceptMac: string;
  user: { id: string; loginId: string; status: string; encPublicKey: string; signPublicKey: string };
}

export interface InviteLookup {
  inviteId: string;
  loginId: string;
  name: string;
  role: "admin" | "member";
  expiresAt: string;
  inviterMac: string;
  inviter: { id: string; name: string; encPublicKey: string; signPublicKey: string };
}

export interface UserRow {
  id: string;
  loginId: string;
  name: string;
  role: "admin" | "member";
  status: "pending_totp" | "active" | "disabled";
  totpEnrolled: boolean;
  lastLoginAt: string | null;
  invitedBy: string | null;
  adminGrantedBy: string | null;
  createdAt: string;
}

export interface KeyShare {
  groupId: string;
  generation: number;
  wrappedKey: string;
  shareSignature: string;
}

export interface Promotion {
  adminGrantSig: string;
  keyShares: KeyShare[];
}

export interface AuditEvent {
  id: number;
  at: string;
  actorUserId: string | null;
  action: string;
  result: string;
  targetType: string | null;
  targetId: string | null;
  groupId: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
}

export const listInvites = async () => (await apiClient.get<InviteRow[]>("/invites")).data;

export const createInvite = async (body: {
  id: string;
  token: string;
  loginId: string;
  name: string;
  role: "admin" | "member";
  expiresAt: string;
  secretEnc: string;
  inviterMac: string;
  totpCode: string;
}) => {
  await apiClient.post("/invites", body);
};

export const revokeInvite = async (inviteId: string, totpCode: string) => {
  await apiClient.post(`/invites/${inviteId}/revoke`, { totpCode });
};

export const listPendingVerification = async () =>
  (await apiClient.get<PendingVerification[]>("/invites/pending-verification")).data;

export const verifyInvite = async (
  inviteId: string,
  body: { trustRecordEnc: string; promotion?: Promotion; totpCode?: string },
) => {
  await apiClient.post(`/invites/${inviteId}/verify`, body);
};

export const lookupInvite = async (token: string) =>
  (await apiClient.post<InviteLookup>("/invites/lookup", { token })).data;

export const acceptInvite = async (
  body: AccountMaterial & { token: string; acceptMac: string; inviterTrustRecordEnc: string },
) => (await apiClient.post<{ next: "enroll_totp" }>("/invites/accept", body)).data;

export const listUsers = async () => (await apiClient.get<UserRow[]>("/users")).data;

export const changeRole = async (
  userId: string,
  body: { role: "admin" | "member"; totpCode: string; promotion?: Promotion; rotations?: Rotation[] },
) => {
  await apiClient.patch(`/users/${userId}/role`, body);
};

export const disableUser = async (userId: string, body: { totpCode: string; rotations: Rotation[] }) => {
  await apiClient.post(`/users/${userId}/disable`, body);
};

export const enableUser = async (userId: string, totpCode: string) => {
  await apiClient.post(`/users/${userId}/enable`, { totpCode });
};

export const resetUserTotp = async (userId: string, totpCode: string) => {
  await apiClient.post(`/users/${userId}/totp-reset`, { totpCode });
};

export const listAudit = async (query: {
  actorUserId?: string;
  groupId?: string;
  action?: string;
  from?: string;
  to?: string;
  before?: number;
  limit?: number;
}) => (await apiClient.get<{ events: AuditEvent[]; nextBefore: number | null }>("/audit", { params: query })).data;
