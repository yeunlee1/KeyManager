// 열람 기록(설계서 10절): 사람·묶음·행동·기간으로 거르기. 묶음·항목 이름은 관리자가 가진 묶음 열쇠로 풀어 보여 주고, 개인 항목은 "개인 항목"으로만 보인다.
import { useCallback, useEffect, useState } from "react";
import { listAudit, type AuditEvent } from "@/api/admin";
import { describeError } from "@/api/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useVault } from "../vault/vault-context";

const ALL = "all";

const ACTION_LABEL: Record<string, string> = {
  secret_delivered: "비밀 받음",
  vault_synced: "금고 목록 받음",
  item_created: "항목 만듦",
  item_updated: "항목 고침",
  item_deleted: "항목 삭제",
  group_created: "묶음 만듦",
  group_renamed: "묶음 이름 바꿈",
  group_deleted: "묶음 삭제",
  member_added: "구성원 넣음",
  member_updated: "구성원 권한 바꿈",
  member_removed: "구성원 뺌",
  login_ok: "로그인",
  login_failed: "로그인 실패",
  logout: "로그아웃",
  totp_failed: "인증 코드 틀림",
  totp_enrolled: "2단계 인증 등록",
  totp_enroll_failed: "2단계 인증 등록 실패",
  totp_reset: "2단계 인증 초기화",
  backup_code_used: "예비 코드 사용",
  backup_code_failed: "예비 코드 틀림",
  step_up_failed: "본인 인증 코드 틀림",
  password_changed: "비밀번호 바꿈",
  password_change_failed: "비밀번호 바꾸기 실패",
  recovery_started: "복구 시작",
  recovery_failed: "복구 실패",
  recovery_completed: "복구 마침",
  invite_created: "초대 만듦",
  invite_revoked: "초대 취소",
  invite_accepted: "초대 수락",
  invite_verified: "초대 확인",
  role_changed: "역할 바꿈",
  user_disabled: "비활성화",
  user_enabled: "활성화",
  trust_recorded: "공개키 확인 기록",
  setup_admin_created: "첫 관리자 만듦",
};

const PURPOSE_LABEL: Record<string, string> = { view: "보기", copy: "복사", edit: "고치기" };

function dayStart(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

function dayEnd(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

export function AuditPage() {
  const vault = useVault();
  const [actor, setActor] = useState<string>(ALL);
  const [group, setGroup] = useState<string>(ALL);
  const [action, setAction] = useState<string>(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useCallback(
    (before?: number) =>
      listAudit({
        actorUserId: actor === ALL ? undefined : actor,
        groupId: group === ALL ? undefined : group,
        action: action === ALL ? undefined : action,
        from: dayStart(from),
        to: dayEnd(to),
        before,
        limit: 50,
      }),
    [actor, group, action, from, to],
  );

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    query()
      .then((result) => {
        if (cancelled) return;
        setEvents(result.events);
        setNextBefore(result.nextBefore);
      })
      .catch((failure) => !cancelled && setError(describeError(failure, "열람 기록을 불러오지 못했어요.")));
    return () => {
      cancelled = true;
    };
  }, [query]);

  const more = async () => {
    if (nextBefore === null) return;
    setBusy(true);
    try {
      const result = await query(nextBefore);
      setEvents((current) => [...(current ?? []), ...result.events]);
      setNextBefore(result.nextBefore);
    } catch (failure) {
      setError(describeError(failure, "더 불러오지 못했어요."));
    } finally {
      setBusy(false);
    }
  };

  const userName = (id: string | null) => (id ? (vault.directory.find((user) => user.id === id)?.name ?? "비활성 사용자") : "—");
  const groupName = (id: string | null) => (id ? (vault.groups.find((entry) => entry.id === id)?.name ?? "지워졌거나 열 수 없는 묶음") : null);
  const target = (event: AuditEvent) => {
    if (event.targetType === "item") {
      const item = vault.items.find((entry) => entry.row.id === event.targetId);
      if (!event.groupId) return "개인 항목";
      return item?.summary?.name ? `${item.summary.name} · ${groupName(event.groupId)}` : `지워진 항목 · ${groupName(event.groupId)}`;
    }
    if (event.targetType === "group") return groupName(event.targetId);
    if (event.targetType === "user") return userName(event.targetId);
    return "—";
  };
  const filtered = actor !== ALL || group !== ALL || action !== ALL || !!from || !!to;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading font-semibold text-2xl">열람 기록</h1>
        <p className="mt-1 text-muted-foreground text-sm">누가 언제 어떤 항목의 비밀을 받았는지와 관리 작업을 보여 줘요. 실제로 봤는지·복사가 성공했는지까지는 알 수 없어요.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field>
          <FieldLabel>사람</FieldLabel>
          <Select items={[{ value: ALL, label: "모두" }, ...vault.directory.map((user) => ({ value: user.id, label: user.name }))]} value={actor} onValueChange={(value) => setActor(String(value))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value={ALL}>모두</SelectItem>
              {vault.directory.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <Field>
          <FieldLabel>묶음</FieldLabel>
          <Select items={[{ value: ALL, label: "모두" }, ...vault.groups.map((entry) => ({ value: entry.id, label: entry.name ?? "열 수 없는 묶음" }))]} value={group} onValueChange={(value) => setGroup(String(value))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value={ALL}>모두</SelectItem>
              {vault.groups.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name ?? "열 수 없는 묶음"}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <Field>
          <FieldLabel>행동</FieldLabel>
          <Select items={[{ value: ALL, label: "모두" }, ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))]} value={action} onValueChange={(value) => setAction(String(value))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value={ALL}>모두</SelectItem>
              {Object.entries(ACTION_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </Field>
        <Field>
          <FieldLabel>시작일</FieldLabel>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel>종료일</FieldLabel>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>

      {error && !events ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>열람 기록을 불러오지 못했어요</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !events ? (
        <div className="grid gap-2" aria-busy="true" aria-label="열람 기록을 불러오는 중">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{filtered ? "조건에 맞는 기록이 없어요" : "아직 기록이 없어요"}</EmptyTitle>
            {filtered && <EmptyDescription>거르기 조건을 바꿔 보세요.</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto" role="region" aria-label="열람 기록 목록" tabIndex={0}>
            <div className="min-w-[820px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시각</TableHead>
                    <TableHead>사람</TableHead>
                    <TableHead>행동</TableHead>
                    <TableHead>대상</TableHead>
                    <TableHead>결과</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const purpose = typeof event.detail?.purpose === "string" ? PURPOSE_LABEL[event.detail.purpose] : null;
                    return (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">{new Date(event.at).toLocaleString("ko-KR")}</TableCell>
                        <TableCell>{userName(event.actorUserId)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {ACTION_LABEL[event.action] ?? event.action}
                            {purpose && <Badge variant="secondary">{purpose}</Badge>}
                            {event.detail?.asAdmin === true && <Badge variant="info">관리자 열람</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-64 truncate" title={target(event) ?? undefined}>
                          {target(event)}
                        </TableCell>
                        <TableCell>{event.result === "ok" ? <Badge variant="success">성공</Badge> : <Badge variant="error">실패</Badge>}</TableCell>
                        <TableCell className="font-mono text-xs">{event.ip ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{events.length}건 보는 중</p>
            {nextBefore !== null && (
              <Button type="button" variant="outline" loading={busy} onClick={() => void more()}>
                더 보기
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
