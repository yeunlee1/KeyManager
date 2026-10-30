// 금고를 연 동안의 자료 형식과 맥락, 꺼내 쓰는 훅. 자료를 불러오고 푸는 공급자는 VaultData.tsx에 있다.
import { createContext, useContext } from "react";
import type { PendingVerification } from "@/api/admin";
import type { Me } from "@/api/auth";
import type { DirectoryUser, ItemRow } from "@/api/vault";
import type { UnlockedKeys } from "@/lib/crypto/account";
import type { Permission } from "@/lib/crypto/vault";
import type { ItemDraft, ItemSecret, ItemSummary } from "@/lib/item-types";
import type { TrustState } from "./trust";

export type GroupState = "open" | "unverified-sharer" | "error";

export interface OpenedGroup {
  id: string;
  generation: number;
  name: string | null;
  permission: Permission;
  isMember: boolean;
  memberCount: number;
  sharedBy: string;
  keyRaw: Uint8Array | null;
  state: GroupState;
}

export interface OpenedItem {
  row: ItemRow;
  summary: ItemSummary | null;
  search: string;
}

export interface ReadyAdminInvite {
  pending: PendingVerification;
  trustRecordEnc: string;
}

export interface VaultState {
  status: "loading" | "ready" | "error";
  error: string | null;
  groups: OpenedGroup[];
  items: OpenedItem[];
  directory: DirectoryUser[];
  trust: TrustState | null;
  adminInvites: ReadyAdminInvite[];
  notices: string[];
}

export interface VaultContextValue extends VaultState {
  me: Me;
  keys: UnlockedKeys;
  reload: () => Promise<void>;
  canEdit: (item: OpenedItem) => boolean;
  fetchSecret: (item: OpenedItem, purpose: "view" | "copy" | "edit") => Promise<ItemSecret>;
  saveItem: (draft: ItemDraft, target: { groupId: string | null }, existing?: OpenedItem, clearRotation?: boolean) => Promise<void>;
  removeItem: (item: OpenedItem) => Promise<void>;
}

export const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext);
  if (!value) throw new Error("useVault는 VaultDataProvider 안에서만 쓸 수 있어요.");
  return value;
}
