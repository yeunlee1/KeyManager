// 항목 상세(설계서 6절): 칸마다 복사, 비밀번호·메모는 서버에서 비밀을 받아 잠깐 보이거나 복사한다(받을 때마다 열람 기록이 남는다).
import { Copy, ExternalLink, Eye, EyeOff, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { describeError } from "@/api/errors";
import { AlertDialog, AlertDialogClose, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogPopup, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { toastManager } from "@/components/ui/toast";
import { KIND_LABEL, safeLink, type ItemSecret } from "@/lib/item-types";
import { copyValue } from "./copy-actions";
import { useVault, type OpenedItem } from "./vault-context";

const SHOW_MS = 30_000;

function Row({ label, value, mono, copy = true }: { label: string; value?: string | number | null; mono?: boolean; copy?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value);
  return (
    <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 py-1.5 sm:grid-cols-[8rem_1fr_auto]">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className={`min-w-0 break-all text-sm ${mono ? "font-mono" : ""}`}>{text}</dd>
      {copy ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`${label} 복사`} onClick={() => void copyValue(label, text)}>
          <Copy aria-hidden />
        </Button>
      ) : (
        <span />
      )}
    </div>
  );
}

export function ItemDetailDialog({
  item,
  open,
  onOpenChange,
  onEdit,
}: {
  item: OpenedItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: OpenedItem) => void;
}) {
  const vault = useVault();
  const [secret, setSecret] = useState<ItemSecret | null>(null);
  const [shown, setShown] = useState<{ password: boolean; memo: boolean }>({ password: false, memo: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 닫거나 다른 항목을 열면 받아 둔 비밀을 지운다.
  useEffect(() => {
    setSecret(null);
    setShown({ password: false, memo: false });
    setError(null);
  }, [item?.row.id, item?.row.revision, open]);

  useEffect(() => {
    if (!shown.password && !shown.memo) return;
    const timer = setTimeout(() => {
      setShown({ password: false, memo: false });
      setSecret(null);
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!item?.summary) return null;
  const { summary, row } = item;
  const group = row.groupId ? vault.groups.find((entry) => entry.id === row.groupId) : null;
  const where = row.groupId ? (group?.name ?? "묶음") : "개인 금고";
  const asAdmin = !!group && !group.isMember;
  const canEdit = vault.canEdit(item);
  const link = summary.kind === "website" ? safeLink(summary.url) : null;
  const hasPassword = summary.kind !== "note";

  const reveal = async (part: "password" | "memo") => {
    if (shown[part]) {
      setShown((current) => ({ ...current, [part]: false }));
      return;
    }
    setBusy(part);
    setError(null);
    try {
      const value = secret ?? (await vault.fetchSecret(item, "view"));
      setSecret(value);
      setShown((current) => ({ ...current, [part]: true }));
    } catch (failure) {
      setError(describeError(failure, "비밀을 받지 못했어요. 다시 시도하세요."));
    } finally {
      setBusy(null);
    }
  };

  const copySecret = async (part: "password" | "memo") => {
    setBusy(`copy-${part}`);
    setError(null);
    try {
      const value = await vault.fetchSecret(item, "copy");
      const text = value[part];
      if (!text) {
        toastManager.add({ title: part === "password" ? "비밀번호가 비어 있어요" : "메모가 비어 있어요", type: "info" });
        return;
      }
      await copyValue(part === "password" ? "비밀번호" : summary.kind === "note" ? "내용" : "메모", text, true);
    } catch (failure) {
      setError(describeError(failure, "비밀을 받지 못했어요. 다시 시도하세요."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    try {
      await vault.removeItem(item);
      toastManager.add({ title: "항목을 삭제했어요", description: summary.name, type: "success" });
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (failure) {
      toastManager.add({ title: "삭제하지 못했어요", description: describeError(failure, "다시 시도하세요."), type: "error" });
    }
  };

  const memoLabel = summary.kind === "note" ? "내용" : "메모";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogPopup className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="break-all">{summary.name}</DialogTitle>
            <DialogDescription>
              {KIND_LABEL[summary.kind]} · {where} · {new Date(row.updatedAt).toLocaleString("ko-KR")} 고침
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            {asAdmin && <Badge variant="info">관리자 권한으로 보는 중(열람 기록에 남아요)</Badge>}
            {row.needsRotation && (
              <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-sm text-warning-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                비밀번호 교체를 권장해요. 이 항목을 볼 수 있던 사람이 빠졌어요. 실제 비밀번호를 바꾼 뒤 고치기에서 표시를 지우세요.
              </p>
            )}
            <dl className="divide-y">
              <Row label="업체" value={summary.vendor} />
              <Row label="접속 방식" value={summary.protocol} copy={false} />
              <Row label="DB 종류" value={summary.dbType} copy={false} />
              <Row label="주소" value={summary.host} mono />
              <Row label="포트" value={summary.port} mono />
              <Row label="DB 이름" value={summary.dbName} mono />
              {summary.url && (
                <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 py-1.5 sm:grid-cols-[8rem_1fr_auto]">
                  <dt className="text-muted-foreground text-sm">주소(URL)</dt>
                  <dd className="min-w-0 break-all font-mono text-sm">
                    {link ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                        {summary.url}
                        <ExternalLink className="size-3.5" aria-hidden />
                        <span className="sr-only">(새 창에서 열기)</span>
                      </a>
                    ) : (
                      summary.url
                    )}
                  </dd>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="주소 복사" onClick={() => void copyValue("주소", summary.url as string)}>
                    <Copy aria-hidden />
                  </Button>
                </div>
              )}
              <Row label="아이디" value={summary.username} mono />
              {hasPassword && (
                <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 py-1.5 sm:grid-cols-[8rem_1fr_auto]">
                  <dt className="text-muted-foreground text-sm">비밀번호</dt>
                  <dd className="min-w-0 break-all font-mono text-sm" aria-live="polite">
                    {shown.password ? secret?.password || <span className="text-muted-foreground">(비어 있음)</span> : "••••••••••"}
                  </dd>
                  <div className="flex">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={shown.password ? "비밀번호 가리기" : "비밀번호 보기"} aria-pressed={shown.password} loading={busy === "password"} onClick={() => void reveal("password")}>
                      {shown.password ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="비밀번호 복사" loading={busy === "copy-password"} onClick={() => void copySecret("password")}>
                      <Copy aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </dl>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">{memoLabel}</span>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" aria-pressed={shown.memo} loading={busy === "memo"} onClick={() => void reveal("memo")}>
                    {shown.memo ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    {shown.memo ? "가리기" : `${memoLabel} 보기`}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" loading={busy === "copy-memo"} onClick={() => void copySecret("memo")}>
                    <Copy aria-hidden />
                    복사
                  </Button>
                </div>
              </div>
              {shown.memo && (
                <p className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 text-sm">
                  {secret?.memo || <span className="text-muted-foreground">(비어 있음)</span>}
                </p>
              )}
            </div>
            <p className="text-muted-foreground text-xs">비밀은 30초 뒤 다시 가려요. 보기·복사할 때마다 서버에서 받아 열람 기록에 남아요.</p>
            {error && (
              <p role="alert" className="text-destructive-foreground text-sm">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            {canEdit && (
              <Button type="button" variant="destructive-outline" className="sm:me-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 aria-hidden />
                삭제
              </Button>
            )}
            <DialogClose render={<Button type="button" variant="outline" />}>닫기</DialogClose>
            {canEdit && (
              <Button type="button" onClick={() => onEdit(item)}>
                <Pencil aria-hidden />
                고치기
              </Button>
            )}
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>"{summary.name}" 항목을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>삭제하면 {where}의 다른 사람도 더 이상 볼 수 없고 되돌릴 수 없어요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>취소</AlertDialogClose>
            <Button variant="destructive" onClick={() => void remove()}>
              삭제
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
