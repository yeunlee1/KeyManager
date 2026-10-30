// 잠긴 금고 열기(설계서 5.5절): 정상 세션 안에서 마스터 비밀번호만 넣어 이 브라우저 메모리에 열쇠를 다시 연다.
import { LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { loginValues, unlockAccount } from "@/lib/crypto/account";
import { useAuth } from "./auth-context";
import { AuthLayout } from "./flow-steps";

export function UnlockPage() {
  const { me, acceptUnlockedKeys, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError("마스터 비밀번호를 넣으세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { masterWrapKey } = await loginValues(password, me.kdfSalt, me.kdfParams);
      const keys = await unlockAccount(me, masterWrapKey);
      setPassword("");
      acceptUnlockedKeys(keys);
    } catch {
      setError("마스터 비밀번호가 맞지 않아요. 다시 넣으세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="금고가 잠겼어요"
      description={
        <>
          {me.name}({me.loginId})님, 마스터 비밀번호를 넣으면 다시 열려요. 15분 동안 조작이 없거나 새로 고치면 자동으로 잠겨요.
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-5" noValidate>
        {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알도록 아이디를 숨겨 둔다. */}
        <input type="text" name="username" autoComplete="username" value={me.loginId} readOnly hidden />
        <Field invalid={!!error}>
          <FieldLabel>마스터 비밀번호</FieldLabel>
          <PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus aria-invalid={!!error || undefined} />
          {error && <FieldError match>{error}</FieldError>}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>
            <LockKeyhole aria-hidden />
            금고 열기
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            로그아웃
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
