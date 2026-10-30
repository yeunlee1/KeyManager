// 라이선스 사용자 변경 대화상자. 비워 두면 미사용으로 돌아간다.
import { useEffect, useState, type FormEvent } from "react";
import { updateItemRequest } from "@/api/items";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toastManager } from "@/components/ui/toast";
import { isAssigned } from "@/lib/license-key";
import type { Item } from "@/types/item";

export function EditMemberDialog({ item, onOpenChange, onSaved }: { item: Item | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [member, setMember] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMember(item && isAssigned(item.member) ? (item.member as string) : "");
    setError(null);
  }, [item]);

  if (!item) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (member.trim().length > 100) {
      setError("사용자명은 100자 안에서 넣으세요.");
      return;
    }
    setBusy(true);
    try {
      await updateItemRequest(item.no, { key: item.key, member: member.trim() });
      toastManager.add({ title: member.trim() ? "사용자를 지정했어요" : "미사용으로 돌렸어요", description: item.key, type: "success" });
      onOpenChange(false);
      onSaved();
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
            <DialogTitle>사용자 변경</DialogTitle>
            <DialogDescription className="break-all font-mono">{item.key}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Field invalid={!!error}>
              <FieldLabel>사용자명</FieldLabel>
              <Input value={member} onChange={(event) => setMember(event.target.value)} placeholder="예: 홍길동" autoFocus aria-invalid={!!error || undefined} />
              <FieldDescription>비워 두면 미사용 상태가 돼요.</FieldDescription>
              {error && <FieldError match>{error}</FieldError>}
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
            <Button type="submit" loading={busy}>
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
