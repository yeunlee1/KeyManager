// 처음 설정(설계서 5.1절): 설정 코드 → 첫 관리자 정보·마스터 비밀번호 → 복구 키 → 2단계 인증 → 예비 코드
import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { getMe, setupFirstAdmin } from "@/api/auth";
import { describeError, errorStatus } from "@/api/errors";
import { Steps } from "@/components/Steps";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createAccount, type UnlockedKeys } from "@/lib/crypto/account";
import { normalizeCrockford } from "@/lib/crypto/encoding";
import { sign } from "@/lib/crypto/primitives";
import { adminGrantInput } from "../vault/trust";
import { useAuth } from "./auth-context";
import { AuthLayout, BackupCodesStep, FormError, NewPasswordFields, RecoveryKeyStep, TotpEnrollStep } from "./flow-steps";
import { newPasswordProblem } from "@/lib/password-policy";
import { LOGIN_ID_PATTERN } from "./LoginPage";

const STEPS = ["설정 코드", "관리자 정보", "복구 키", "2단계 인증", "예비 코드"];

export function SetupPage() {
  const { acceptUnlockedKeys } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [setupCode, setSetupCode] = useState("");
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ code?: string; loginId?: string; name?: string; password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const keysRef = useRef<UnlockedKeys | null>(null);

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (normalizeCrockford(setupCode).length !== 10) {
      setErrors({ code: "서버 콘솔에 찍힌 설정 코드 10자를 넣으세요." });
      return;
    }
    setErrors({});
    setStep(1);
  };

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    const id = loginId.trim().toLowerCase();
    const next: typeof errors = {};
    if (!LOGIN_ID_PATTERN.test(id)) next.loginId = "아이디는 영문 소문자·숫자·점·밑줄·하이픈 3~64자예요.";
    if (!name.trim() || name.trim().length > 100) next.name = "이름을 100자 안에서 넣으세요.";
    setBusy(true);
    try {
      const problem = await newPasswordProblem(password, confirm, { loginId: id, name: name.trim() });
      Object.assign(next, problem ?? {});
      setErrors(next);
      if (Object.keys(next).length) return;
      const userId = crypto.randomUUID();
      const created = await createAccount(password, userId);
      const adminGrantSig = await sign(
        created.keys.signPrivateKey,
        adminGrantInput({ id: userId, loginId: id, encPublicKey: created.material.encPublicKey, signPublicKey: created.material.signPublicKey }),
      );
      await setupFirstAdmin({ ...created.material, setupCode: normalizeCrockford(setupCode), loginId: id, name: name.trim(), adminGrantSig });
      keysRef.current = created.keys;
      setRecoveryKey(created.recoveryKey);
      setPassword("");
      setConfirm("");
      setStep(2);
    } catch (failure) {
      const status = errorStatus(failure);
      if (status === 401 || status === 403) {
        setErrors({ code: "설정 코드가 맞지 않아요. 서버 콘솔의 코드를 다시 확인하세요." });
        setStep(0);
      } else {
        setErrors({ form: describeError(failure, "첫 관리자를 만들지 못했어요. 다시 시도하세요.") });
      }
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    try {
      const me = await getMe();
      if (!keysRef.current) throw new Error("다시 로그인하세요.");
      acceptUnlockedKeys(keysRef.current, me);
      navigate("/vault", { replace: true });
    } catch (failure) {
      setErrors({ form: describeError(failure, "금고를 열지 못했어요. 로그인 화면에서 다시 들어오세요.") });
    }
  };

  return (
    <AuthLayout title="KeyManager 처음 설정" description="첫 관리자 계정을 만들어요. 이 화면은 사용자가 한 명도 없을 때만 열려요.">
      <Steps steps={STEPS} current={step} />
      {step === 0 && (
        <form onSubmit={submitCode} className="grid gap-5" noValidate>
          <Field invalid={!!errors.code}>
            <FieldLabel>설정 코드</FieldLabel>
            <Input value={setupCode} onChange={(event) => setSetupCode(event.target.value)} className="max-w-56 font-mono uppercase" autoComplete="off" spellCheck={false} autoFocus aria-invalid={!!errors.code || undefined} />
            <FieldDescription>서버를 처음 켰을 때 서버 콘솔에 한 번 찍힌 10자예요.</FieldDescription>
            {errors.code && <FieldError match>{errors.code}</FieldError>}
          </Field>
          <Button type="submit" className="justify-self-start">
            다음
          </Button>
        </form>
      )}
      {step === 1 && (
        <form onSubmit={submitAccount} className="grid gap-5" noValidate>
          <Field invalid={!!errors.loginId}>
            <FieldLabel>아이디</FieldLabel>
            <Input value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} aria-invalid={!!errors.loginId || undefined} />
            <FieldDescription>영문 소문자·숫자·점·밑줄·하이픈 3~64자</FieldDescription>
            {errors.loginId && <FieldError match>{errors.loginId}</FieldError>}
          </Field>
          <Field invalid={!!errors.name}>
            <FieldLabel>이름</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" aria-invalid={!!errors.name || undefined} />
            {errors.name && <FieldError match>{errors.name}</FieldError>}
          </Field>
          <NewPasswordFields
            password={password}
            confirm={confirm}
            onPassword={setPassword}
            onConfirm={setConfirm}
            context={{ loginId: loginId.trim().toLowerCase(), name: name.trim() }}
            confirmError={errors.confirm ?? null}
          />
          {errors.password && <FormError message={errors.password} />}
          <FormError message={errors.form ?? null} />
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => setStep(0)} disabled={busy}>
              이전
            </Button>
            <Button type="submit" loading={busy}>
              관리자 만들기
            </Button>
          </div>
          {busy && <p className="text-muted-foreground text-sm">열쇠를 만드는 중이에요. 몇 초 걸릴 수 있어요.</p>}
        </form>
      )}
      {step === 2 && <RecoveryKeyStep recoveryKey={recoveryKey} onDone={() => setStep(3)} />}
      {step === 3 && (
        <TotpEnrollStep
          onEnrolled={(result) => {
            setBackupCodes(result.backupCodes);
            setStep(4);
          }}
        />
      )}
      {step === 4 && <BackupCodesStep codes={backupCodes} doneLabel="금고 열기" onDone={() => void finish()} />}
      {step >= 2 && <FormError message={errors.form ?? null} />}
    </AuthLayout>
  );
}
