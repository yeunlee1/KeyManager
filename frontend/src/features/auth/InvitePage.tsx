// 초대 수락(설계서 5.2절): 링크의 비밀로 초대를 확인 → 마스터 비밀번호 → 복구 키 → 2단계 인증 → 예비 코드
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { acceptInvite, lookupInvite, type InviteLookup } from "@/api/admin";
import { getMe } from "@/api/auth";
import { describeError, errorStatus } from "@/api/errors";
import { Steps } from "@/components/Steps";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { UnlockedKeys } from "@/lib/crypto/account";
import { parseInviteFragment } from "@/lib/crypto/trust";
import { buildAcceptance, checkInviteOffer } from "../admin/key-ops";
import { useAuth } from "./auth-context";
import { AuthLayout, BackupCodesStep, FormError, NewPasswordFields, RecoveryKeyStep, TotpEnrollStep } from "./flow-steps";
import { newPasswordProblem } from "@/lib/password-policy";

const STEPS = ["마스터 비밀번호", "복구 키", "2단계 인증", "예비 코드"];

export function InvitePage() {
  const { acceptUnlockedKeys } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<{ lookup: InviteLookup; token: string; secret: Uint8Array } | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const keysRef = useRef<UnlockedKeys | null>(null);
  const read = useRef(false);

  useEffect(() => {
    if (read.current) return;
    read.current = true;
    let parsed: { token: string; secret: Uint8Array };
    try {
      parsed = parseInviteFragment(window.location.hash);
    } catch (failure) {
      setInvalid(describeError(failure, "초대 링크가 올바르지 않아요. 받은 링크 전체를 그대로 여세요."));
      return;
    }
    // 주소창·방문 기록에 초대 비밀이 남지 않게 # 뒤를 지운다. 비밀은 이 화면의 메모리에만 둔다.
    window.history.replaceState(null, "", "/invite");
    void (async () => {
      try {
        const lookup = await lookupInvite(parsed.token);
        if (!(await checkInviteOffer(lookup, parsed.secret))) {
          setInvalid("초대 내용이나 관리자 공개키가 링크와 맞지 않아요. 링크를 보낸 관리자에게 새 링크를 받으세요.");
          return;
        }
        setInvite({ lookup, ...parsed });
      } catch (failure) {
        setInvalid(
          errorStatus(failure) === 404
            ? "이 초대는 쓸 수 없어요. 이미 썼거나, 취소됐거나, 72시간이 지났어요. 관리자에게 새 초대를 받으세요."
            : describeError(failure, "초대를 확인하지 못했어요. 링크를 다시 여세요."),
        );
      }
    })();
  }, []);

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!invite) return;
    setBusy(true);
    try {
      const problem = await newPasswordProblem(password, confirm, { loginId: invite.lookup.loginId, name: invite.lookup.name });
      if (problem) {
        setErrors(problem);
        return;
      }
      setErrors({});
      const accepted = await buildAcceptance(invite.lookup, invite.secret, password);
      await acceptInvite({ ...accepted.material, token: invite.token, acceptMac: accepted.acceptMac, inviterTrustRecordEnc: accepted.inviterTrustRecordEnc });
      invite.secret.fill(0);
      keysRef.current = accepted.keys;
      setRecoveryKey(accepted.recoveryKey);
      setPassword("");
      setConfirm("");
      setStep(1);
    } catch (failure) {
      setErrors({
        form:
          errorStatus(failure) === 404
            ? "이 초대는 더 쓸 수 없어요. 관리자에게 새 초대를 받으세요."
            : describeError(failure, "가입하지 못했어요. 다시 시도하세요."),
      });
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

  if (invalid) {
    return (
      <AuthLayout title="초대를 열 수 없어요">
        <FormError message={invalid} />
      </AuthLayout>
    );
  }
  if (!invite) {
    return (
      <AuthLayout title="초대 확인 중">
        <div className="grid gap-3" aria-busy="true" aria-label="초대를 확인하는 중">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      </AuthLayout>
    );
  }

  const { lookup } = invite;
  return (
    <AuthLayout
      title={`${lookup.name}님, KeyManager에 오신 것을 환영해요`}
      description={
        <>
          {lookup.inviter.name}님이 아이디 <span className="font-mono text-foreground">{lookup.loginId}</span>(으)로 초대했어요. 초대는{" "}
          {new Date(lookup.expiresAt).toLocaleString("ko-KR")}까지 쓸 수 있어요.
        </>
      }
    >
      <Steps steps={STEPS} current={step} />
      {step === 0 && (
        <form onSubmit={submitPassword} className="grid gap-5" noValidate>
          {lookup.role === "admin" && (
            <p className="rounded-lg border border-info/30 bg-info/8 px-3 py-2 text-info-foreground text-sm">
              관리자로 초대받았어요. 가입을 마친 뒤 초대한 관리자가 확인을 마치면 관리자가 돼요.
            </p>
          )}
          <NewPasswordFields
            password={password}
            confirm={confirm}
            onPassword={setPassword}
            onConfirm={setConfirm}
            context={{ loginId: lookup.loginId, name: lookup.name }}
            confirmError={errors.confirm ?? null}
          />
          {errors.password && <FormError message={errors.password} />}
          <FormError message={errors.form ?? null} />
          <Button type="submit" loading={busy} className="justify-self-start">
            가입하기
          </Button>
          {busy && <p className="text-muted-foreground text-sm">열쇠를 만드는 중이에요. 몇 초 걸릴 수 있어요.</p>}
        </form>
      )}
      {step === 1 && <RecoveryKeyStep recoveryKey={recoveryKey} onDone={() => setStep(2)} />}
      {step === 2 && (
        <TotpEnrollStep
          onEnrolled={(result) => {
            setBackupCodes(result.backupCodes);
            setStep(3);
          }}
        />
      )}
      {step === 3 && <BackupCodesStep codes={backupCodes} doneLabel="금고 열기" onDone={() => void finish()} />}
      {step >= 1 && <FormError message={errors.form ?? null} />}
    </AuthLayout>
  );
}
