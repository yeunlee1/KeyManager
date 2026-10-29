// 로그인·금고 잠금 상태의 맥락과 꺼내 쓰는 훅. 상태를 만드는 공급자는 AuthProvider.tsx에 있다.
import { createContext, useContext } from "react";
import type { Me } from "@/api/auth";
import type { UnlockedKeys } from "@/lib/crypto/account";

// loading: 확인 중, unreachable: 서버에 닿지 않음, setup: 첫 관리자 만들기 전,
// signed-out: 세션 없음, locked: 세션은 있지만 열쇠 없음, unlocked: 금고를 연 상태
export type AuthStatus = "loading" | "unreachable" | "setup" | "signed-out" | "locked" | "unlocked";

export interface AuthContextValue {
  status: AuthStatus;
  me: Me | null;
  keys: UnlockedKeys | null;
  // 금고를 열 때마다 늘어난다. 금고 화면 상태를 이 값으로 새로 만들어 잠그기 전 내용이 남지 않게 한다.
  unlockCount: number;
  acceptUnlockedKeys: (keys: UnlockedKeys, me?: Me) => void;
  lock: () => void;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  // 화면 상태를 건드리지 않고 내 정보(변환 설정·잠긴 열쇠)만 다시 받는다. 비밀번호를 바꾼 뒤 쓴다.
  refreshMe: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth는 AuthProvider 안에서만 쓸 수 있어요.");
  return value;
}
