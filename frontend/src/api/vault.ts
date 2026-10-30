// 금고 API(/vault, /directory, /trust): 묶음·구성원·항목·비밀 제공과 사람 목록·확인 기록
import type { Permission } from "@/lib/crypto/vault";
import { apiClient } from "./client";

export interface MyAccess {
  permission: Permission;
  isMember: boolean;
  generation: number;
  wrappedKey: string;
  sharedBy: string;
  shareSignature: string;
}

export interface GroupRow {
  id: string;
  generation: number;
  nameEnc: string;
  memberCount: number;
  myAccess: MyAccess;
}

export interface MemberRow {
  userId: string;
  loginId: string | null;
  name: string | null;
  role: "admin" | "member" | null;
  permission: Permission;
  isMember: boolean;
  generation: number;
  wrappedKey: string;
  sharedBy: string;
  shareSignature: string;
}

export interface ItemRow {
  id: string;
  groupId: string | null;
  ownerUserId: string | null;
  keyGeneration: number | null;
  itemKeyEnc: string;
  summaryEnc: string;
  revision: number;
  needsRotation: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecretResponse {
  secretEnc: string;
  revision: number;
  itemKeyEnc: string;
  keyGeneration: number | null;
}

export interface DirectoryUser {
  id: string;
  loginId: string;
  name: string;
  role: "admin" | "member";
  status: "pending_totp" | "active" | "disabled";
  encPublicKey: string;
  signPublicKey: string;
  adminGrantSig: string | null;
  adminGrantedBy: string | null;
}

export interface TrustRow {
  subjectUserId: string;
  recordEnc: string;
  updatedAt: string;
}

export interface AccessGrant {
  userId: string;
  permission: Permission;
  isMember: boolean;
  wrappedKey: string;
  shareSignature: string;
}

export interface Rotation {
  groupId: string;
  fromGeneration: number;
  nameEnc: string;
  accesses: AccessGrant[];
  itemKeys: { itemId: string; revision: number; itemKeyEnc: string }[];
}

export const listGroups = async () => (await apiClient.get<GroupRow[]>("/vault/groups")).data;

export const createGroup = async (body: { id: string; nameEnc: string; accesses: AccessGrant[] }) => {
  await apiClient.post("/vault/groups", body);
};

export const renameGroup = async (groupId: string, body: { generation: number; nameEnc: string }) => {
  await apiClient.patch(`/vault/groups/${groupId}`, body);
};

export const deleteGroup = async (groupId: string, totpCode: string) => {
  await apiClient.delete(`/vault/groups/${groupId}`, { data: { totpCode } });
};

export const listMembers = async (groupId: string) =>
  (await apiClient.get<MemberRow[]>(`/vault/groups/${groupId}/members`)).data;

export const putMember = async (
  groupId: string,
  userId: string,
  body: { permission: Permission; generation?: number; wrappedKey?: string; shareSignature: string },
) => {
  await apiClient.put(`/vault/groups/${groupId}/members/${userId}`, body);
};

export const removeMember = async (
  groupId: string,
  userId: string,
  body: { rotation?: Rotation; adminShareSignature?: string; adminShareGeneration?: number; adminShareWrappedKey?: string },
) => {
  await apiClient.post(`/vault/groups/${groupId}/members/${userId}/remove`, body);
};

export const listItems = async () => (await apiClient.get<ItemRow[]>("/vault/items")).data;

export const createItem = async (body: {
  id: string;
  groupId: string | null;
  keyGeneration: number | null;
  itemKeyEnc: string;
  summaryEnc: string;
  secretEnc: string;
}) => (await apiClient.post<{ id: string; revision: number }>("/vault/items", body)).data;

export const updateItem = async (
  itemId: string,
  body: {
    expectedRevision: number;
    keyGeneration: number | null;
    itemKeyEnc: string;
    summaryEnc: string;
    secretEnc: string;
    clearRotation: boolean;
  },
) => (await apiClient.put<{ id: string; revision: number }>(`/vault/items/${itemId}`, body)).data;

export const deleteItem = async (itemId: string) => {
  await apiClient.delete(`/vault/items/${itemId}`);
};

export const requestSecret = async (itemId: string, purpose: "view" | "copy" | "edit", expectedRevision: number) =>
  (await apiClient.post<SecretResponse>(`/vault/items/${itemId}/secret`, { purpose, expectedRevision })).data;

export const getDirectory = async () => (await apiClient.get<DirectoryUser[]>("/directory")).data;

export const listTrust = async () => (await apiClient.get<TrustRow[]>("/trust")).data;

export const saveTrust = async (subjectUserId: string, recordEnc: string) => {
  await apiClient.put(`/trust/${subjectUserId}`, { recordEnc });
};
