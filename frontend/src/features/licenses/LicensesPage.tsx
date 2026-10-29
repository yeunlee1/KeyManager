// 라이선스 화면 자리. 8단계에서 새 디자인으로 옮기기 전까지 기존 목록(옛 컴포넌트)을 그대로 보여 준다.
import { Toaster } from "@/components/legacy/sonner";
import ItemList from "./ItemList";

export function LicensesPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading font-semibold text-2xl">라이선스</h1>
        <p className="mt-1 text-muted-foreground text-sm">소프트웨어 라이선스 키를 등록하고 사용자 배포 현황을 관리해요.</p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <ItemList />
      </div>
      <Toaster />
    </div>
  );
}
