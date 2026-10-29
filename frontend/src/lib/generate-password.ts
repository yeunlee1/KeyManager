// 항목 비밀번호 만들기(설계서 6절): 20자, 영문 대소문자·숫자·기호를 하나 이상씩. 전화로 불러 줄 때 헷갈리는 글자(I l O 0 1)는 뺀다.
const SETS = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%^&*-_=+?"];
const ALL = SETS.join("");

// 0 이상 max 미만의 고른 난수(나머지 치우침이 없게 범위를 넘는 값은 다시 뽑는다)
function randomIndex(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % max;
  }
}

export function generatePassword(length = 20): string {
  const chars = SETS.map((set) => set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(ALL[randomIndex(ALL.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
