// 마스터 비밀번호 분실 복구(설계서 5.6절): 아이디·복구 키·인증 코드 → (2단계 인증 다시 등록) → 새 마스터 비밀번호 → 새 복구 키
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { completeRecovery, getRecoveryMaterial, startRecovery } from "@/api/auth";
import { describeError, errorStatus } from "@/api/errors";
import { Steps } from "@/components/Steps";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { changePasswordMaterial, newRecoveryMaterial, openWithRecovery, parseRecoveryKey } from "@/lib/crypto/account";
import { useAuth } from "./auth-context";
import { AuthLayout, BackupCodesStep, FormError, NewPasswordFields, RecoveryKeyStep, TotpEnrollStep } from "./flow-steps";
import { newPasswordProblem } from "@/lib/password-policy";
import { LOGIN_ID_PATTERN } from "./LoginPage";

type SecondFactor = "code" | "backup" | "reset";
type Phase = "start" | "enroll" | "backup" | "password" | "newKey" | "done";

const PHASE_STEP: Record<Phase, number> = { start: 0, enroll: 1, backup: 1, password: 2, newKey: 3, done: 3 };

export function RecoverPage() {
  const { reload } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("start");
  const [loginId, setLoginId] = useState("");
  const [recoveryText, setRecoveryText] = useState("");
  const [factor, setFactor] = useState<SecondFactor>("code");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ loginId?: string; recovery?: string; code?: string; password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [newRecoveryKey, setNewRecoveryKey] = useState("");
  const wrapKeyRef = useRef<CryptoKey | null>(null);

  const submitStart = async (event: FormEvent) => {
    event.preventDefault();
    const id = loginId.trim().toLowerCase();
    const next: typeof errors = {};
    if (!LOGIN_ID_PATTERN.test(id)) next.loginId = "아이디는 영문 소문자·숫자·점·밑줄·하이픈 3~64자예요.";
    if (factor === "code" && !/^\d{6}$/.test(code)) next.code = "인증 앱에 보이는 6자리 숫자를 넣으세요.";
    if (factor === "backup" && code.replace(/[\s-]/g, "").length !== 12) next.code = "예비 코드 12자를 넣으세요.";
    let recovery: Awaited<ReturnType<typeof parseRecoveryKey>> | null = null;
    try {
      recovery = await parseRecoveryKey(recoveryText);
    } catch (failure) {
      next.recovery = describeError(failure, "복구 키를 다시 확인하세요.");
    }
    setErrors(next);
    if (Object.keys(next).length || !recovery) return;
    setBusy(true);
    try {
      const { next: stage } = await startRecovery({
        loginId: id,
        recoveryAuthValue: recovery.recoveryAuthValue,
        ...(factor === "code" ? { code } : factor === "backup" ? { backupCode: code.trim() } : {}),
      });
      wrapKeyRef.current = recovery.recoveryWrapKey;
      setPhase(stage === "recovery" ? "password" : "enroll");
    } catch (failure) {
      setErrors({
        form:
          errorStatus(failure) === 401
            ? "아이디, 복구 키 또는 인증 코드가 맞지 않아요. 휴대폰과 예비 코드가 모두 없으면 관리자에게 2단계 인증 초기화를 부탁하세요."
            : describeError(failure, "복구를 시작하지 못했어요. 다시 시도하세요."),
      });
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const id = loginId.trim().toLowerCase();
      const problem = await newPasswordProblem(password, confirm, { loginId: id, name: "" });
      if (problem) {
        setErrors(problem);
        return;
      }
      setErrors({});
      const material = await getRecoveryMaterial();
      if (!wrapKeyRef.current) throw new Error("처음부터 다시 하세요.");
      const accountKeyRaw = await openWithRecovery(material.accountKeyRecovery, wrapKeyRef.current, material.userId);
      try {
        const passwordPart = await changePasswordMaterial(accountKeyRaw, password, material.userId);
        const recovery = await newRecoveryMaterial(accountKeyRaw, material.userId);
        await completeRecovery({ ...passwordPart, recoveryAuthValue: recovery.recoveryAuthValue, accountKeyRecovery: recovery.accountKeyRecovery });
        setNewRecoveryKey(recovery.recoveryKey);
      } finally {
        accountKeyRaw.fill(0);
      }
      wrapKeyRef.current = null;
      setPassword("");
      setConfirm("");
      setPhase("newKey");
    } catch (failure) {
      setErrors({
        form: errorStatus(failure) === 401 ? "복구 시간이 지났어요. 처음부터 다시 하세요." : describeError(failure, "새 비밀번호를 저장하지 못했어요. 다시 시도하세요."),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="마스터 비밀번호 복구" description="보관해 둔 복구 키로 새 마스터 비밀번호를 정해요. 금고 내용은 그대로예요.">
      <Steps steps={["본인 확인", "2단계 인증", "새 비밀번호", "새 복구 키"]} current={PHASE_STEP[phase]} />
      {phase === "start" && (
        <form onSubmit={submitStart} className="grid gap-5" noValidate>
          <Field invalid={!!errors.loginId}>
            <FieldLabel>아이디</FieldLabel>
            <Input value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} autoFocus aria-invalid={!!errors.loginId || undefined} />
            {errors.loginId && <FieldError match>{errors.loginId}</FieldError>}
          </Field>
          <Field invalid={!!errors.recovery}>
            <FieldLabel>복구 키</FieldLabel>
            <Textarea value={recoveryText} onChange={(event) => setRecoveryText(event.target.value)} className="font-mono" autoComplete="off" spellCheck={false} aria-invalid={!!errors.recovery || undefined} />
            <FieldDescription>가입할 때 받은 52자예요. 하이픈·띄어쓰기·줄바꿈은 있어도 돼요.</FieldDescription>
            {errors.recovery && <FieldError match>{errors.recovery}</FieldError>}
          </Field>
          <div className="grid gap-2">
            <span className="font-medium text-sm" id="factor-label">
              2단계 인증
            </span>
            <SegmentedControl aria-labelledby="factor-label">
              {(
                [
                  ["code", "인증 코드"],
                  ["backup", "예비 코드"],
                  ["reset", "관리자가 초기화했어요"],
                ] as const
              ).map(([value, label]) => (
                <SegmentedControlItem
                  key={value}
                  aria-pressed={factor === value}
                  data-pressed={factor === value ? "" : undefined}
                  onClick={() => {
                    setFactor(value);
                    setCode("");
                  }}
                >
                  {label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
          </div>
          {factor !== "reset" ? (
            <Field invalid={!!errors.code}>
              <FieldLabel>{factor === "code" ? "인증 코드" : "예비 코드"}</FieldLabel>
              <Input
                value={code}
                onChange={(event) => setCode(factor === "code" ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value.slice(0, 20))}
                inputMode={factor === "code" ? "numeric" : "text"}
                autoComplete="one-time-code"
                className="max-w-56 font-mono tabular-nums"
                aria-invalid={!!errors.code || undefined}
              />
              {factor === "backup" && <FieldDescription>휴대폰을 잃었다면 예비 코드로 들어간 뒤 새 휴대폰을 등록해요.</FieldDescription>}
              {errors.code && <FieldError match>{errors.code}</FieldError>}
            </Field>
          ) : (
            <p className="text-muted-foreground text-sm">관리자가 2단계 인증을 초기화했다면 코드 없이 시작하고, 새 휴대폰을 등록해요.</p>
          )}
          <FormError message={errors.form ?? null} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy}>
              다음
            </Button>
            <Link to="/login" className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline">
              로그인으로 돌아가기
            </Link>
          </div>
        </form>
      )}
      {phase === "enroll" && (
        <TotpEnrollStep
          onEnrolled={(result) => {
            setBackupCodes(result.backupCodes);
            setPhase("backup");
          }}
        />
      )}
      {phase === "backup" && <BackupCodesStep codes={backupCodes} doneLabel="새 비밀번호 정하기" onDone={() => setPhase("password")} />}
      {phase === "password" && (
        <form onSubmit={submitPassword} className="grid gap-5" noValidate>
          <NewPasswordFields
            password={password}
            confirm={confirm}
            onPassword={setPassword}
            onConfirm={setConfirm}
            context={{ loginId: loginId.trim().toLowerCase(), name: "" }}
            label="새 마스터 비밀번호"
            confirmError={errors.confirm ?? null}
          />
          {errors.password && <FormError message={errors.password} />}
          <FormError message={errors.form ?? null} />
          <Button type="submit" loading={busy} className="justify-self-start">
            새 비밀번호 저장
          </Button>
        </form>
      )}
      {phase === "newKey" && (
        <>
          <p className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-warning-foreground text-sm">
            예전 복구 키는 이제 쓸 수 없어요. 아래 새 복구 키를 보관하세요.
          </p>
          <RecoveryKeyStep recoveryKey={newRecoveryKey} doneLabel="로그인하러 가기" onDone={() => setPhase("done")} />
        </>
      )}
      {phase === "done" && (
        <div className="grid gap-4 text-sm">
          <p>새 마스터 비밀번호를 저장했어요. 보안을 위해 다른 기기의 로그인도 모두 끝냈어요.</p>
          <Button
            type="button"
            className="justify-self-start"
            onClick={() => {
              void reload();
              navigate("/login", { replace: true });
            }}
          >
            새 비밀번호로 로그인
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
