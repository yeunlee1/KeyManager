// 2단계 인증(TOTP) 비밀값 만들기, 등록 주소 만들기, 코드 확인(이미 쓴 구간 거부)
import { Secret, TOTP } from "otpauth";

const ISSUER = "KeyManager";

function build(secret: string, label = ISSUER): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

export function createTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function otpAuthUri(secret: string, loginId: string): string {
  return build(secret, loginId).toString();
}

export interface TotpResult {
  ok: boolean;
  // 성공한 시간 구간 번호. 다음 확인 때 이 구간과 그 이전 구간의 코드를 거부하는 데 쓴다.
  step: number | null;
}

export function verifyTotp(
  secret: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
): TotpResult {
  if (!/^\d{6}$/.test(code)) return { ok: false, step: null };
  const totp = build(secret);
  // 시계 차이를 감안해 앞뒤 한 구간까지만 본다(RFC 6238 §5.2).
  const delta = totp.validate({ token: code, timestamp: now, window: 1 });
  if (delta === null) return { ok: false, step: null };
  const step = totp.counter({ timestamp: now }) + delta;
  if (lastStep !== null && step <= lastStep) return { ok: false, step: null };
  return { ok: true, step };
}
