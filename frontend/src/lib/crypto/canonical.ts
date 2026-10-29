// 서명·MAC·안전 번호에 넣는 입력을 정해진 형식(설계서 4.9절)으로 만든다: 첫 줄 km:v1:{목적}, 아래 값 한 줄씩
import { utf8 } from "./encoding";
import { sha256 } from "./primitives";

export type CanonicalPurpose =
  | "invite-offer"
  | "invite-accept"
  | "admin-grant"
  | "group-key-share"
  | "safety-number";

export function canonicalInput(purpose: CanonicalPurpose | string, values: string[]): string {
  for (const value of [purpose, ...values]) {
    if (/[\r\n]/.test(value)) throw new Error("서명 입력 값에 줄 바꿈이 들어 있어요.");
  }
  return [`km:v1:${purpose}`, ...values].join("\n");
}

export interface PublicIdentity {
  id: string;
  encPublicKey: string;
  signPublicKey: string;
}

// 두 사람이 각자 화면에서 계산해 전화·대면으로 비교하는 번호. 5자리 숫자 6묶음.
export async function safetyNumber(a: PublicIdentity, b: PublicIdentity): Promise<string> {
  const [first, second] = [a, b].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const digest = await sha256(
    utf8(
      canonicalInput("safety-number", [
        first.id,
        first.encPublicKey,
        first.signPublicKey,
        second.id,
        second.encPublicKey,
        second.signPublicKey,
      ]),
    ),
  );
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    // 5바이트(40비트)는 Number로 정확히 나타낼 수 있다.
    let value = 0;
    for (let j = 0; j < 5; j++) value = value * 256 + digest[i * 5 + j];
    groups.push(String(value % 100000).padStart(5, "0"));
  }
  return groups.join(" ");
}
