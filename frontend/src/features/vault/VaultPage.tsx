// 금고 화면(설계서 7절): 개인 금고·묶음 목록, 검색, 종류 필터, 항목 표와 상세·만들기·고치기·삭제
import { Copy, FolderLock, Plus, RotateCw, SearchIcon, ShieldAlert, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { DirectoryUser } from "@/api/vault";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toastManager } from "@/components/ui/toast";
import { describeError } from "@/api/errors";
import { ITEM_KINDS, KIND_LABEL, type ItemKind } from "@/lib/item-types";
import { cn } from "@/lib/utils";
import { copyValue } from "./copy-actions";
import { ItemDetailDialog } from "./ItemDetailDialog";
import { ItemFormDialog } from "./ItemFormDialog";
import { SafetyNumberDialog } from "./SafetyNumberDialog";
import { useVault, type OpenedGroup, type OpenedItem } from "./vault-context";

const ALL = "all";
const PERSONAL = "personal";

function groupLabel(group: OpenedGroup): string {
  if (group.state === "unverified-sharer") return "확인이 필요한 묶음";
  if (group.state === "error") return "열 수 없는 묶음";
  return group.name ?? "이름 없는 묶음";
}

function address(item: OpenedItem): string | null {
  const summary = item.summary;
  if (!summary) return null;
  if (summary.url) return summary.url;
  if (summary.host) return summary.port ? `${summary.host}:${summary.port}` : summary.host;
  return null;
}

