// 인증 절차가 함께 쓰는 단계: 화면 틀, 새 마스터 비밀번호 칸, 복구 키 보관, 2단계 인증 등록, 예비 코드 보관
import { KeyRound } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { confirmTotpEnrollment, startTotpEnrollment } from "@/api/auth";
import { describeError, errorStatus } from "@/api/errors";
import { PasswordInput } from "@/components/PasswordInput";
import { RevealBox } from "@/components/RevealBox";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { checkMasterPassword, type PasswordContext, type PolicyResult } from "@/lib/password-policy";

export function AuthLayout({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-10 sm:px-8 sm:py-16">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
            <KeyRound className="size-4" />
          </span>
          KeyManager
        </div>
        <div>
          <h1 className="font-heading font-semibold text-2xl">{title}</h1>
          {description && <div className="mt-2 text-muted-foreground text-sm">{description}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/4 px-3 py-2 text-destructive-foreground text-sm">
      {message}
    </p>
  );
}

// 입력이 멈추면 브라우저 안에서 강도 조건을 검사한다. 제출할 때는 checkMasterPassword로 다시 확인한다.
function usePasswordCheck(password: string, context: PasswordContext): PolicyResult | null {
  const [result, setResult] = useState<PolicyResult | null>(null);
  const { loginId, name, current } = context;
  useEffect(() => {
    if (!password) {
      setResult(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void checkMasterPassword(password, { loginId, name, current }).then((next) => {
        if (!cancelled) setResult(next);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [password, loginId, name, current]);
  return result;
}

const STRENGTH = ["매우 약함", "약함", "보통", "강함", "매우 강함"];

export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  context,
  confirmError,
  label = "마스터 비밀번호",
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  context: PasswordContext;
  confirmError: string | null;
  label?: string;
}) {
  const check = usePasswordCheck(password, context);
  const problems = check?.problems ?? [];
  return (
    <>
      <Field invalid={problems.length > 0}>
        <FieldLabel>{label}</FieldLabel>
        <PasswordInput value={password} onChange={(event) => onPassword(event.target.value)} autoComplete="new-password" aria-invalid={problems.length > 0 || undefined} />
        <FieldDescription>
          12자 이상, 단어 서너 개를 이은 긴 문장이 좋아요. 잊으면 복구 키 없이는 되찾을 수 없어요.
          {check?.score != null && <span className="ms-1">강도: {STRENGTH[check.score]}</span>}
        </FieldDescription>
        {problems.length > 0 && <FieldError match>{problems.join(" ")}</FieldError>}
      </Field>
      <Field invalid={!!confirmError}>
        <FieldLabel>{label} 확인</FieldLabel>
        <PasswordInput value={confirm} onChange={(event) => onConfirm(event.target.value)} autoComplete="new-password" aria-invalid={!!confirmError || undefined} />
        {confirmError && <FieldError match>{confirmError}</FieldError>}
      </Field>
    </>
  );
}

export function RecoveryKeyStep({ recoveryKey, onDone, doneLabel = "다음" }: { recoveryKey: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="grid gap-5">
      <div className="grid gap-2 text-sm">
        <p>마스터 비밀번호를 잊었을 때 이 복구 키로만 계정을 되찾을 수 있어요. 회사도 대신 찾아 줄 수 없어요.</p>
        <p className="text-muted-foreground">종이에 적거나 파일로 저장해 금고와 다른 곳에 보관하세요. 다른 사람에게 보여 주지 마세요.</p>
      </div>
      <RevealBox label="복구 키" lines={recoveryKey.split("-").reduce<string[]>((rows, part, index) => {
        if (index % 4 === 0) rows.push(part);
        else rows[rows.length - 1] += `-${part}`;
        return rows;
      }, [])} fileName="KeyManager-복구키.txt" fileHeader="KeyManager 복구 키(다른 사람에게 보여 주지 마세요)" />
      <Label className="flex items-start gap-2 text-sm">
        <Checkbox checked={saved} onCheckedChange={(value) => setSaved(value === true)} />
        복구 키를 안전한 곳에 보관했어요.
      </Label>
      <Button type="button" disabled={!saved} onClick={onDone} className="justify-self-start">
        {doneLabel}
      </Button>
    </div>
  );
}

export function BackupCodesStep({ codes, onDone, doneLabel = "마치기" }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="grid gap-5">
      <div className="grid gap-2 text-sm">
        <p>휴대폰을 잃었을 때 인증 코드 대신 쓰는 예비 코드예요. 코드마다 한 번만 쓸 수 있어요.</p>
        <p className="text-muted-foreground">지금 한 번만 보여 줘요. 복구 키와 같이 안전한 곳에 보관하세요.</p>
      </div>
      <RevealBox label="예비 코드 10개" lines={codes} fileName="KeyManager-예비코드.txt" fileHeader="KeyManager 2단계 인증 예비 코드(한 번씩만 쓸 수 있어요)" />
      <Label className="flex items-start gap-2 text-sm">
        <Checkbox checked={saved} onCheckedChange={(value) => setSaved(value === true)} />
        예비 코드를 안전한 곳에 보관했어요.
      </Label>
      <Button type="button" disabled={!saved} onClick={onDone} className="justify-self-start">
        {doneLabel}
      </Button>
    </div>
  );
}

export function TotpEnrollStep({ onEnrolled }: { onEnrolled: (result: { backupCodes: string[]; next: "done" | "recovery" }) => void }) {
  const started = useRef(false);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // 개발 모드에서 효과가 두 번 돌아도 등록을 한 번만 시작한다(두 번 시작하면 먼저 그린 QR이 무효가 된다).
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const { otpauthUri, secret } = await startTotpEnrollment();
        const qr = await QRCode.toDataURL(otpauthUri, { margin: 1, width: 192 });
        setSetup({ qr, secret });
      } catch (failure) {
        setLoadError(
          errorStatus(failure) === 401 ? "등록 시간이 지났어요. 처음부터 다시 하세요." : describeError(failure, "2단계 인증 등록을 시작하지 못했어요. 새로 고친 뒤 다시 하세요."),
        );
      }
    })();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("인증 앱에 보이는 6자리 숫자를 넣으세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onEnrolled(await confirmTotpEnrollment(code));
    } catch (failure) {
      setError(errorStatus(failure) === 401 ? "등록 시간이 지났어요. 처음부터 다시 하세요." : describeError(failure, "코드가 맞지 않아요. 새 코드로 다시 넣으세요."));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <FormError message={loadError} />;
  return (
    <form onSubmit={submit} className="grid gap-5">
      <p className="text-sm">
        휴대폰 인증 앱(Google Authenticator, Microsoft Authenticator 등)으로 아래 QR을 찍은 뒤, 앱에 보이는 6자리 숫자를 넣으세요.
      </p>
      <div className="flex flex-wrap items-center gap-5">
        {setup ? (
          <img src={setup.qr} alt="인증 앱 등록용 QR 코드" width={192} height={192} className="rounded-lg border bg-white p-1" />
        ) : (
          <Skeleton className="size-48" aria-label="QR 코드를 만드는 중" />
        )}
        <div className="grid gap-1 text-sm">
          <span className="text-muted-foreground">QR을 찍을 수 없으면 이 값을 직접 넣으세요.</span>
          <span className="break-all font-mono">{setup ? setup.secret.match(/.{1,4}/g)?.join(" ") : "불러오는 중"}</span>
        </div>
      </div>
      <Field invalid={!!error}>
        <FieldLabel>인증 코드</FieldLabel>
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          className="max-w-40 font-mono tabular-nums"
          aria-invalid={!!error || undefined}
        />
        {error && <FieldError match>{error}</FieldError>}
      </Field>
      <Button type="submit" loading={busy} disabled={!setup} className="justify-self-start">
        등록 확인
      </Button>
    </form>
  );
}
