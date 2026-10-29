// 관리자 작업(역할 바꾸기·비활성화·초대·삭제 등) 직전에 본인 인증 앱의 6자리 코드를 다시 받는 대화상자
import { useState, type FormEvent, type ReactNode } from "react";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  // 실패하면 던진다. 대화상자가 문구를 보여 주고 열린 채로 둔다.
  onConfirm: (totpCode: string) => Promise<void>;
  children?: ReactNode;
}

export function StepUpDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onConfirm, children }: StepUpDialogProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("인증 앱에 보이는 6자리 숫자를 넣으세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(code);
      setCode("");
      onOpenChange(false);
    } catch (failure) {
      setError(describeError(failure, "처리하지 못했어요. 다시 시도하세요."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCode("");
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogPopup>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            {children}
            <Field invalid={!!error}>
              <FieldLabel>내 인증 코드</FieldLabel>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="font-mono tabular-nums"
                aria-invalid={!!error || undefined}
                autoFocus
              />
              <FieldDescription>중요한 관리 작업이라 인증 앱의 코드를 한 번 더 확인해요.</FieldDescription>
              {error && <FieldError match>{error}</FieldError>}
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>취소</DialogClose>
            <Button type="submit" variant={destructive ? "destructive" : "default"} loading={busy}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
