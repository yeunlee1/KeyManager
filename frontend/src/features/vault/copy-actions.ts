// 금고 화면의 복사: 일반 칸은 그대로, 비밀은 30초 뒤 같은 값일 때만 지우고, 결과를 알림으로 알려 준다.
import { toastManager } from "@/components/ui/toast";
import { copyWithAutoClear } from "@/lib/clipboard";

export function notifyClipboardNotCleared() {
  toastManager.add({
    title: "클립보드를 자동으로 지우지 못했어요",
    description: "다른 글자를 복사해 덮어 두세요. 클립보드 기록 프로그램에 남은 사본은 지울 수 없어요.",
    type: "warning",
  });
}

export async function copyValue(label: string, value: string, secret = false) {
  try {
    if (secret) await copyWithAutoClear(value, notifyClipboardNotCleared);
    else await navigator.clipboard.writeText(value);
    toastManager.add({
      title: `${label} 복사함`,
      description: secret ? "30초 뒤 클립보드가 그대로면 지워요." : undefined,
      type: "success",
    });
  } catch {
    toastManager.add({ title: "복사하지 못했어요", description: "브라우저가 클립보드를 막았어요. 직접 선택해 복사하세요.", type: "error" });
  }
}
