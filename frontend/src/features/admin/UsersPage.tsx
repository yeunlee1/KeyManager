// 사용자 관리(설계서 5절·7절): 초대, 확인 상태, 역할, 2단계 인증 초기화, 비활성화, 안전 번호 확인
import { Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  changeRole,
  createInvite,
  disableUser,
  enableUser,
  listInvites,
  listUsers,
  resetUserTotp,
  revokeInvite,
  verifyInvite,
  type InviteRow,
  type UserRow,
} from "@/api/admin";
import { describeError } from "@/api/errors";
import type { DirectoryUser } from "@/api/vault";
import { StepUpDialog } from "@/components/StepUpDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toastManager } from "@/components/ui/toast";
import { TrustBadge } from "../account/AccountPage";
import { LOGIN_ID_PATTERN } from "../auth/LoginPage";
import { SafetyNumberDialog } from "../vault/SafetyNumberDialog";
import { useVault } from "../vault/vault-context";
import { promotionFor, rotationsForUser } from "./admin-actions";
import { buildInvite } from "./key-ops";

interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  run: (totpCode: string) => Promise<void>;
  done: string;
}

const STATUS_LABEL: Record<UserRow["status"], string> = { active: "사용 중", pending_totp: "2단계 인증 등록 전", disabled: "비활성" };
const INVITE_LABEL: Record<InviteRow["status"], string> = { pending: "수락 대기", accepted: "확인 대기", verified: "확인 끝", expired: "만료", revoked: "취소" };

function InviteDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const vault = useVault();
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<{ name?: string; loginId?: string; code?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setLoginId("");
    setRole("member");
    setCode("");
    setErrors({});
    setLink(null);
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const id = loginId.trim().toLowerCase();
    const next: typeof errors = {};
    if (!name.trim() || name.trim().length > 100) next.name = "이름을 100자 안에서 넣으세요.";
    if (!LOGIN_ID_PATTERN.test(id)) next.loginId = "아이디는 영문 소문자·숫자·점·밑줄·하이픈 3~64자예요.";
    if (!/^\d{6}$/.test(code)) next.code = "인증 앱에 보이는 6자리 숫자를 넣으세요.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const invite = await buildInvite({
        loginId: id,
        name: name.trim(),
        role,
        me: { id: vault.me.id, encPublicKey: vault.me.encPublicKey, signPublicKey: vault.me.signPublicKey, accountKey: vault.keys.accountKey },
        origin: window.location.origin,
      });
      await createInvite({ ...invite.body, totpCode: code });
      setLink(invite.link);
      onCreated();
    } catch (failure) {
      setErrors({ form: describeError(failure, "초대를 만들지 못했어요. 다시 시도하세요.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        {link ? (
          <>
            <DialogHeader>
              <DialogTitle>초대 링크를 만들었어요</DialogTitle>
              <DialogDescription>이 링크는 지금만 보여요. 메신저 등으로 {name.trim()}님에게 직접 전하세요. 72시간 안에 한 번만 쓸 수 있어요.</DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-3">
              <p className="break-all rounded-lg border bg-muted/40 p-3 font-mono text-sm">{link}</p>
              <p className="text-muted-foreground text-sm">링크의 # 뒤 비밀은 서버에 보내지 않아요. 받은 사람이 가입하면 다음에 금고를 열 때 자동으로 공개키를 확인해요.</p>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>닫기</DialogClose>
              <Button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    toastManager.add({ title: "초대 링크 복사함", type: "success" });
                  } catch {
                    toastManager.add({ title: "복사하지 못했어요", description: "링크를 직접 선택해 복사하세요.", type: "error" });
                  }
                }}
              >
                <Copy aria-hidden />
                링크 복사
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="contents" noValidate>
            <DialogHeader>
              <DialogTitle>사용자 초대</DialogTitle>
              <DialogDescription>초대 링크를 만들어요. 메일은 보내지 않으니 링크를 직접 전하세요.</DialogDescription>
            </DialogHeader>
            <DialogPanel className="grid gap-4">
              <Field invalid={!!errors.name}>
                <FieldLabel>이름</FieldLabel>
                <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus aria-invalid={!!errors.name || undefined} />
                {errors.name && <FieldError match>{errors.name}</FieldError>}
              </Field>
              <Field invalid={!!errors.loginId}>
                <FieldLabel>아이디</FieldLabel>
                <Input value={loginId} onChange={(event) => setLoginId(event.target.value)} autoCapitalize="off" spellCheck={false} className="font-mono" aria-invalid={!!errors.loginId || undefined} />
                <FieldDescription>영문 소문자·숫자·점·밑줄·하이픈 3~64자. 받은 사람이 바꿀 수 없어요.</FieldDescription>
                {errors.loginId && <FieldError match>{errors.loginId}</FieldError>}
              </Field>
              <Field>
                <FieldLabel>역할</FieldLabel>
                <Select items={[{ value: "member", label: "직원" }, { value: "admin", label: "관리자" }]} value={role} onValueChange={(value) => setRole(value as "member" | "admin")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="member">직원</SelectItem>
                    <SelectItem value="admin">관리자</SelectItem>
                  </SelectPopup>
                </Select>
                <FieldDescription>관리자로 초대해도 가입 뒤 확인을 마칠 때 관리자가 돼요. 관리자는 모든 묶음을 열 수 있어요.</FieldDescription>
              </Field>
              <Field invalid={!!errors.code}>
                <FieldLabel>내 인증 코드</FieldLabel>
                <Input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="max-w-40 font-mono tabular-nums" aria-invalid={!!errors.code || undefined} />
                {errors.code && <FieldError match>{errors.code}</FieldError>}
              </Field>
              {errors.form && (
                <p role="alert" className="text-destructive-foreground text-sm">
                  {errors.form}
                </p>
              )}
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
              <Button type="submit" loading={busy}>
                초대 링크 만들기
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogPopup>
    </Dialog>
  );
}

