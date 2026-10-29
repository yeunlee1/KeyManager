// KeyManager 프론트 표준 견본 화면. 디자인 토큰과 coss ui 기본 컴포넌트, 표준 화면 패턴을 실제로 보여 준다
import React, { useEffect, useState } from "react";
import {
  Copy,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Plus,
  SearchIcon,
  SearchX,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToastProvider, toastManager } from "@/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── 견본 데이터 (실제 API와 연결되지 않은 시연용 값) ─────────────────

const COLOR_TOKENS: { name: string; usage: string; swatch: string; text?: string }[] = [
  { name: "background", usage: "페이지 바탕", swatch: "bg-background", text: "text-foreground" },
  { name: "foreground", usage: "본문 글자", swatch: "bg-foreground", text: "text-background" },
  { name: "card", usage: "표·상자 바탕", swatch: "bg-card", text: "text-card-foreground" },
  { name: "primary", usage: "주요 행동(등록·저장)", swatch: "bg-primary", text: "text-primary-foreground" },
  { name: "secondary", usage: "보조 버튼 바탕", swatch: "bg-secondary", text: "text-secondary-foreground" },
  { name: "muted", usage: "약한 바탕(필터 묶음)", swatch: "bg-muted", text: "text-foreground" },
  { name: "muted-foreground", usage: "보조 설명 글자", swatch: "bg-muted-foreground", text: "text-background" },
  { name: "accent", usage: "마우스를 올린 항목", swatch: "bg-accent", text: "text-accent-foreground" },
  { name: "success", usage: "완료·사용 중", swatch: "bg-success", text: "text-white" },
  { name: "warning", usage: "주의", swatch: "bg-warning", text: "text-white" },
  { name: "info", usage: "안내", swatch: "bg-info", text: "text-white" },
  { name: "destructive", usage: "삭제·오류", swatch: "bg-destructive", text: "text-white" },
  { name: "border", usage: "구분선·테두리", swatch: "bg-border", text: "text-foreground" },
  { name: "ring", usage: "키보드 초점 테두리", swatch: "bg-ring", text: "text-white" },
];

const CATEGORY_ITEMS = [
  { label: "Windows", value: "Windows" },
  { label: "MS Office", value: "MS_Office" },
  { label: "한컴오피스", value: "Hancom" },
];

interface SampleRow {
  no: number;
  key: string;
  version: string;
  category: string;
  member: string | null;
}

const SAMPLE_ROWS: SampleRow[] = [
  { no: 1, key: "VK7NX-9WQ3M-4TG8P-2HJ6R-CY8DB", version: "Windows 11 Pro", category: "Windows", member: "홍길동" },
  { no: 2, key: "N4PXK-82HFT-7QMW9-3RBJC-6YV2D", version: "Office 2021 Professional Plus", category: "MS Office", member: null },
  { no: 3, key: "H8JQM-4CXWT-2R9PV-6BNKD-7YF3G", version: "한컴오피스 2024", category: "한컴오피스", member: "정우성 대리 / 고객지원팀 원격지원 담당" },
  { no: 4, key: "T3MBX-7KQ9W-8VHCN-4PJ2R-9DF6Y", version: "Windows Server 2022 Standard", category: "Windows", member: null },
];

// ── 화면 조각 ─────────────────────────────────────────────────

function Section({
  id,
  title,
  rule,
  children,
}: {
  id: string;
  title: string;
  rule: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="scroll-mt-20 py-10">
      <h2 id={id} className="font-heading font-semibold text-lg">
        {title}
      </h2>
      <p className="mt-1 max-w-3xl text-muted-foreground text-sm">{rule}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function StatusBadge({ member }: { member: string | null }) {
  // 미사용 기준은 서버와 같다: NULL, 빈 문자열, '사용자없음'
  const assigned = !!member && member !== "사용자없음";
  return assigned ? <Badge variant="success">사용 중</Badge> : <Badge variant="outline">미사용</Badge>;
}

function CopyKeyButton({ value }: { value: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`라이선스 키 ${value} 복사`} />}
        onClick={() =>
          toastManager.add({ title: "키를 복사했어요", description: value, type: "success" })
        }
      >
        <Copy />
      </TooltipTrigger>
      <TooltipPopup>키 복사</TooltipPopup>
    </Tooltip>
  );
}

