// 로그인·금고 잠금 상태를 앱 전체에 나눠 주는 공급자(설계서 5.5절). 열쇠는 이 메모리에만 두고, 잠그면 지운다.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAuthStatus, getMe, logout, type Me } from "@/api/auth";
import { SESSION_EXPIRED_EVENT } from "@/api/client";
import type { UnlockedKeys } from "@/lib/crypto/account";
import { AuthContext, type AuthStatus } from "./auth-context";

export const IDLE_LOCK_MS = 15 * 60 * 1000;
const CHANNEL_NAME = "km-session";
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

type ChannelMessage = { type: "lock" } | { type: "logout" };

function errorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function wipe(keys: UnlockedKeys | null) {
  keys?.accountKeyRaw.fill(0);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [keys, setKeys] = useState<UnlockedKeys | null>(null);
  const [unlockCount, setUnlockCount] = useState(0);
  const keysRef = useRef<UnlockedKeys | null>(null);
  const lastActivityRef = useRef(Date.now());
  const channelRef = useRef<BroadcastChannel | null>(null);

  const dropKeys = useCallback(() => {
    wipe(keysRef.current);
    keysRef.current = null;
    setKeys(null);
  }, []);

  const lockHere = useCallback(() => {
    dropKeys();
    setStatus((current) => (current === "unlocked" ? "locked" : current));
  }, [dropKeys]);

  const signOutHere = useCallback(() => {
    dropKeys();
    setMe(null);
    setStatus("signed-out");
  }, [dropKeys]);

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      const { setupRequired } = await getAuthStatus();
      if (setupRequired) {
        setStatus("setup");
        return;
      }
    } catch {
      setStatus("unreachable");
      return;
    }
    try {
      setMe(await getMe());
      setStatus(keysRef.current ? "unlocked" : "locked");
    } catch (error) {
      const code = errorStatus(error);
      if (code === 401 || code === 403) signOutHere();
      else setStatus("unreachable");
    }
  }, [signOutHere]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 같은 브라우저의 다른 탭과 잠금·로그아웃을 맞춘다.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data?.type === "lock") lockHere();
      if (event.data?.type === "logout") signOutHere();
    };
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [lockHere, signOutHere]);

  useEffect(() => {
    const onExpired = () => signOutHere();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [signOutHere]);

  // 금고를 연 동안만 조작을 지켜본다. 타이머가 늦게 울려도 마지막 조작 시각으로 다시 판단한다.
  useEffect(() => {
    if (status !== "unlocked") return;
    const touch = () => {
      lastActivityRef.current = Date.now();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle >= IDLE_LOCK_MS) {
        lockHere();
        channelRef.current?.postMessage({ type: "lock" } satisfies ChannelMessage);
        return;
      }
      timer = setTimeout(check, IDLE_LOCK_MS - idle);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        check();
      }
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    timer = setTimeout(check, IDLE_LOCK_MS);
    return () => {
      clearTimeout(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, lockHere]);

  const acceptUnlockedKeys = useCallback((next: UnlockedKeys, nextMe?: Me) => {
    if (keysRef.current !== next) wipe(keysRef.current);
    keysRef.current = next;
    lastActivityRef.current = Date.now();
    if (nextMe) setMe(nextMe);
    setKeys(next);
    setUnlockCount((count) => count + 1);
    setStatus("unlocked");
  }, []);

  const lock = useCallback(() => {
    lockHere();
    channelRef.current?.postMessage({ type: "lock" } satisfies ChannelMessage);
  }, [lockHere]);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      signOutHere();
      channelRef.current?.postMessage({ type: "logout" } satisfies ChannelMessage);
    }
  }, [signOutHere]);

  const refreshMe = useCallback(async () => {
    setMe(await getMe());
  }, []);

  const value = useMemo(
    () => ({ status, me, keys, unlockCount, acceptUnlockedKeys, lock, signOut, reload, refreshMe }),
    [status, me, keys, unlockCount, acceptUnlockedKeys, lock, signOut, reload, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
