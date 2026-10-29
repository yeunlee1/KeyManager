// 마스터 비밀번호 강도 조건(설계서 4.1절): 12자 이상, 강도 점수 3 이상, 아이디·이름 금지, 바꿀 때 지금과 다름.
// 강도 검사는 브라우저 안에서만 한다(비밀번호나 해시를 외부로 보내지 않는다). 사전이 커서 처음 쓸 때만 불러온다.
import type { ZxcvbnFactory } from "@zxcvbn-ts/core";

export interface PasswordContext {
  loginId: string;
  name: string;
  current?: string;
}

export interface PolicyResult {
  ok: boolean;
  problems: string[];
  // 0~4. 계산하지 못했으면 null
  score: number | null;
}

export const MIN_MASTER_PASSWORD_LENGTH = 12;

let factory: Promise<ZxcvbnFactory> | null = null;

function loadFactory(): Promise<ZxcvbnFactory> {
  factory ??= Promise.all([import("@zxcvbn-ts/core"), import("@zxcvbn-ts/language-common")]).then(
    ([core, common]) =>
      new core.ZxcvbnFactory({ dictionary: { ...common.dictionary }, graphs: common.adjacencyGraphs }),
  );
  return factory;
}

function includesIgnoringCase(password: string, part: string): boolean {
  return part.length > 0 && password.toLowerCase().includes(part.toLowerCase());
}

export async function checkMasterPassword(password: string, context: PasswordContext): Promise<PolicyResult> {
  const problems: string[] = [];
  const normalized = password.normalize("NFC");
  if ([...normalized].length < MIN_MASTER_PASSWORD_LENGTH) problems.push("12자 이상이어야 해요.");
  const loginId = context.loginId.trim();
  const name = context.name.trim();
  if ((loginId.length >= 3 && includesIgnoringCase(normalized, loginId)) || (name.length >= 2 && includesIgnoringCase(normalized, name))) {
    problems.push("아이디나 이름이 들어 있으면 안 돼요.");
  }
  if (context.current !== undefined && normalized === context.current.normalize("NFC")) {
    problems.push("지금 비밀번호와 달라야 해요.");
  }
  let score: number | null = null;
  if (normalized.length > 0) {
    const result = (await loadFactory()).check(normalized, [loginId, name].filter(Boolean));
    score = result.score;
    if (score < 3) problems.push("흔하거나 짐작하기 쉬운 비밀번호예요. 단어 서너 개를 이어 길게 만들어 보세요.");
  }
  return { ok: problems.length === 0, problems, score };
}

// 제출 전에 새 비밀번호를 다시 검사한다. 문제가 없으면 null.
export async function newPasswordProblem(password: string, confirm: string, context: PasswordContext): Promise<{ password?: string; confirm?: string } | null> {
  const result = await checkMasterPassword(password, context);
  if (!result.ok) return { password: result.problems.join(" ") };
  if (password !== confirm) return { confirm: "두 칸의 비밀번호가 같지 않아요." };
  return null;
}
