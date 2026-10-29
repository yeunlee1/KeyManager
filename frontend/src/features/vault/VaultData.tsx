// 금고를 연 동안의 자료(묶음 열쇠·항목 요약·사람 목록·신뢰 상태)를 불러와 풀어 두는 공급자. 잠그면 화면과 함께 사라진다.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listPendingVerification, verifyInvite } from "@/api/admin";
import { describeError, errorStatus } from "@/api/errors";
import {
  createItem,
  deleteItem,
  getDirectory,
  listGroups,
  listItems,
  listTrust,
  requestSecret,
  updateItem,
  type GroupRow,
  type ItemRow,
} from "@/api/vault";
import type { UnlockedKeys } from "@/lib/crypto/account";
import {
  decryptGroupName,
  decryptItem,
  decryptSecret,
  encryptItem,
  openGroupKey,
  unwrapItemKey,
  wrapItemKey,
  type ItemKeyContext,
} from "@/lib/crypto/vault";
import { draftToContent, searchText, type ItemDraft, type ItemSecret, type ItemSummary } from "@/lib/item-types";
import type { Me } from "@/api/auth";
import { useAuth } from "../auth/auth-context";
import { verifyPendingInvite } from "../admin/key-ops";
import { buildTrust, type TrustState } from "./trust";
import { VaultContext, type OpenedGroup, type OpenedItem, type ReadyAdminInvite, type VaultState } from "./vault-context";


const EMPTY: VaultState = { status: "loading", error: null, groups: [], items: [], directory: [], trust: null, adminInvites: [], notices: [] };

function itemContext(row: Pick<ItemRow, "id" | "groupId" | "ownerUserId">, generation: number | null): ItemKeyContext {
  return row.groupId
    ? { itemId: row.id, groupId: row.groupId, generation: generation ?? 0 }
    : { itemId: row.id, userId: row.ownerUserId as string };
}

async function openGroups(rows: GroupRow[], trust: TrustState, me: Me, keys: UnlockedKeys): Promise<OpenedGroup[]> {
  return Promise.all(
    rows.map(async (row): Promise<OpenedGroup> => {
      const base = {
        id: row.id,
        generation: row.generation,
        permission: row.myAccess.permission,
        isMember: row.myAccess.isMember,
        memberCount: row.memberCount,
        sharedBy: row.myAccess.sharedBy,
      };
      const sharerKey = trust.known.get(row.myAccess.sharedBy)?.signPublicKey;
      if (!sharerKey) return { ...base, name: null, keyRaw: null, state: "unverified-sharer" };
      try {
        if (row.myAccess.generation !== row.generation) throw new Error("세대가 맞지 않아요.");
        const keyRaw = await openGroupKey({ groupId: row.id, ...row.myAccess }, { id: me.id, encPrivateKey: keys.encPrivateKey }, sharerKey);
        const name = await decryptGroupName(keyRaw, row.id, row.generation, row.nameEnc);
        return { ...base, name, keyRaw, state: "open" };
      } catch {
        return { ...base, name: null, keyRaw: null, state: "error" };
      }
    }),
  );
}

export function VaultDataProvider({ children }: { children: ReactNode }) {
  const { me, keys } = useAuth();
  if (!me || !keys) return null;
  return (
    <VaultDataInner me={me} keys={keys}>
      {children}
    </VaultDataInner>
  );
}