export function VaultPage() {
  const vault = useVault();
  const [scope, setScope] = useState<string>(ALL);
  const [kind, setKind] = useState<ItemKind | typeof ALL>(ALL);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<OpenedItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [form, setForm] = useState<{ open: boolean; existing: OpenedItem | null }>({ open: false, existing: null });
  const [verifyFor, setVerifyFor] = useState<DirectoryUser | null>(null);

  const scopes = useMemo(
    () => [
      { id: ALL, label: "전체", count: vault.items.length, group: null as OpenedGroup | null },
      { id: PERSONAL, label: "개인 금고", count: vault.items.filter((item) => !item.row.groupId).length, group: null },
      ...vault.groups
        .map((group) => ({ id: group.id, label: groupLabel(group), count: vault.items.filter((item) => item.row.groupId === group.id).length, group }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    ],
    [vault.items, vault.groups],
  );
  const activeGroup = vault.groups.find((group) => group.id === scope) ?? null;

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return vault.items
      .filter((item) => (scope === ALL ? true : scope === PERSONAL ? !item.row.groupId : item.row.groupId === scope))
      .filter((item) => kind === ALL || item.summary?.kind === kind)
      .filter((item) => words.every((word) => item.search.includes(word)))
      .sort((a, b) => (a.summary?.name ?? "").localeCompare(b.summary?.name ?? "", "ko"));
  }, [vault.items, scope, kind, query]);

  if (vault.status === "loading" && !vault.trust) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="금고를 여는 중">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (vault.status === "error" && !vault.trust) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlert aria-hidden />
          </EmptyMedia>
          <EmptyTitle>금고를 불러오지 못했어요</EmptyTitle>
          <EmptyDescription>{vault.error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={() => void vault.reload()}>
            다시 시도
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const openDetail = (item: OpenedItem) => {
    setDetail(item);
    setDetailOpen(true);
  };

  const quickCopy = async (item: OpenedItem) => {
    try {
      const secret = await vault.fetchSecret(item, "copy");
      if (!secret.password) {
        toastManager.add({ title: "비밀번호가 비어 있어요", type: "info" });
        return;
      }
      await copyValue("비밀번호", secret.password, true);
    } catch (failure) {
      toastManager.add({ title: "비밀번호를 받지 못했어요", description: describeError(failure, "다시 시도하세요."), type: "error" });
    }
  };

  const sharer = activeGroup ? vault.directory.find((user) => user.id === activeGroup.sharedBy) : undefined;
  const filtered = query.trim() !== "" || kind !== ALL;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl">금고</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            항목 {vault.items.length}개 · 묶음 {vault.groups.length}개{vault.status === "loading" && " · 새로 불러오는 중"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" loading={vault.status === "loading"} onClick={() => void vault.reload()}>
            <RotateCw aria-hidden />
            새로 불러오기
          </Button>
          <Button type="button" onClick={() => setForm({ open: true, existing: null })}>
            <Plus aria-hidden />
            항목 추가
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="금고 범위" className="hidden lg:grid lg:content-start lg:gap-1">
          {scopes.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={scope === entry.id}
              onClick={() => setScope(entry.id)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                scope === entry.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {entry.id === PERSONAL ? <UserRound className="size-4 shrink-0" aria-hidden /> : entry.group?.state && entry.group.state !== "open" ? <ShieldAlert className="size-4 shrink-0 text-warning-foreground" aria-hidden /> : <FolderLock className="size-4 shrink-0" aria-hidden />}
                <span className="truncate" title={entry.label}>
                  {entry.label}
                </span>
              </span>
              <span className="text-xs tabular-nums">{entry.count}</span>
            </button>
          ))}
        </nav>

        <div className="grid min-w-0 content-start gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="lg:hidden">
              <Select items={scopes.map((entry) => ({ value: entry.id, label: `${entry.label} (${entry.count})` }))} value={scope} onValueChange={(value) => setScope(String(value))}>
                <SelectTrigger aria-label="금고 범위" className="sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {scopes.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.label} ({entry.count})
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <InputGroup className="sm:max-w-sm">
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} aria-label="이름·업체·주소·아이디 검색" placeholder="이름·업체·주소·아이디 검색" type="search" />
            </InputGroup>
            <Select items={[{ value: ALL, label: "모든 종류" }, ...ITEM_KINDS]} value={kind} onValueChange={(value) => setKind(value as ItemKind | typeof ALL)}>
              <SelectTrigger aria-label="종류" className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value={ALL}>모든 종류</SelectItem>
                {ITEM_KINDS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          {activeGroup && activeGroup.state === "open" && !activeGroup.isMember && (
            <p className="text-muted-foreground text-sm">이 묶음의 구성원이 아니라 관리자 권한으로 보고 있어요. 비밀을 받으면 열람 기록에 관리자 열람으로 남아요.</p>
          )}
          {activeGroup && activeGroup.permission === "view" && activeGroup.isMember && <p className="text-muted-foreground text-sm">이 묶음은 보기 권한만 있어요.</p>}

          {activeGroup && activeGroup.state === "unverified-sharer" ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShieldAlert aria-hidden />
                </EmptyMedia>
                <EmptyTitle>이 묶음 열쇠를 건넨 관리자를 아직 확인하지 않았어요</EmptyTitle>
                <EmptyDescription>
                  {sharer ? `${sharer.name}(${sharer.loginId})님과 안전 번호를 비교해 확인하면 이 묶음을 열 수 있어요.` : "열쇠를 건넨 관리자를 찾을 수 없어요. 관리자에게 알려 주세요."}
                </EmptyDescription>
              </EmptyHeader>
              {sharer && (
                <EmptyContent>
                  <Button type="button" onClick={() => setVerifyFor(sharer)}>
                    안전 번호 비교
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : activeGroup && activeGroup.state === "error" ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>이 묶음을 열 수 없어요</EmptyTitle>
                <EmptyDescription>묶음 열쇠나 서명이 맞지 않아요. 관리자에게 알려 주세요.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : visible.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderLock aria-hidden />
                </EmptyMedia>
                <EmptyTitle>{filtered ? "조건에 맞는 항목이 없어요" : "아직 항목이 없어요"}</EmptyTitle>
                <EmptyDescription>{filtered ? "검색어나 종류를 바꿔 보세요." : "원격 접속·DB 접속·웹사이트 계정·메모를 추가해 보세요."}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {filtered ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setKind(ALL);
                    }}
                  >
                    검색·필터 초기화
                  </Button>
                ) : (
                  <Button type="button" onClick={() => setForm({ open: true, existing: null })}>
                    <Plus aria-hidden />
                    첫 항목 추가
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto" role="region" aria-label="항목 목록" tabIndex={0}>
              <div className="min-w-[720px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>이름</TableHead>
                      <TableHead>종류</TableHead>
                      <TableHead>접속 정보</TableHead>
                      <TableHead>위치</TableHead>
                      <TableHead className="w-24">
                        <span className="sr-only">작업</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((item) => {
                      const group = item.row.groupId ? vault.groups.find((entry) => entry.id === item.row.groupId) : null;
                      if (!item.summary) {
                        return (
                          <TableRow key={item.row.id}>
                            <TableCell colSpan={5} className="text-muted-foreground">
                              이 항목을 열 수 없어요({group ? groupLabel(group) : "개인 금고"}). 관리자에게 알려 주세요.
                            </TableCell>
                          </TableRow>
                        );
                      }
                      const summary = item.summary;
                      return (
                        <TableRow key={item.row.id}>
                          <TableCell className="max-w-72">
                            <button type="button" className="block max-w-full truncate text-left font-medium underline-offset-4 hover:underline" title={summary.name} onClick={() => openDetail(item)}>
                              {summary.name}
                            </button>
                            {summary.vendor && <div className="truncate text-muted-foreground text-xs">{summary.vendor}</div>}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge variant="secondary">{KIND_LABEL[summary.kind]}</Badge>
                              {item.row.needsRotation && <Badge variant="warning">교체 권장</Badge>}
                            </div>
                            {(summary.protocol || summary.dbType) && <div className="mt-1 text-muted-foreground text-xs">{summary.protocol ?? summary.dbType}</div>}
                          </TableCell>
                          <TableCell className="max-w-64">
                            <div className="truncate font-mono text-sm" title={address(item) ?? undefined}>
                              {address(item) ?? <span className="text-muted-foreground">—</span>}
                            </div>
                            {summary.username && <div className="truncate font-mono text-muted-foreground text-xs">{summary.username}</div>}
                          </TableCell>
                          <TableCell className="max-w-48 truncate" title={group ? groupLabel(group) : "개인 금고"}>
                            {group ? groupLabel(group) : "개인 금고"}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              {summary.kind !== "note" && (
                                <Button type="button" variant="ghost" size="icon-sm" aria-label={`${summary.name} 비밀번호 복사`} title="비밀번호 복사" onClick={() => void quickCopy(item)}>
                                  <Copy aria-hidden />
                                </Button>
                              )}
                              <Button type="button" variant="ghost" size="sm" onClick={() => openDetail(item)}>
                                상세
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </div>

      <ItemDetailDialog
        item={detail ? (vault.items.find((item) => item.row.id === detail.row.id) ?? null) : null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(item) => {
          setDetailOpen(false);
          setForm({ open: true, existing: item });
        }}
      />
      <ItemFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
        existing={form.existing}
        defaultGroupId={scope !== ALL && scope !== PERSONAL ? scope : null}
      />
      <SafetyNumberDialog subject={verifyFor} open={!!verifyFor} onOpenChange={(open) => !open && setVerifyFor(null)} />
    </div>
  );
}