export function UsersPage() {
  const vault = useVault();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [subject, setSubject] = useState<DirectoryUser | null>(null);

  const load = useCallback(async () => {
    try {
      const [userRows, inviteRows] = await Promise.all([listUsers(), listInvites()]);
      setUsers(userRows);
      setInvites(inviteRows);
      setLoadError(null);
    } catch (failure) {
      setLoadError(describeError(failure, "사용자 목록을 불러오지 못했어요."));
    }
  }, []);

  // 금고 자료를 다시 불러오면(초대 자동 확인 포함) 사용자·초대 목록도 다시 받는다.
  useEffect(() => {
    void load();
  }, [load, vault.trust]);

  const refreshAll = async () => {
    await Promise.all([load(), vault.reload()]);
  };

  const ask = (next: PendingAction) => setAction(next);
  const directoryOf = (userId: string) => vault.directory.find((user) => user.id === userId);
  const activeAdmins = (users ?? []).filter((user) => user.role === "admin" && user.status === "active");

  const runAction = async (code: string) => {
    if (!action) return;
    await action.run(code);
    toastManager.add({ title: action.done, type: "success" });
    await refreshAll();
  };

  const promote = (user: UserRow) => {
    const target = directoryOf(user.id);
    if (!target) return;
    ask({
      title: `${user.name}님을 관리자로 올릴까요?`,
      description: "관리자는 모든 묶음을 열 수 있어요. 지금 있는 모든 묶음의 열쇠를 이 사람에게 건네요.",
      confirmLabel: "관리자로 올리기",
      done: `${user.name}님을 관리자로 올렸어요`,
      run: async (totpCode) => changeRole(user.id, { role: "admin", totpCode, promotion: await promotionFor(vault, target) }),
    });
  };

  const demote = (user: UserRow) =>
    ask({
      title: `${user.name}님을 직원으로 내릴까요?`,
      description: "이 사람이 구성원이 아닌 묶음은 열쇠를 새로 바꿔 더는 열 수 없게 해요. 그 묶음의 항목에 비밀번호 교체 권장이 표시돼요.",
      confirmLabel: "직원으로 내리기",
      destructive: true,
      done: `${user.name}님을 직원으로 내렸어요`,
      run: async (totpCode) => changeRole(user.id, { role: "member", totpCode, rotations: await rotationsForUser(vault, user.id, true) }),
    });

  const disable = (user: UserRow) =>
    ask({
      title: `${user.name}님을 비활성화할까요?`,
      description: "로그인을 모두 끝내고, 이 사람이 열 수 있던 묶음의 열쇠를 모두 새로 바꿔요. 그 묶음의 항목에 비밀번호 교체 권장이 표시돼요.",
      confirmLabel: "비활성화",
      destructive: true,
      done: `${user.name}님을 비활성화했어요`,
      run: async (totpCode) => disableUser(user.id, { totpCode, rotations: await rotationsForUser(vault, user.id, false) }),
    });

  const enable = (user: UserRow) =>
    ask({
      title: `${user.name}님을 다시 활성화할까요?`,
      description: "다시 로그인할 수 있게 돼요. 묶음에는 다시 넣어야 해요.",
      confirmLabel: "활성화",
      done: `${user.name}님을 활성화했어요`,
      run: (totpCode) => enableUser(user.id, totpCode),
    });

  const resetTotp = (user: UserRow) =>
    ask({
      title: `${user.name}님의 2단계 인증을 초기화할까요?`,
      description: "먼저 전화나 대면으로 본인인지 확인하세요. 초기화하면 다음 로그인 때 새 휴대폰을 등록해요. 금고 열쇠와는 관계없어요.",
      confirmLabel: "초기화",
      destructive: true,
      done: `${user.name}님의 2단계 인증을 초기화했어요`,
      run: (totpCode) => resetUserTotp(user.id, totpCode),
    });

  const revoke = (invite: InviteRow) =>
    ask({
      title: `${invite.name}님 초대를 취소할까요?`,
      description: "취소하면 그 링크로 가입할 수 없어요.",
      confirmLabel: "초대 취소",
      destructive: true,
      done: "초대를 취소했어요",
      run: (totpCode) => revokeInvite(invite.id, totpCode),
    });

  const finishAdminInvite = (index: number) => {
    const ready = vault.adminInvites[index];
    if (!ready) return;
    const { pending, trustRecordEnc } = ready;
    ask({
      title: `${pending.name}님을 관리자로 지정할까요?`,
      description: "초대 링크로 공개키를 확인했어요. 지금 있는 모든 묶음의 열쇠를 이 사람에게 건네고 관리자로 올려요.",
      confirmLabel: "관리자 지정 마치기",
      done: `${pending.name}님을 관리자로 지정했어요`,
      run: async (totpCode) => {
        const target: DirectoryUser = {
          id: pending.user.id,
          loginId: pending.user.loginId,
          name: pending.name,
          role: "member",
          status: "active",
          encPublicKey: pending.user.encPublicKey,
          signPublicKey: pending.user.signPublicKey,
          adminGrantSig: null,
          adminGrantedBy: null,
        };
        const promotion = await promotionFor(vault, target, { encPublicKey: pending.user.encPublicKey, signPublicKey: pending.user.signPublicKey });
        await verifyInvite(pending.inviteId, { trustRecordEnc, promotion, totpCode });
      },
    });
  };

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl">사용자</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {users ? `전체 ${users.length}명 · 관리자 ${activeAdmins.length}명 · 비활성 ${users.filter((user) => user.status === "disabled").length}명` : "불러오는 중"}
          </p>
        </div>
        <Button type="button" onClick={() => setInviteOpen(true)}>
          <UserPlus aria-hidden />
          사용자 초대
        </Button>
      </div>

      {vault.adminInvites.length > 0 && (
        <section aria-labelledby="admin-invites" className="grid gap-3">
          <h2 id="admin-invites" className="font-heading font-semibold text-lg">
            관리자 지정 대기
          </h2>
          {vault.adminInvites.map((ready, index) => (
            <div key={ready.pending.inviteId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <span className="text-sm">
                {ready.pending.name} <span className="font-mono text-muted-foreground">{ready.pending.loginId}</span> · 가입과 공개키 확인을 마쳤어요.
              </span>
              <Button type="button" size="sm" onClick={() => finishAdminInvite(index)}>
                관리자 지정 마치기
              </Button>
            </div>
          ))}
        </section>
      )}

      {loadError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>사용자 목록을 불러오지 못했어요</EmptyTitle>
            <EmptyDescription>{loadError}</EmptyDescription>
          </EmptyHeader>
          <Button type="button" onClick={() => void load()}>
            다시 시도
          </Button>
        </Empty>
      ) : !users ? (
        <div className="grid gap-2" aria-busy="true" aria-label="사용자 목록을 불러오는 중">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto" role="region" aria-label="사용자 목록" tabIndex={0}>
          <div className="min-w-[760px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>내 확인</TableHead>
                  <TableHead>마지막 로그인</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">작업</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isMe = user.id === vault.me.id;
                  const target = directoryOf(user.id);
                  const lastAdmin = user.role === "admin" && activeAdmins.length <= 1;
                  const waiting = invites.some((invite) => invite.acceptedUserId === user.id && invite.status === "accepted");
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">
                          {user.name}
                          {isMe && <span className="ms-1 text-muted-foreground text-xs">(나)</span>}
                        </div>
                        <div className="font-mono text-muted-foreground text-xs">{user.loginId}</div>
                      </TableCell>
                      <TableCell>{user.role === "admin" ? "관리자" : "직원"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={user.status === "active" ? "success" : user.status === "disabled" ? "outline" : "warning"}>{STATUS_LABEL[user.status]}</Badge>
                          {waiting && <Badge variant="info">확인 대기</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{isMe ? <span className="text-muted-foreground text-sm">—</span> : <TrustBadge trust={vault.trust} userId={user.id} />}</TableCell>
                      <TableCell className="text-sm">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("ko-KR") : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {!isMe && (
                          <Menu>
                            <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${user.name} 작업 더 보기`} />}>
                              <MoreHorizontal />
                            </MenuTrigger>
                            <MenuPopup align="end">
                              {target && <MenuItem onClick={() => setSubject(target)}>안전 번호 비교</MenuItem>}
                              {user.status === "active" && user.role === "member" && target && <MenuItem onClick={() => promote(user)}>관리자로 올리기</MenuItem>}
                              {user.status === "active" && user.role === "admin" && !lastAdmin && <MenuItem onClick={() => demote(user)}>직원으로 내리기</MenuItem>}
                              {user.status !== "disabled" && <MenuItem onClick={() => resetTotp(user)}>2단계 인증 초기화</MenuItem>}
                              <MenuSeparator />
                              {user.status === "disabled" ? (
                                <MenuItem onClick={() => enable(user)}>다시 활성화</MenuItem>
                              ) : (
                                !lastAdmin && (
                                  <MenuItem variant="destructive" onClick={() => disable(user)}>
                                    비활성화
                                  </MenuItem>
                                )
                              )}
                            </MenuPopup>
                          </Menu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Separator />
      <section aria-labelledby="invites-title" className="grid gap-3">
        <h2 id="invites-title" className="font-heading font-semibold text-lg">
          초대
        </h2>
        {invites.length === 0 ? (
          <p className="text-muted-foreground text-sm">아직 만든 초대가 없어요.</p>
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="초대 목록" tabIndex={0}>
            <div className="min-w-[640px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>만료</TableHead>
                    <TableHead className="w-24">
                      <span className="sr-only">작업</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>
                        <div className="font-medium">{invite.name}</div>
                        <div className="font-mono text-muted-foreground text-xs">{invite.loginId}</div>
                      </TableCell>
                      <TableCell>{invite.role === "admin" ? "관리자" : "직원"}</TableCell>
                      <TableCell>
                        <Badge variant={invite.status === "verified" ? "success" : invite.status === "pending" || invite.status === "accepted" ? "info" : "outline"}>{INVITE_LABEL[invite.status]}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{new Date(invite.expiresAt).toLocaleString("ko-KR")}</TableCell>
                      <TableCell>
                        {invite.status === "pending" && invite.createdBy === vault.me.id && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => revoke(invite)}>
                            취소
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onCreated={() => void load()} />
      <StepUpDialog
        open={!!action}
        onOpenChange={(open) => !open && setAction(null)}
        title={action?.title ?? ""}
        description={action?.description ?? ""}
        confirmLabel={action?.confirmLabel ?? "확인"}
        destructive={action?.destructive}
        onConfirm={runAction}
      />
      <SafetyNumberDialog subject={subject} open={!!subject} onOpenChange={(open) => !open && setSubject(null)} />
    </div>
  );
}