function VaultDataInner({ me, keys, children }: { me: Me; keys: UnlockedKeys; children: ReactNode }) {
  const [state, setState] = useState<VaultState>(EMPTY);
  const groupsRef = useRef<OpenedGroup[]>([]);
  // 불러오기가 겹치면 같은 초대를 두 번 확인하는 등 엇갈리므로 하나씩 돌린다. 도는 중에 다시 부르면 끝난 뒤 한 번 더 돌린다.
  const running = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const wrappingFor = useCallback(
    (row: Pick<ItemRow, "id" | "groupId" | "ownerUserId">, generation: number | null): { keyRaw: Uint8Array; context: ItemKeyContext } | null => {
      if (!row.groupId) return row.ownerUserId === me.id ? { keyRaw: keys.accountKeyRaw, context: itemContext(row, null) } : null;
      const group = groupsRef.current.find((item) => item.id === row.groupId);
      if (!group?.keyRaw || group.generation !== generation) return null;
      return { keyRaw: group.keyRaw, context: itemContext(row, generation) };
    },
    [me.id, keys.accountKeyRaw],
  );

  // 내가 초대한 직원은 금고를 열 때 자동으로 확인한다. 관리자 초대는 본인 인증 코드가 필요해 사용자 화면에서 마친다.
  const verifyMyInvites = useCallback(async (): Promise<{ adminInvites: ReadyAdminInvite[]; notices: string[] }> => {
    if (me.role !== "admin") return { adminInvites: [], notices: [] };
    const identity = { id: me.id, encPublicKey: me.encPublicKey, signPublicKey: me.signPublicKey, accountKey: keys.accountKey };
    const adminInvites: ReadyAdminInvite[] = [];
    const notices: string[] = [];
    for (const pending of await listPendingVerification()) {
      if (pending.user.status !== "active") continue;
      const result = await verifyPendingInvite(pending, identity);
      if (!result.ok) {
        notices.push(`${pending.name}(${pending.loginId}): ${result.reason}`);
        continue;
      }
      if (pending.role === "admin") {
        adminInvites.push({ pending, trustRecordEnc: result.trustRecordEnc });
        continue;
      }
      try {
        await verifyInvite(pending.inviteId, { trustRecordEnc: result.trustRecordEnc });
      } catch (error) {
        // 409는 다른 탭이나 앞선 불러오기가 이미 확인한 경우다.
        if (errorStatus(error) !== 409) notices.push(`${pending.name}(${pending.loginId}) 확인을 마치지 못했어요: ${describeError(error, "다시 시도하세요.")}`);
      }
    }
    return { adminInvites, notices };
  }, [me, keys.accountKey]);

  const loadOnce = useCallback(async () => {
    setState((current) => ({ ...current, status: "loading", error: null }));
    try {
      const invites = await verifyMyInvites();
      const [groupRows, itemRows, directory, trustRows] = await Promise.all([listGroups(), listItems(), getDirectory(), listTrust()]);
      const trust = await buildTrust({ me, accountKey: keys.accountKey, directory, trustRows });
      const groups = await openGroups(groupRows, trust, me, keys);
      for (const old of groupsRef.current) old.keyRaw?.fill(0);
      groupsRef.current = groups;
      const items = await Promise.all(
        itemRows.map(async (row): Promise<OpenedItem> => {
          const wrapping = wrappingFor(row, row.keyGeneration);
          if (!wrapping) return { row, summary: null, search: "" };
          try {
            const itemKey = await unwrapItemKey(row.itemKeyEnc, wrapping.keyRaw, wrapping.context);
            const summary = await decryptItem<ItemSummary>(row.summaryEnc, itemKey, row.id, row.revision);
            return { row, summary, search: searchText(summary) };
          } catch {
            return { row, summary: null, search: "" };
          }
        }),
      );
      setState({ status: "ready", error: null, groups, items, directory, trust, ...invites });
    } catch (error) {
      setState((current) => ({ ...current, status: "error", error: describeError(error, "금고를 불러오지 못했어요. 다시 시도하세요.") }));
    }
  }, [me, keys, verifyMyInvites, wrappingFor]);

  const reload = useCallback((): Promise<void> => {
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const run = (async () => {
      do {
        again.current = false;
        await loadOnce();
      } while (again.current);
    })().finally(() => {
      running.current = null;
    });
    running.current = run;
    return run;
  }, [loadOnce]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 잠그거나 로그아웃해 이 공급자가 사라지면 풀어 둔 묶음 열쇠를 지운다.
  useEffect(
    () => () => {
      for (const group of groupsRef.current) group.keyRaw?.fill(0);
      groupsRef.current = [];
    },
    [],
  );

  const canEdit = useCallback(
    (item: OpenedItem) => {
      if (!item.row.groupId) return item.row.ownerUserId === me.id;
      const group = state.groups.find((row) => row.id === item.row.groupId);
      return !!group && group.state === "open" && (group.permission === "edit" || me.role === "admin");
    },
    [me, state.groups],
  );

  const fetchSecret = useCallback(
    async (item: OpenedItem, purpose: "view" | "copy" | "edit") => {
      const response = await requestSecret(item.row.id, purpose, item.row.revision);
      const wrapping = wrappingFor(item.row, response.keyGeneration);
      if (!wrapping) throw new Error("이 항목을 열 수 없어요. 금고를 새로 불러온 뒤 다시 하세요.");
      const itemKey = await unwrapItemKey(response.itemKeyEnc, wrapping.keyRaw, wrapping.context);
      return decryptSecret<ItemSecret>(response.secretEnc, itemKey, item.row.id, response.revision);
    },
    [wrappingFor],
  );

  const saveItem = useCallback(
    async (draft: ItemDraft, target: { groupId: string | null }, existing?: OpenedItem, clearRotation = false) => {
      const groupId = existing ? existing.row.groupId : target.groupId;
      const group = groupId ? groupsRef.current.find((row) => row.id === groupId) : null;
      if (groupId && (!group || group.state !== "open")) throw new Error("이 묶음을 열 수 없어 저장하지 못했어요.");
      const id = existing?.row.id ?? crypto.randomUUID();
      const revision = existing ? existing.row.revision + 1 : 1;
      const generation = group ? group.generation : null;
      const row = { id, groupId, ownerUserId: groupId ? null : me.id };
      const wrapping = wrappingFor(row, generation);
      if (!wrapping) throw new Error("이 항목을 잠글 열쇠가 없어요. 금고를 새로 불러온 뒤 다시 하세요.");
      const { itemKeyRaw, summaryEnc, secretEnc } = await encryptItem(draftToContent(draft), id, revision);
      try {
        const itemKeyEnc = await wrapItemKey(itemKeyRaw, wrapping.keyRaw, wrapping.context);
        if (existing) {
          await updateItem(id, { expectedRevision: existing.row.revision, keyGeneration: generation, itemKeyEnc, summaryEnc, secretEnc, clearRotation });
        } else {
          await createItem({ id, groupId, keyGeneration: generation, itemKeyEnc, summaryEnc, secretEnc });
        }
      } finally {
        itemKeyRaw.fill(0);
      }
      await reload();
    },
    [me.id, wrappingFor, reload],
  );

  const removeItem = useCallback(
    async (item: OpenedItem) => {
      await deleteItem(item.row.id);
      await reload();
    },
    [reload],
  );

  const value = useMemo(
    () => ({ ...state, me, keys, reload, canEdit, fetchSecret, saveItem, removeItem }),
    [state, me, keys, reload, canEdit, fetchSecret, saveItem, removeItem],
  );
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
