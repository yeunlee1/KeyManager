// 라이선스 화면(새 디자인): 제목·요약·등록 → 카테고리 탭·사용 상태·검색 → 표 → 쪽 이동. 거르기 조건은 주소에 남겨 뒤로 가기와 새 탭에서도 그대로 보인다.
import { Copy, MoreHorizontal, Pencil, Plus, ScrollText, SearchIcon, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useSearchParams } from "react-router";
import { deleteItemRequest, getCategories, getCategoryStats, getItems } from "@/api/items";
import { describeError } from "@/api/errors";
import { AlertDialog, AlertDialogClose, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogPopup, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { toastManager } from "@/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { isAssigned } from "@/lib/license-key";
import { resolveValidPage } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import type { CategoryStat, CategoryVersions, Item, StatusFilter } from "@/types/item";
import { EditMemberDialog } from "./EditMemberDialog";
import { categoryLabel, STATUS_OPTIONS } from "./license-labels";
import { RegisterLicenseDialog } from "./RegisterLicenseDialog";

const PAGE_SIZE = 10;
const ALL = "allassets";

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key);
    toastManager.add({ title: "키를 복사했어요", description: key, type: "success" });
  } catch {
    toastManager.add({ title: "복사하지 못했어요", description: "키를 직접 선택해 복사하세요.", type: "error" });
  }
}

