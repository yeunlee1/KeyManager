// 로그인(설계서 5.5절): 아이디·마스터 비밀번호 → 인증 코드(또는 예비 코드) → 금고 열기. 등록 전이면 2단계 인증 등록으로 이어진다.
import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { getMe, login, loginSecondFactor, prelogin } from "@/api/auth";
import { describeError, errorStatus } from "@/api/errors";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginValues, unlockAccount } from "@/lib/crypto/account";
import { useAuth } from "./auth-context";
import { AuthLayout, BackupCodesStep, FormError, TotpEnrollStep } from "./flow-steps";

export const LOGIN_ID_PATTERN = /^[a-z0-9._-]{3,64}$/;

type Phase = "credentials" | "second" | "enroll" | "backup";

export function LoginPage() {
  const { acceptUnlockedKeys } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/vault";
  const [phase, setPhase] = useState<Phase>("credentials");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 마스터 비밀번호에서 나온 잠금 열쇠는 상태가 아니라 참조에만 두고, 금고를 연 뒤 버린다.
  const wrapKey = useRef<CryptoKey | null>(null);

  const finish = async () => {
    const me = await getMe();
    if (!wrapKey.current) throw new Error("다시 로그인하세요.");
    const keys = await unlockAccount(me, wrapKey.current);
    wrapKey.current = null;
    acceptUnlockedKeys(keys, me);
    navigate(from, { replace: true });
  };

  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    const id = loginId.trim().toLowerCase();
    if (!LOGIN_ID_PATTERN.test(id)) {
      setError("아이디는 영문 소문자·숫자·점·밑줄·하이픈 3~64자예요.");
      return;
    }
    if (!password) {
      setError("마스터 비밀번호를 넣으세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { kdfSalt, kdfParams } = await prelogin(id);
      const values = await loginValues(password, kdfSalt, kdfParams);
      const { next } = await login(id, values.authValue);
      wrapKey.current = values.masterWrapKey;
      setPassword("");
      setPhase(next === "totp" ? "second" : "enroll");
    } catch (failure) {
      setError(errorStatus(failure) === 401 ? "아이디 또는 비밀번호가 맞지 않아요." : describeError(failure, "로그인하지 못했어요. 다시 시도하세요."));
    } finally {
      setBusy(false);
    }
  };

  const submitSecond = async (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (!useBackup && !/^\d{6}$/.test(value)) {
      setError("인증 앱에 보이는 6자리 숫자를 넣으세요.");
      return;
    }
    if (useBackup && value.replace(/[\s-]/g, "").length !== 12) {
      setError("예비 코드 12자를 넣으세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { next } = await loginSecondFactor(useBackup ? { backupCode: value } : { code: value });
      if (next === "done") await finish();
      else setPhase("enroll");
    } catch (failure) {
      const status = errorStatus(failure);
      setError(
        status === 401
          ? "코드가 맞지 않거나 로그인 시간이 지났어요. 새 코드로 다시 넣거나 처음부터 다시 로그인하세요."
          : describeError(failure, "확인하지 못했어요. 다시 시도하세요."),
      );
    } finally {
      setBusy(false);
    }
  };

  if (phase === "enroll" || phase === "backup") {
    return (
      <AuthLayout title="2단계 인증 등록" description="로그인을 마치려면 인증 앱을 등록해야 해요.">
        {phase === "enroll" ? (
          <TotpEnrollStep
            onEnrolled={(result) => {
              setBackupCodes(result.backupCodes);
              setPhase("backup");
            }}
          />
        ) : (
          <BackupCodesStep
            codes={backupCodes}
            doneLabel="금고 열기"
            onDone={() => void finish().catch((failure) => setError(describeError(failure, "금고를 열지 못했어요. 다시 로그인하세요.")))}
          />
        )}
        <FormError message={error} />
      </AuthLayout>
    );
  }

  if (phase === "second") {
    return (
      <AuthLayout title="인증 코드 확인" description="휴대폰 인증 앱에 보이는 6자리 숫자를 넣으세요.">
        <form onSubmit={submitSecond} className="grid gap-5" noValidate>
          <Field invalid={!!error}>
            <FieldLabel>{useBackup ? "예비 코드" : "인증 코드"}</FieldLabel>
            <Input
              value={code}
              onChange={(event) => setCode(useBackup ? event.target.value.slice(0, 20) : event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              className="max-w-56 font-mono tabular-nums"
              aria-invalid={!!error || undefined}
              autoFocus
            />
            {error && <FieldError match>{error}</FieldError>}
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy}>
              로그인
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setUseBackup((value) => !value);
                setCode("");
                setError(null);
              }}
            >
              {useBackup ? "인증 코드 쓰기" : "휴대폰이 없어요(예비 코드 쓰기)"}
            </Button>
          </div>
          {useBackup && <p className="text-muted-foreground text-sm">예비 코드로 들어가면 새 휴대폰으로 2단계 인증을 다시 등록해요.</p>}
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="로그인" description="회사 접속 정보와 라이선스를 관리하는 KeyManager예요.">
      <form onSubmit={submitCredentials} className="grid gap-5" noValidate>
        <Field>
          <FieldLabel>아이디</FieldLabel>
          <Input value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" autoCapitalize="off" spellCheck={false} autoFocus />
        </Field>
        <Field invalid={!!error}>
          <FieldLabel>마스터 비밀번호</FieldLabel>
          <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={!!error || undefined} />
          {error && <FieldError match>{error}</FieldError>}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>
            다음
          </Button>
          <Link to="/recover" className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline">
            마스터 비밀번호를 잊었어요
          </Link>
        </div>
        {busy && <p className="text-muted-foreground text-sm">비밀번호를 안전하게 변환하는 중이에요. 몇 초 걸릴 수 있어요.</p>}
      </form>
    </AuthLayout>
  );
}
