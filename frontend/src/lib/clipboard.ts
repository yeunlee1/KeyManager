// 비밀 복사 뒤 30초가 지나면 클립보드가 그 값 그대로일 때만 지운다(설계서 6절). 읽을 수 없거나 바뀌었으면 덮어쓰지 않고 알린다.
export const CLIPBOARD_CLEAR_MS = 30_000;

export type NotClearedReason = "changed" | "unreadable";

interface ClipboardLike {
  writeText(value: string): Promise<void>;
  readText(): Promise<string>;
}

// 더 나중에 복사한 값이면 그 복사의 타이머가 맡으므로 알리지 않는다.
let latestCopied: string | null = null;

async function clearIfUnchanged(value: string, onNotCleared: (reason: NotClearedReason) => void, clipboard: ClipboardLike) {
  let current: string;
  try {
    current = await clipboard.readText();
  } catch {
    onNotCleared("unreadable");
    return;
  }
  if (current !== value) {
    if (current !== latestCopied) onNotCleared("changed");
    return;
  }
  try {
    await clipboard.writeText("");
    if (latestCopied === value) latestCopied = null;
  } catch {
    onNotCleared("unreadable");
  }
}

export async function copyWithAutoClear(
  value: string,
  onNotCleared: (reason: NotClearedReason) => void,
  clipboard: ClipboardLike = navigator.clipboard,
): Promise<void> {
  await clipboard.writeText(value);
  latestCopied = value;
  setTimeout(() => void clearIfUnchanged(value, onNotCleared, clipboard), CLIPBOARD_CLEAR_MS);
}
