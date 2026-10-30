// 주소별 화면과 로그인·잠금 상태에 따른 길 안내(설계서 7절). 잠기면 열쇠와 풀어 둔 화면 상태가 모두 사라진다.
import type { ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuditPage } from "@/features/admin/AuditPage";
import { GroupsPage } from "@/features/admin/GroupsPage";
import { UsersPage } from "@/features/admin/UsersPage";
import { AccountPage } from "@/features/account/AccountPage";
import { useAuth } from "@/features/auth/auth-context";
import { InvitePage } from "@/features/auth/InvitePage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RecoverPage } from "@/features/auth/RecoverPage";
import { SetupPage } from "@/features/auth/SetupPage";
import { UnlockPage } from "@/features/auth/UnlockPage";
import { LicensesPage } from "@/features/licenses/LicensesPage";
import { VaultDataProvider } from "@/features/vault/VaultData";
import { VaultPage } from "@/features/vault/VaultPage";

function FullPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">{children}</div>;
}

// 상태를 아직 모르거나 서버에 닿지 않을 때는 어떤 화면도 그리지 않는다.
function StatusGate({ children }: { children: ReactNode }) {
  const { status, reload } = useAuth();
  if (status === "loading") {
    return (
      <FullPage>
        <span className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
          <Spinner aria-hidden />
          불러오는 중이에요
        </span>
      </FullPage>
    );
  }
  if (status === "unreachable") {
    return (
      <FullPage>
        <div className="grid max-w-sm gap-3 text-center">
          <p className="font-medium">서버에 연결하지 못했어요.</p>
          <p className="text-muted-foreground text-sm">네트워크와 서버가 켜져 있는지 확인한 뒤 다시 시도하세요.</p>
          <Button type="button" className="justify-self-center" onClick={() => void reload()}>
            다시 시도
          </Button>
        </div>
      </FullPage>
    );
  }
  return <>{children}</>;
}

function SetupOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  return status === "setup" ? <>{children}</> : <Navigate to="/" replace />;
}

function SignedOutOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "setup") return <Navigate to="/setup" replace />;
  if (status === "locked" || status === "unlocked") return <Navigate to="/vault" replace />;
  return <>{children}</>;
}

function Protected() {
  const { status, unlockCount } = useAuth();
  const location = useLocation();
  if (status === "setup") return <Navigate to="/setup" replace />;
  if (status === "signed-out") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (status === "locked") return <UnlockPage />;
  return (
    <VaultDataProvider key={unlockCount}>
      <AppShell />
    </VaultDataProvider>
  );
}

function AdminOnly() {
  const { me } = useAuth();
  if (me?.role !== "admin") {
    return (
      <div className="grid gap-2">
        <h1 className="font-heading font-semibold text-2xl">관리자만 볼 수 있어요</h1>
        <p className="text-muted-foreground text-sm">이 화면이 필요하면 관리자에게 부탁하세요.</p>
      </div>
    );
  }
  return <Outlet />;
}

export default function App() {
  return (
    <StatusGate>
      <Routes>
        <Route
          path="/setup"
          element={
            <SetupOnly>
              <SetupPage />
            </SetupOnly>
          }
        />
        <Route
          path="/login"
          element={
            <SignedOutOnly>
              <LoginPage />
            </SignedOutOnly>
          }
        />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/recover" element={<RecoverPage />} />
        <Route element={<Protected />}>
          <Route index element={<Navigate to="/vault" replace />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/licenses" element={<LicensesPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin" element={<AdminOnly />}>
            <Route index element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </StatusGate>
  );
}