// 보이는 쪽 번호: 처음·끝과 지금 쪽 주변만 보이고 나머지는 줄임표로 둔다.
function pageWindow(current: number, last: number): (number | "gap")[] {
  const pages = new Set([1, last, current - 1, current, current + 1].filter((page) => page >= 1 && page <= last));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

export function LicensesPage() {
  const [params, setParams] = useSearchParams();
  const category = params.get("category") ?? ALL;
  const status = (params.get("status") as StatusFilter | null) ?? "all";
  const query = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const [searchText, setSearchText] = useState(query);
  const [items, setItems] = useState<Item[] | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [versions, setVersions] = useState<CategoryVersions>({});
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);

  const update = useCallback(
    (changes: Record<string, string | number | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [name, value] of Object.entries(changes)) {
            if (value === null || value === "" || (name === "category" && value === ALL) || (name === "status" && value === "all") || (name === "page" && value === 1)) next.delete(name);
            else next.set(name, String(value));
          }
          return next;
        },
        { replace: false },
      );
    },
    [setParams],
  );

  // 뒤로 가기 등으로 주소의 검색어가 바뀌면 입력칸도 맞춘다. 입력 중인 띄어쓰기는 지우지 않는다.
  useEffect(() => setSearchText((current) => (current.trim() === query ? current : query)), [query]);

  // 검색어는 입력이 멈추면 주소에 반영하고 1쪽으로 돌아간다.
  useEffect(() => {
    if (searchText.trim() === query) return;
    const timer = setTimeout(() => update({ q: searchText.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [searchText, query, update]);

  const refreshStats = useCallback(() => {
    getCategoryStats()
      .then(setStats)
      .catch(() => setStats([]));
  }, []);

  useEffect(() => {
    refreshStats();
    getCategories()
      .then(setVersions)
      .catch(() => toastManager.add({ title: "카테고리 목록을 불러오지 못했어요", description: "새로 고친 뒤 다시 시도하세요.", type: "error" }));
  }, [refreshStats]);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    getItems({ page, limit: PAGE_SIZE, category, status, searchField: "all", searchValue: query })
      .then((response) => {
        if (cancelled) return;
        // 삭제로 마지막 쪽이 비면 남은 마지막 쪽으로 돌아간다.
        const valid = resolveValidPage(page, response.total, PAGE_SIZE, response.items.length);
        if (valid !== page) {
          update({ page: valid });
          return;
        }
        setItems(response.items);
        setTotal(response.total);
      })
      .catch((failure) => !cancelled && setError(describeError(failure, "라이선스 목록을 불러오지 못했어요.")));
    return () => {
      cancelled = true;
    };
  }, [page, category, status, query, reloadCount, update]);

  const refresh = () => {
    refreshStats();
    setReloadCount((count) => count + 1);
  };

  const sums = useMemo(
    () => stats.reduce((acc, row) => ({ total: acc.total + row.total, active: acc.active + row.active, available: acc.available + row.available }), { total: 0, active: 0, available: 0 }),
    [stats],
  );
  const categories = [ALL, ...stats.map((row) => row.category)];
  const filtered = category !== ALL || status !== "all" || query !== "";
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  const go = (target: number) => (event: MouseEvent) => {
    event.preventDefault();
    update({ page: target });
  };
  const hrefFor = (target: number) => {
    const next = new URLSearchParams(params);
    if (target === 1) next.delete("page");
    else next.set("page", String(target));
    const text = next.toString();
    return text ? `?${text}` : "?";
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await deleteItemRequest(deleting.no);
      toastManager.add({ title: "라이선스를 삭제했어요", description: deleting.key, type: "success" });
      setDeleting(null);
      refresh();
    } catch (failure) {
      toastManager.add({ title: "삭제하지 못했어요", description: describeError(failure, "다시 시도하세요."), type: "error" });
    }
  };

  return (
    // 좁은 화면에서 탭 줄이 페이지 칸을 넓히지 않게 칸을 0까지 줄일 수 있게 둔다(탭은 안쪽에서 가로로 스크롤).
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading font-semibold text-2xl">라이선스</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            전체 {sums.total}개 · 사용 중 {sums.active}개 · 미사용 {sums.available}개
          </p>
        </div>
        <Button type="button" onClick={() => setRegisterOpen(true)}>
          <Plus aria-hidden />
          라이선스 등록
        </Button>
      </div>

      <Tabs value={category} onValueChange={(value) => update({ category: String(value), page: 1 })} className="min-w-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="overflow-x-auto">
            <TabsList variant="underline" aria-label="카테고리">
              {categories.map((code) => {
                const count = code === ALL ? sums.total : (stats.find((row) => row.category === code)?.total ?? 0);
                return (
                  <TabsTab key={code} value={code}>
                    {code === ALL ? "전체" : categoryLabel(code)}
                    <span className="ms-1 text-muted-foreground text-xs tabular-nums">{count}</span>
                  </TabsTab>
                );
              })}
            </TabsList>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SegmentedControl aria-label="사용 상태">
              {STATUS_OPTIONS.map((option) => (
                <SegmentedControlItem
                  key={option.value}
                  aria-pressed={status === option.value}
                  data-pressed={status === option.value ? "" : undefined}
                  onClick={() => update({ status: option.value, page: 1 })}
                >
                  {option.label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            <InputGroup className="sm:w-64">
              <InputGroupAddon>
                <SearchIcon aria-hidden />
              </InputGroupAddon>
              <InputGroupInput value={searchText} onChange={(event) => setSearchText(event.target.value)} aria-label="키 또는 사용자 검색" placeholder="키 또는 사용자 검색" type="search" />
            </InputGroup>
          </div>
        </div>
      </Tabs>

      {error ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>라이선스 목록을 불러오지 못했어요</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={refresh}>
              다시 시도
            </Button>
          </EmptyContent>
        </Empty>
      ) : items === null ? (
        <div className="grid gap-2" aria-busy="true" aria-label="라이선스 목록을 불러오는 중">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollText aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{filtered ? "조건에 맞는 라이선스가 없어요" : "등록된 라이선스가 없어요"}</EmptyTitle>
            <EmptyDescription>{filtered ? "카테고리·사용 상태·검색어를 바꿔 보세요." : "가지고 있는 제품 키를 등록해 보세요."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {filtered ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchText("");
                  setParams(new URLSearchParams());
                }}
              >
                필터 초기화
              </Button>
            ) : (
              <Button type="button" onClick={() => setRegisterOpen(true)}>
                <Plus aria-hidden />
                첫 라이선스 등록
              </Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <div className="overflow-x-auto" role="region" aria-label="라이선스 목록" tabIndex={0}>
            <div className="min-w-[720px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14 text-right">번호</TableHead>
                    <TableHead>라이선스 키</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>사용자</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">작업</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const assigned = isAssigned(item.member);
                    return (
                      <TableRow key={item.no}>
                        <TableCell className="text-right font-mono text-muted-foreground tabular-nums">{item.no}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="font-medium font-mono">{item.key}</span>
                            <Tooltip>
                              <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`라이선스 키 ${item.key} 복사`} />} onClick={() => void copyKey(item.key)}>
                                <Copy />
                              </TooltipTrigger>
                              <TooltipPopup>키 복사</TooltipPopup>
                            </Tooltip>
                          </div>
                        </TableCell>
                        <TableCell>
                          {categoryLabel(item.category)}
                          <div className="text-muted-foreground text-xs">{item.version}</div>
                        </TableCell>
                        <TableCell className="max-w-56 truncate" title={assigned ? (item.member ?? undefined) : undefined}>
                          {assigned ? item.member : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>{assigned ? <Badge variant="success">사용 중</Badge> : <Badge variant="outline">미사용</Badge>}</TableCell>
                        <TableCell>
                          <Menu>
                            <MenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${item.no}번 라이선스 작업 더 보기`} />}>
                              <MoreHorizontal />
                            </MenuTrigger>
                            <MenuPopup align="end">
                              <MenuItem onClick={() => setEditing(item)}>
                                <Pencil />
                                사용자 변경
                              </MenuItem>
                              <MenuItem onClick={() => void copyKey(item.key)}>
                                <Copy />
                                키 복사
                              </MenuItem>
                              <MenuSeparator />
                              <MenuItem variant="destructive" onClick={() => setDeleting(item)}>
                                <Trash2 />
                                삭제
                              </MenuItem>
                            </MenuPopup>
                          </Menu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="text-muted-foreground text-sm">
              전체 {total}개 중 {from}–{to}
            </p>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={page > 1 ? hrefFor(page - 1) : undefined}
                    aria-disabled={page <= 1 || undefined}
                    tabIndex={page <= 1 ? -1 : undefined}
                    className={cn(page <= 1 && "pointer-events-none opacity-64")}
                    onClick={page > 1 ? go(page - 1) : undefined}
                  />
                </PaginationItem>
                {pageWindow(page, lastPage).map((entry, index) =>
                  entry === "gap" ? (
                    <PaginationItem key={`gap-${index}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={entry}>
                      <PaginationLink href={hrefFor(entry)} isActive={entry === page} onClick={go(entry)}>
                        {entry}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href={page < lastPage ? hrefFor(page + 1) : undefined}
                    aria-disabled={page >= lastPage || undefined}
                    tabIndex={page >= lastPage ? -1 : undefined}
                    className={cn(page >= lastPage && "pointer-events-none opacity-64")}
                    onClick={page < lastPage ? go(page + 1) : undefined}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </>
      )}

      <RegisterLicenseDialog open={registerOpen} onOpenChange={setRegisterOpen} versions={versions} onRegistered={refresh} />
      <EditMemberDialog item={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={refresh} />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>이 라이선스를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="break-all font-mono">{deleting?.key}</span> 키를 목록에서 지워요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>취소</AlertDialogClose>
            <Button variant="destructive" onClick={() => void remove()}>
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
