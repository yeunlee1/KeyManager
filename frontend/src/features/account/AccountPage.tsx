// 내 계정(설계서 7절): 마스터 비밀번호 바꾸기, 다른 사람과 안전 번호 확인, 로그아웃
import { LogOut } from "lucide-react";
import { useState, type FormEvent } from "react";
import { changePassword } from "@/api/auth";
import { describeError, errorStatus } from "@/api/errors";
import type { DirectoryUser } from "@/api/vault";
import { PasswordInput } from "@/components/PasswordInput";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toastManager } from "@/components/ui/toast";
import { changePasswordMaterial, loginValues } from "@/lib/crypto/account";
import { useAuth } from "../auth/auth-context";
import { newPasswordProblem } from "@/lib/password-policy";
import { NewPasswordFields } from "../auth/flow-steps";
import { SafetyNumberDialog } from "../vault/SafetyNumberDialog";
import type { TrustState } from "../vault/trust";
import { useVault } from "../vault/vault-context";

export function TrustBadge({ trust, userId }: { trust: TrustState | null; userId: string }) {
  if (!trust) return null;
  if (trust.changed.has(userId)) return <Badge variant="error">공개키 바뀜</Badge>;
  const known = trust.known.get(userId);
  if (known?.via === "record") return <Badge variant="success">확인함</Badge>;
  if (known?.via === "admin-chain") return <Badge variant="info">관리자 승인으로 확인</Badge>;
  return <Badge variant="outline">확인 안 함</Badge>;
}

function PasswordSection() {
  const { me, keys } = useVault();
  const auth = useAuth();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) {
      setErrors({ current: "지금 마스터 비밀번호를 넣으세요." });
      return;
    }
    setBusy(true);
    try {
      const problem = await newPasswordProblem(password, confirm, { loginId: me.loginId, name: me.name, current });
      if (problem) {
        setErrors(problem);
        return;
      }
      setErrors({});
      const { authValue: currentAuthValue } = await loginValues(current, me.kdfSalt, me.kdfParams);
      const material = await changePasswordMaterial(keys.accountKeyRaw, password, me.id);
      await changePassword({ ...material, currentAuthValue });
      await auth.refreshMe();
      setCurrent("");
      setPassword("");
      setConfirm("");
      toastManager.add({ title: "마스터 비밀번호를 바꿨어요", description: "다른 기기의 로그인은 모두 끝냈어요.", type: "success" });
    } catch (failure) {
      const status = errorStatus(failure);
      setErrors(status === 401 || status === 403 ? { current: "지금 마스터 비밀번호가 맞지 않아요." } : { form: describeError(failure, "바꾸지 못했어요. 다시 시도하세요.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="password-title" className="grid gap-4">
      <div>
        <h2 id="password-title" className="font-heading font-semibold text-lg">
          마스터 비밀번호 바꾸기
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">바꾸면 다른 기기의 로그인은 끝나요. 복구 키는 그대로 쓸 수 있어요.</p>
      </div>
      <form onSubmit={submit} className="grid max-w-xl gap-4" noValidate>
        <input type="text" name="username" autoComplete="username" value={me.loginId} readOnly hidden />
        <Field invalid={!!errors.current}>
          <FieldLabel>지금 마스터 비밀번호</FieldLabel>
          <PasswordInput value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" aria-invalid={!!errors.current || undefined} />
          {errors.current && <FieldError match>{errors.current}</FieldError>}
        </Field>
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          context={{ loginId: me.loginId, name: me.name, current }}
          label="새 마스터 비밀번호"
          confirmError={errors.confirm ?? null}
        />
        {(errors.password || errors.form) && (
          <p role="alert" className="text-destructive-foreground text-sm">
            {errors.password ?? errors.form}
          </p>
        )}
        <Button type="submit" loading={busy} className="justify-self-start">
          비밀번호 바꾸기
        </Button>
      </form>
    </section>
  );
}

export function AccountPage() {
  const { signOut } = useAuth();
  const vault = useVault();
  const [subject, setSubject] = useState<DirectoryUser | null>(null);
  const others = vault.directory.filter((user) => user.id !== vault.me.id && user.status === "active");

  return (
    <div className="grid gap-10">
      <div>
        <h1 className="font-heading font-semibold text-2xl">내 계정</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {vault.me.name} · <span className="font-mono">{vault.me.loginId}</span> · {vault.me.role === "admin" ? "관리자" : "직원"}
        </p>
      </div>
      <PasswordSection />
      <Separator />
      <section aria-labelledby="trust-title" className="grid gap-4">
        <div>
          <h2 id="trust-title" className="font-heading font-semibold text-lg">
            사람 확인(안전 번호)
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            묶음 열쇠를 건네거나 받으려면 상대의 공개키를 확인해야 해요. 초대로 이어진 사람은 자동으로 확인되고, 그 밖의 사람은 안전 번호를 직접 비교해요.
          </p>
        </div>
        {others.length === 0 ? (
          <p className="text-muted-foreground text-sm">아직 다른 사용자가 없어요.</p>
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="사람 확인 목록" tabIndex={0}>
            <div className="min-w-[560px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead>확인 상태</TableHead>
                    <TableHead className="w-36">
                      <span className="sr-only">작업</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {others.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="font-medium">{user.name}</div>
                        <div className="font-mono text-muted-foreground text-xs">{user.loginId}</div>
                      </TableCell>
                      <TableCell>{user.role === "admin" ? "관리자" : "직원"}</TableCell>
                      <TableCell>
                        <TrustBadge trust={vault.trust} userId={user.id} />
                      </TableCell>
                      <TableCell>
                        <Button type="button" variant="outline" size="sm" onClick={() => setSubject(user)}>
                          안전 번호 비교
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>
      <Separator />
      <section aria-labelledby="signout-title" className="grid gap-3">
        <h2 id="signout-title" className="font-heading font-semibold text-lg">
          로그아웃
        </h2>
        <p className="text-muted-foreground text-sm">이 브라우저의 로그인을 끝내고 금고 열쇠를 지워요. 같은 브라우저의 다른 탭도 함께 로그아웃돼요.</p>
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => void signOut()}>
          <LogOut aria-hidden />
          로그아웃
        </Button>
      </section>
      <SafetyNumberDialog subject={subject} open={!!subject} onOpenChange={(open) => !open && setSubject(null)} />
    </div>
  );
}