function RowMenu({ row }: { row: SampleRow }) {
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`${row.no}번 라이선스 작업 더 보기`} />}
      >
        <MoreHorizontal />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem>
          <Pencil />
          사용자 변경
        </MenuItem>
        <MenuItem>
          <Copy />
          키 복사
        </MenuItem>
        <MenuSeparator />
        <MenuItem variant="destructive">
          <Trash2 />
          삭제
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function LicenseTable({ rows }: { rows: SampleRow[] }) {
  return (
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
        {rows.map((row) => (
          <TableRow key={row.no}>
            <TableCell className="text-right font-mono text-muted-foreground tabular-nums">{row.no}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <span className="font-mono font-medium">{row.key}</span>
                <CopyKeyButton value={row.key} />
              </div>
              <div className="text-muted-foreground text-xs">{row.version}</div>
            </TableCell>
            <TableCell>{row.category}</TableCell>
            <TableCell className="max-w-56 truncate" title={row.member ?? undefined}>
              {row.member ?? <span className="text-muted-foreground">—</span>}
            </TableCell>
            <TableCell>
              <StatusBadge member={row.member} />
            </TableCell>
            <TableCell>
              <RowMenu row={row} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RegisterDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button />}>
        <Plus />새 라이선스
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>라이선스 등록</DialogTitle>
          <DialogDescription>카테고리와 버전을 고르고 25자리 제품 키를 입력하세요.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          <Field>
            <FieldLabel>카테고리</FieldLabel>
            <Select items={CATEGORY_ITEMS} defaultValue="Windows">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {CATEGORY_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>
          <Field>
            <FieldLabel>제품 키</FieldLabel>
            <Input className="font-mono" placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" />
            <FieldDescription>XXXXX-XXXXX-XXXXX-XXXXX-XXXXX 형식으로 25자리를 입력하세요.</FieldDescription>
          </Field>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>취소</DialogClose>
          <DialogClose
            render={<Button />}
            onClick={() => toastManager.add({ title: "라이선스를 등록했어요", type: "success" })}
          >
            등록
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function DeleteConfirm() {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive-outline" />}>
        <Trash2 />
        삭제
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>이 라이선스를 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            목록에서 사라지지만 기록은 남아서 관리자가 되살릴 수 있어요.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>취소</AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={() => toastManager.add({ title: "삭제했어요", type: "info" })}
          >
            삭제
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

// ── 페이지 ────────────────────────────────────────────────────

const NAV = [
  ["colors", "색"],
  ["type", "글자"],
  ["buttons", "버튼"],
  ["forms", "입력"],
  ["status", "상태 표시"],
  ["overlays", "대화상자·알림"],
  ["pattern", "목록 화면 예시"],
] as const;

export default function StandardPage() {
  const [dark, setDark] = useState(false);
  const [status, setStatus] = useState<"all" | "assigned" | "unassigned">("all");
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const visibleRows = SAMPLE_ROWS.filter((row) => {
    const assigned = !!row.member;
    return status === "all" || (status === "assigned" ? assigned : !assigned);
  });

  return (
    <ToastProvider>
      <TooltipProvider>
        <div className="min-h-screen bg-background font-sans text-foreground antialiased">
          <header className="sticky top-0 z-10 border-b bg-background">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <KeyRound className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="font-heading font-semibold text-sm">KeyManager 프론트 표준</p>
                  <p className="text-muted-foreground text-xs">견본 화면 · 개발용</p>
                </div>
              </div>
              <Label className="cursor-pointer gap-2 text-sm">
                다크 모드
                <Switch checked={dark} onCheckedChange={setDark} />
              </Label>
            </div>
            <nav aria-label="견본 목차" className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2 sm:px-8">
              <ul className="flex gap-1 whitespace-nowrap text-sm">
                {NAV.map(([id, label]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="inline-flex min-h-9 items-center rounded-md px-3 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </header>

          <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
            <Section
              id="colors"
              title="색"
              rule="색은 이 토큰 이름으로만 쓴다. slate-500·blue-600처럼 Tailwind 기본색을 화면 코드에 직접 쓰지 않는다. 포인트 색(primary)은 한 화면의 주요 행동 한두 곳에만 쓴다."
            >
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {COLOR_TOKENS.map((token) => (
                  <li key={token.name} className="overflow-hidden rounded-lg border">
                    <div className={`flex h-16 items-end px-3 pb-2 ${token.swatch} ${token.text ?? ""}`}>
                      <span className="font-mono text-xs">{token.name}</span>
                    </div>
                    <p className="px-3 py-2 text-sm">{token.usage}</p>
                  </li>
                ))}
              </ul>
            </Section>
            <Separator />

            <Section
              id="type"
              title="글자"
              rule="글꼴은 Pretendard, 라이선스 키처럼 한 글자씩 대조하는 값은 JetBrains Mono를 쓴다. 가장 작은 글자는 12px이고, 흐린 글자(muted-foreground)는 설명에만 쓴다."
            >
              <div className="grid gap-4">
                <p className="font-heading font-semibold text-2xl">페이지 제목 · 라이선스 관리</p>
                <p className="font-heading font-semibold text-lg">구획 제목 · 카테고리별 현황</p>
                <p className="text-sm">
                  본문 · 등록한 라이선스 키를 직원에게 배정하고, 누가 어떤 키를 쓰는지 한눈에 확인합니다. 긴 문장도 줄바꿈이
                  자연스럽게 되도록 한 줄 길이를 너무 길게 두지 않습니다.
                </p>
                <p className="text-muted-foreground text-sm">보조 설명 · 마지막 확인 2026-10-29 14:05</p>
                <p className="text-xs text-muted-foreground">가장 작은 글자 · 12px</p>
                <p className="font-mono text-sm">키 값 · VK7NX-9WQ3M-4TG8P-2HJ6R-CY8DB</p>
              </div>
            </Section>
            <Separator />

            <Section
              id="buttons"
              title="버튼"
              rule="한 영역에 주요 버튼(default)은 하나만 둔다. 되돌릴 수 없는 행동은 destructive, 그 밖의 보조 행동은 outline·ghost를 쓴다. 처리 중에는 loading으로 중복 클릭을 막는다."
            >
              <div className="flex flex-wrap items-center gap-3">
                <Button>등록</Button>
                <Button variant="outline">내보내기</Button>
                <Button variant="secondary">필터 초기화</Button>
                <Button variant="ghost">취소</Button>
                <Button variant="destructive-outline">삭제</Button>
                <Button variant="destructive">영구 삭제</Button>
                <Button variant="link">자세히 보기</Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button size="sm">작게</Button>
                <Button>기본</Button>
                <Button size="lg">크게</Button>
                <Button disabled>비활성</Button>
                <Button loading={loadingDemo} onClick={() => setLoadingDemo((v) => !v)}>
                  처리 중 보기
                </Button>
                <Button variant="outline" size="icon" aria-label="사용자 추가">
                  <UserRound />
                </Button>
              </div>
            </Section>
            <Separator />

            <Section
              id="forms"
              title="입력"
              rule="모든 입력에는 보이는 라벨을 붙인다. 설명은 라벨 아래, 오류는 입력 바로 아래에 문장으로 쓴다. 선택지는 Select, 켜고 끄기는 Switch, 여러 개 고르기는 Checkbox를 쓴다."
            >
              <div className="grid max-w-xl gap-5">
                <Field>
                  <FieldLabel>사용자명</FieldLabel>
                  <Input placeholder="예: 홍길동" />
                  <FieldDescription>비워 두면 미사용 상태가 됩니다.</FieldDescription>
                </Field>
                <Field invalid>
                  <FieldLabel>라이선스 키</FieldLabel>
                  <Input aria-invalid defaultValue="VK7NX-9WQ3M" className="font-mono" />
                  <FieldError match>25자리를 모두 입력하세요. (지금 10자리)</FieldError>
                </Field>
                <Field>
                  <FieldLabel>카테고리</FieldLabel>
                  <Select items={CATEGORY_ITEMS} defaultValue="MS_Office">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {CATEGORY_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>메모</FieldLabel>
                  <Textarea placeholder="구매처, 계약 번호 등" />
                </Field>
                <div className="grid gap-3">
                  <Label className="gap-2">
                    <Checkbox defaultChecked />
                    삭제된 항목도 보기
                  </Label>
                  <Label className="gap-2">
                    <Switch defaultChecked />
                    배정할 때 메일로 알리기
                  </Label>
                </div>
              </div>
            </Section>
            <Separator />

            <Section
              id="status"
              title="상태 표시"
              rule="상태는 색만으로 구분하지 않고 글자를 함께 쓴다. 불러오는 중에는 자리 모양(Skeleton), 결과가 없으면 이유와 다음 행동을 알려 주는 빈 상태(Empty)를 보여 준다."
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">사용 중</Badge>
                <Badge variant="outline">미사용</Badge>
                <Badge variant="info">안내</Badge>
                <Badge variant="warning">만료 임박</Badge>
                <Badge variant="destructive">오류</Badge>
                <Badge variant="secondary">MS Office</Badge>
                <span className="ml-2 inline-flex items-center gap-2 text-muted-foreground text-sm">
                  <Spinner /> 불러오는 중
                </span>
                <span className="ml-2 inline-flex items-center gap-1.5 text-muted-foreground text-sm">
                  검색은 <Kbd>Enter</Kbd>
                </span>
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border p-4" aria-busy="true" aria-label="목록 불러오는 중">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-4 py-2.5">
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  ))}
                </div>
                <Empty className="rounded-xl border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SearchX />
                    </EmptyMedia>
                    <EmptyTitle>조건에 맞는 라이선스가 없어요</EmptyTitle>
                    <EmptyDescription>검색어를 바꾸거나 필터를 초기화해 보세요.</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button variant="outline" size="sm">
                      필터 초기화
                    </Button>
                  </EmptyContent>
                </Empty>
              </div>
            </Section>
            <Separator />

            <Section
              id="overlays"
              title="대화상자·알림"
              rule="입력이 필요한 작업은 Dialog, 되돌리기 어려운 작업의 확인은 AlertDialog를 쓴다. 결과는 토스트로 짧게 알리고, 실패 토스트에는 다음에 할 일을 쓴다."
            >
              <div className="flex flex-wrap items-center gap-3">
                <RegisterDialog />
                <DeleteConfirm />
                <Button
                  variant="outline"
                  onClick={() =>
                    toastManager.add({
                      title: "등록하지 못했어요",
                      description: "이미 등록된 라이선스 키입니다. 키를 다시 확인하세요.",
                      type: "error",
                    })
                  }
                >
                  실패 토스트 보기
                </Button>
              </div>
            </Section>
            <Separator />

            <Section
              id="pattern"
              title="목록 화면 예시"
              rule="목록 화면은 제목과 주요 행동 → 분류 탭과 필터·검색 → 표 → 페이지 순서로 쌓는다. 영역마다 상자를 겹겹이 두르지 않고 간격과 구분선으로 나눈다."
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h3 className="font-heading font-semibold text-2xl">라이선스</h3>
                  <p className="mt-1 text-muted-foreground text-sm">전체 17개 · 사용 중 6개 · 미사용 11개</p>
                </div>
                <RegisterDialog />
              </div>
              <Tabs defaultValue="all" className="mt-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <TabsList variant="underline" aria-label="카테고리">
                    <TabsTab value="all">전체</TabsTab>
                    <TabsTab value="windows">Windows</TabsTab>
                    <TabsTab value="office">MS Office</TabsTab>
                    <TabsTab value="hancom">한컴오피스</TabsTab>
                  </TabsList>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <SegmentedControl aria-label="사용 상태">
                      {(
                        [
                          ["all", "전체"],
                          ["assigned", "사용 중"],
                          ["unassigned", "미사용"],
                        ] as const
                      ).map(([value, label]) => (
                        <SegmentedControlItem
                          key={value}
                          aria-pressed={status === value}
                          data-pressed={status === value ? "" : undefined}
                          onClick={() => setStatus(value)}
                        >
                          {label}
                        </SegmentedControlItem>
                      ))}
                    </SegmentedControl>
                    <InputGroup className="sm:w-64">
                      <InputGroupAddon>
                        <SearchIcon aria-hidden />
                      </InputGroupAddon>
                      <InputGroupInput aria-label="키 또는 사용자 검색" placeholder="키 또는 사용자 검색" />
                    </InputGroup>
                  </div>
                </div>
                <TabsPanel value="all" className="mt-4">
                  <div className="overflow-x-auto" role="region" aria-label="라이선스 목록" tabIndex={0}>
                    <div className="min-w-[720px]">
                      <LicenseTable rows={visibleRows} />
                    </div>
                  </div>
                </TabsPanel>
                {(["windows", "office", "hancom"] as const).map((value) => (
                  <TabsPanel key={value} value={value} className="mt-4 text-muted-foreground text-sm">
                    견본에서는 전체 탭만 표를 보여 줘요.
                  </TabsPanel>
                ))}
              </Tabs>
              <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
                <p className="text-muted-foreground text-sm">전체 17개 중 1–10</p>
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#pattern" aria-disabled="true" />
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#pattern" isActive>
                        1
                      </PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationLink href="#pattern">2</PaginationLink>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#pattern" />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </Section>
          </main>
        </div>
      </TooltipProvider>
    </ToastProvider>
  );
}
