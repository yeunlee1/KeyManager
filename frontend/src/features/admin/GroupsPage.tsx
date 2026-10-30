// 묶음 관리(설계서 5.3절·7절): 만들기, 이름 바꾸기, 구성원·권한, 삭제. 열쇠는 관리자 브라우저가 건네고 서버는 목록만 확인한다.
import { MoreHorizontal, Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { describeError, errorStatus } from "@/api/errors";
import { createGroup, deleteGroup, listMembers, putMember, removeMember, renameGroup, type MemberRow } from "@/api/vault";
import { StepUpDialog } from "@/components/StepUpDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toastManager } from "@/components/ui/toast";
import { encryptGroupName, type Permission } from "@/lib/crypto/vault";
import { useVault, type OpenedGroup } from "../vault/vault-context";
import { memberRemoval, newMemberShare, resignRow } from "./admin-actions";
import { buildNewGroup, type OpenGroup } from "./key-ops";

const PERMISSIONS = [
  { value: "view", label: "보기" },
  { value: "edit", label: "보기·수정" },
];

function asOpen(group: OpenedGroup): OpenGroup {
  if (group.state !== "open" || !group.keyRaw || group.name === null) throw new Error("이 묶음을 열 수 없어요. 금고 화면에서 확인을 먼저 마치세요.");
  return { id: group.id, generation: group.generation, name: group.name, keyRaw: group.keyRaw };
}

function PermissionSelect({ value, onChange, label }: { value: Permission; onChange: (value: Permission) => void; label: string }) {
  return (
    <Select items={PERMISSIONS} value={value} onValueChange={(next) => onChange(next as Permission)}>
      <SelectTrigger aria-label={label} className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {PERMISSIONS.map((entry) => (
          <SelectItem key={entry.value} value={entry.value}>
            {entry.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

function CreateGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const vault = useVault();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Record<string, Permission>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const candidates = vault.directory.filter((user) => user.status === "active" && user.role === "member");

  useEffect(() => {
    if (!open) return;
    setName("");
    setPicked({});
    setError(null);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || name.trim().length > 200) {
      setError("묶음 이름을 200자 안에서 넣으세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const group = await buildNewGroup({
        name: name.trim(),
        members: Object.entries(picked).map(([userId, permission]) => ({ userId, permission })),
        trust: vault.trust!,
        directory: vault.directory,
        me: { id: vault.me.id, signPrivateKey: vault.keys.signPrivateKey },
      });
      await createGroup(group);
      toastManager.add({ title: "묶음을 만들었어요", description: name.trim(), type: "success" });
      onOpenChange(false);
      await vault.reload();
    } catch (failure) {
      setError(describeError(failure, "묶음을 만들지 못했어요. 다시 시도하세요."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <form onSubmit={submit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>묶음 만들기</DialogTitle>
            <DialogDescription>예: 고객사 A, 사내 서버. 관리자는 모두 자동으로 열 수 있어요. 묶음 이름도 암호화해서 서버는 몰라요.</DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <Field invalid={!!error && !name.trim()}>
              <FieldLabel>묶음 이름</FieldLabel>
              <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 font-medium text-sm">구성원(직원)</legend>
              {candidates.length === 0 && <p className="text-muted-foreground text-sm">넣을 수 있는 직원이 아직 없어요.</p>}
              {candidates.map((user) => {
                const trusted = vault.trust?.known.get(user.id)?.via === "record" && !vault.trust?.changed.has(user.id);
                const checked = user.id in picked;
                return (
                  <div key={user.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={!trusted}
                        onCheckedChange={(value) =>
                          setPicked((current) => {
                            const next = { ...current };
                            if (value === true) next[user.id] = "view";
                            else delete next[user.id];
                            return next;
                          })
                        }
                      />
                      {user.name} <span className="font-mono text-muted-foreground text-xs">{user.loginId}</span>
                      {!trusted && <span className="text-muted-foreground text-xs">(안전 번호 확인 필요)</span>}
                    </Label>
                    {checked && <PermissionSelect value={picked[user.id]} onChange={(value) => setPicked((current) => ({ ...current, [user.id]: value }))} label={`${user.name} 권한`} />}
                  </div>
                );
              })}
            </fieldset>
            {error && (
              <p role="alert" className="text-destructive-foreground text-sm">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
            <Button type="submit" loading={busy}>
              만들기
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function RenameDialog({ group, onOpenChange }: { group: OpenedGroup | null; onOpenChange: (open: boolean) => void }) {
  const vault = useVault();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(group?.name ?? "");
    setError(null);
  }, [group]);
  if (!group) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || name.trim().length > 200) {
      setError("묶음 이름을 200자 안에서 넣으세요.");
      return;
    }
    setBusy(true);
    try {
      const open = asOpen(group);
      await renameGroup(group.id, { generation: open.generation, nameEnc: await encryptGroupName(open.keyRaw, open.id, open.generation, name.trim()) });
      toastManager.add({ title: "묶음 이름을 바꿨어요", type: "success" });
      onOpenChange(false);
      await vault.reload();
    } catch (failure) {
      setError(describeError(failure, "바꾸지 못했어요. 다시 시도하세요."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogPopup>
        <form onSubmit={submit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>묶음 이름 바꾸기</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <Field invalid={!!error}>
              <FieldLabel>새 이름</FieldLabel>
              <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus aria-invalid={!!error || undefined} />
              {error && <FieldError match>{error}</FieldError>}
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
            <Button type="submit" loading={busy}>
              바꾸기
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function MembersDialog({ group, onOpenChange }: { group: OpenedGroup | null; onOpenChange: (open: boolean) => void }) {
  const vault = useVault();
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addUser, setAddUser] = useState<string>("");
  const [addPermission, setAddPermission] = useState<Permission>("view");

  const load = async (groupId: string) => {
    try {
      setMembers(await listMembers(groupId));
      setError(null);
    } catch (failure) {
      setError(describeError(failure, "구성원을 불러오지 못했어요."));
    }
  };

  useEffect(() => {
    setMembers(null);
    setAddUser("");
    if (group) void load(group.id);
  }, [group]);

  if (!group) return null;

  const run = async (key: string, work: () => Promise<void>, done: string) => {
    setBusy(key);
    setError(null);
    try {
      await work();
      toastManager.add({ title: done, type: "success" });
      await vault.reload();
      await load(group.id);
    } catch (failure) {
      setError(
        errorStatus(failure) === 409
          ? `${describeError(failure, "그 사이 바뀐 내용이 있어요.")} 창을 닫았다가 다시 열어 주세요.`
          : describeError(failure, "처리하지 못했어요. 다시 시도하세요."),
      );
    } finally {
      setBusy(null);
    }
  };

  const nameOf = (row: MemberRow) => row.name ?? vault.directory.find((user) => user.id === row.userId)?.name ?? "알 수 없는 사용자";
  const memberIds = new Set((members ?? []).filter((row) => row.isMember).map((row) => row.userId));
  const addable = vault.directory.filter((user) => user.status === "active" && !memberIds.has(user.id));

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{group.name ?? "묶음"} 구성원</DialogTitle>
          <DialogDescription>직원을 빼면 묶음 열쇠를 새로 바꾸고 모든 항목 열쇠를 다시 잠가요. 관리자는 구성원에서 빠져도 관리자 권한으로 계속 열 수 있어요.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          {!members ? (
            <div className="grid gap-2" aria-busy="true" aria-label="구성원을 불러오는 중">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <ul className="divide-y">
              {members
                .slice()
                .sort((a, b) => Number(b.isMember) - Number(a.isMember) || nameOf(a).localeCompare(nameOf(b), "ko"))
                .map((row) => (
                  <li key={row.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm">
                      <span className="font-medium">{nameOf(row)}</span>
                      <span className="ms-2 inline-flex gap-1 align-middle">
                        {row.role === "admin" && <Badge variant="secondary">관리자</Badge>}
                        {!row.isMember && <Badge variant="outline">관리자 권한만</Badge>}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {row.isMember ? (
                        <>
                          <PermissionSelect
                            value={row.permission}
                            label={`${nameOf(row)} 권한`}
                            onChange={(permission) =>
                              void run(row.userId, async () => putMember(group.id, row.userId, await resignRow(vault, group.id, row, permission, true)), "권한을 바꿨어요")
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            loading={busy === `remove-${row.userId}`}
                            onClick={() =>
                              void run(
                                `remove-${row.userId}`,
                                async () => removeMember(group.id, row.userId, await memberRemoval(vault, asOpen(group), members, row)),
                                `${nameOf(row)}님을 구성원에서 뺐어요`,
                              )
                            }
                          >
                            빼기
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          loading={busy === `join-${row.userId}`}
                          onClick={() => void run(`join-${row.userId}`, async () => putMember(group.id, row.userId, await resignRow(vault, group.id, row, "edit", true)), "구성원으로 넣었어요")}
                        >
                          구성원으로 넣기
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          <div className="grid gap-2 border-t pt-4">
            <span className="font-medium text-sm">직원 넣기</span>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={addable.map((user) => ({ value: user.id, label: `${user.name} (${user.loginId})` }))}
                value={addUser || null}
                onValueChange={(value) => setAddUser(String(value ?? ""))}
              >
                <SelectTrigger aria-label="넣을 사람" className="w-64">
                  <SelectValue placeholder="사람 고르기" />
                </SelectTrigger>
                <SelectPopup>
                  {addable.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} ({user.loginId})
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <PermissionSelect value={addPermission} onChange={setAddPermission} label="넣을 사람 권한" />
              <Button
                type="button"
                disabled={!addUser}
                loading={busy === "add"}
                onClick={() => {
                  const user = vault.directory.find((entry) => entry.id === addUser);
                  if (!user) return;
                  const existing = members?.find((row) => row.userId === user.id);
                  void run(
                    "add",
                    async () =>
                      putMember(group.id, user.id, existing ? await resignRow(vault, group.id, existing, addPermission, true) : await newMemberShare(vault, asOpen(group), user, addPermission)),
                    `${user.name}님을 넣었어요`,
                  ).then(() => setAddUser(""));
                }}
              >
                넣기
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">공개키를 확인한 사람만 넣을 수 있어요(초대로 이어졌거나 안전 번호를 비교한 사람).</p>
          </div>
          {error && (
            <p role="alert" className="text-destructive-foreground text-sm">
              {error}
            </p>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>닫기</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function GroupsPage() {
  const vault = useVault();
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<OpenedGroup | null>(null);
  const [membersOf, setMembersOf] = useState<OpenedGroup | null>(null);
  const [deleting, setDeleting] = useState<OpenedGroup | null>(null);

  const groups = vault.groups.slice().sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));
  const itemCount = (groupId: string) => vault.items.filter((item) => item.row.groupId === groupId).length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl">묶음</h1>
          <p className="mt-1 text-muted-foreground text-sm">묶음 {groups.length}개 · 묶음마다 볼 사람과 권한을 정해요.</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden />
          묶음 만들기
        </Button>
      </div>
      {vault.status === "loading" && !vault.trust ? (
        <div className="grid gap-2" aria-busy="true" aria-label="묶음을 불러오는 중">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : groups.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>아직 묶음이 없어요</EmptyTitle>
            <EmptyDescription>고객사나 팀별로 묶음을 만들고 볼 사람을 넣으세요.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              첫 묶음 만들기
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="overflow-x-auto" role="region" aria-label="묶음 목록" tabIndex={0}>
          <div className="min-w-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>구성원</TableHead>
                  <TableHead>항목</TableHead>
                  <TableHead>내 상태</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">작업</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="max-w-72 truncate font-medium" title={group.name ?? undefined}>
                      {group.name ?? <span className="text-warning-foreground">열 수 없는 묶음(확인 필요)</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{group.memberCount}명</TableCell>
                    <TableCell className="tabular-nums">{itemCount(group.id)}개</TableCell>
                    <TableCell>{group.isMember ? <Badge variant="success">구성원</Badge> : <Badge variant="outline">관리자 권한</Badge>}</TableCell>
                    <TableCell>
                      <Menu>
                        <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${group.name ?? "묶음"} 작업 더 보기`} />}>
                          <MoreHorizontal />
                        </MenuTrigger>
                        <MenuPopup align="end">
                          <MenuItem disabled={group.state !== "open"} onClick={() => setMembersOf(group)}>
                            구성원·권한
                          </MenuItem>
                          <MenuItem disabled={group.state !== "open"} onClick={() => setRenaming(group)}>
                            이름 바꾸기
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem variant="destructive" onClick={() => setDeleting(group)}>
                            삭제
                          </MenuItem>
                        </MenuPopup>
                      </Menu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RenameDialog group={renaming} onOpenChange={(open) => !open && setRenaming(null)} />
      <MembersDialog group={membersOf} onOpenChange={(open) => !open && setMembersOf(null)} />
      <StepUpDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`"${deleting?.name ?? "묶음"}" 묶음을 삭제할까요?`}
        description={`묶음 안의 항목 ${deleting ? itemCount(deleting.id) : 0}개도 함께 지워지고 되돌릴 수 없어요.`}
        confirmLabel="묶음 삭제"
        destructive
        onConfirm={async (totpCode) => {
          if (!deleting) return;
          await deleteGroup(deleting.id, totpCode);
          toastManager.add({ title: "묶음을 삭제했어요", type: "success" });
          await vault.reload();
        }}
      />
    </div>
  );
}
