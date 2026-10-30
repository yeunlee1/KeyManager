// 로그인 뒤 화면의 틀: 넓은 화면은 왼쪽, 좁은 화면은 위쪽 메뉴로 금고·라이선스·관리·내 계정을 오간다(설계서 7절).
import { FileClock, FolderLock, KeyRound, Lock, ScrollText, ShieldCheck, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/auth-context";
import { useVault } from "@/features/vault/vault-context";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const MAIN_NAV: NavItem[] = [
  { to: "/vault", label: "금고", icon: <FolderLock aria-hidden /> },
  { to: "/licenses", label: "라이선스", icon: <ScrollText aria-hidden /> },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin/users", label: "사용자", icon: <Users aria-hidden /> },
  { to: "/admin/groups", label: "묶음", icon: <ShieldCheck aria-hidden /> },
  { to: "/admin/audit", label: "열람 기록", icon: <FileClock aria-hidden /> },
];

const ACCOUNT_NAV: NavItem = { to: "/account", label: "내 계정", icon: <UserRound aria-hidden /> };

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors [&_svg]:size-4",
    isActive ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
  );
}

function NavGroup({ items, label }: { items: NavItem[]; label?: string }) {
  return (
    // 좁은 화면의 가로 스크롤 메뉴에서 묶음이 줄어 링크끼리 겹치지 않게 한다.
    <div className="flex shrink-0 gap-1 lg:flex-col">
      {label && <span className="hidden px-3 pt-4 pb-1 font-medium text-muted-foreground text-xs lg:block">{label}</span>}
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} className={navClass}>
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}

// 관리자가 한 명뿐이면 관리 화면에 계속 알린다(설계서 5.1절).
function AdminNotices() {
  const { me, directory, notices, status } = useVault();
  if (me.role !== "admin" || status !== "ready") return null;
  const admins = directory.filter((user) => user.role === "admin" && user.status === "active");
  const messages = [
    ...(admins.length === 1 ? ["관리자가 한 명뿐이에요. 열쇠를 잃으면 묶음을 복구할 수 없으니 관리자를 한 명 더 지정하세요."] : []),
    ...notices,
  ];
  if (!messages.length) return null;
  return (
    <div className="mb-6 grid gap-2" role="status">
      {messages.map((message) => (
        <p key={message} className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-sm text-warning-foreground">
          {message}
        </p>
      ))}
    </div>
  );
}

export function AppShell() {
  const { me, lock } = useAuth();
  if (!me) return null;
  return (
    <div className="min-h-screen bg-background text-foreground lg:flex">
      <aside className="sticky top-0 z-20 border-b bg-background lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:px-5 lg:py-5">
          <span className="flex items-center gap-2 font-medium text-sm">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
              <KeyRound className="size-4" />
            </span>
            KeyManager
          </span>
          <div className="flex items-center gap-1 lg:hidden">
            <ThemeToggle />
            <Button type="button" variant="outline" size="sm" onClick={lock}>
              <Lock aria-hidden />
              잠그기
            </Button>
          </div>
        </div>
        <nav aria-label="주 메뉴" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
          <NavGroup items={MAIN_NAV} />
          {me.role === "admin" && <NavGroup items={ADMIN_NAV} label="관리" />}
          <div className="lg:hidden">
            <NavGroup items={[ACCOUNT_NAV]} />
          </div>
        </nav>
        <div className="hidden lg:absolute lg:inset-x-0 lg:bottom-0 lg:grid lg:gap-2 lg:border-t lg:p-3">
          <NavGroup items={[ACCOUNT_NAV]} />
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="min-w-0 truncate text-sm" title={`${me.name} (${me.loginId})`}>
              {me.name}
              <span className="ms-1 text-muted-foreground">{me.role === "admin" ? "관리자" : "직원"}</span>
            </span>
            <ThemeToggle />
          </div>
          <Button type="button" variant="outline" onClick={lock}>
            <Lock aria-hidden />
            금고 잠그기
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
          <AdminNotices />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
