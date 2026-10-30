// 안전 번호 비교(설계서 4.4절): 두 사람이 전화·대면으로 같은 숫자인지 확인하고 "확인했어요"를 누르면 내 계정 열쇠로 잠근 확인 기록을 남긴다.
import { useEffect, useState } from "react";
import { describeError } from "@/api/errors";
import { saveTrust, type DirectoryUser } from "@/api/vault";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { toastManager } from "@/components/ui/toast";
import { safetyNumber } from "@/lib/crypto/canonical";
import { sealTrustRecord } from "@/lib/crypto/trust";
import { useVault } from "./vault-context";

export function SafetyNumberDialog({ subject, open, onOpenChange }: { subject: DirectoryUser | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { me, keys, trust, reload } = useVault();
  const [number, setNumber] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !subject) return;
    let cancelled = false;
    setNumber(null);
    setError(null);
    void safetyNumber(
      { id: me.id, encPublicKey: me.encPublicKey, signPublicKey: me.signPublicKey },
      { id: subject.id, encPublicKey: subject.encPublicKey, signPublicKey: subject.signPublicKey },
    ).then((value) => {
      if (!cancelled) setNumber(value);
    });
    return () => {
      cancelled = true;
    };
  }, [open, subject, me]);

  if (!subject) return null;
  const changed = trust?.changed.has(subject.id) ?? false;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const recordEnc = await sealTrustRecord(keys.accountKey, me.id, {
        subjectId: subject.id,
        loginId: subject.loginId,
        encPublicKey: subject.encPublicKey,
        signPublicKey: subject.signPublicKey,
        method: "safety-number",
        verifiedAt: new Date().toISOString(),
      });
      await saveTrust(subject.id, recordEnc);
      toastManager.add({ title: `${subject.name}님을 확인했어요`, type: "success" });
      onOpenChange(false);
      await reload();
    } catch (failure) {
      setError(describeError(failure, "확인 기록을 저장하지 못했어요. 다시 시도하세요."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{subject.name}님과 안전 번호 비교</DialogTitle>
          <DialogDescription>
            전화나 대면으로 {subject.name}님({subject.loginId})의 화면에 보이는 숫자를 하나씩 읽어 비교하세요. 메신저처럼 서버를 거치는 방법으로는 비교하지 마세요.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-4">
          {changed && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/4 px-3 py-2 text-destructive-foreground text-sm">
              이 사람의 공개키가 예전에 확인한 것과 달라요. 직접 다시 비교하기 전에는 이 사람에게 열쇠를 건네거나 받지 않아요.
            </p>
          )}
          <p className="grid grid-cols-3 gap-x-4 gap-y-2 font-mono text-xl tabular-nums sm:text-2xl" aria-label="안전 번호" aria-live="polite">
            {number ? number.split(" ").map((group, index) => <span key={index}>{group}</span>) : <span className="col-span-3 text-muted-foreground text-sm">계산하는 중이에요</span>}
          </p>
          <p className="text-muted-foreground text-sm">숫자가 하나라도 다르면 누르지 말고 관리자에게 알리세요.</p>
          {error && (
            <p role="alert" className="text-destructive-foreground text-sm">
              {error}
            </p>
          )}
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>닫기</DialogClose>
          <Button type="button" loading={busy} disabled={!number} onClick={() => void confirm()}>
            숫자가 같아요, 확인했어요
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
