// 계정 절차 API(/auth): 처음 설정·로그인·2단계 인증·로그아웃·내 정보·비밀번호 바꾸기·복구
import type { KdfParams } from "../lib/crypto/argon2";
import type { AccountMaterial } from "../lib/crypto/account";
import { apiClient } from "./client";

export interface Me {
  id: string;
  loginId: string;
  name: string;
  role: "admin" | "member";
  status: "pending_totp" | "active" | "disabled";
  kdfSalt: string;
  kdfParams: KdfParams;
  accountKeyMaster: string;
  encPublicKey: string;
  encPrivateKey: string;
  signPublicKey: string;
  signPrivateKey: string;
  sessionExpiresAt: string;
}

export interface PasswordMaterial {
  kdfSalt: string;
  kdfParams: KdfParams;
  authValue: string;
  accountKeyMaster: string;
}

export const getAuthStatus = async () => (await apiClient.get<{ setupRequired: boolean }>("/auth/status")).data;

export const getMe = async () => (await apiClient.get<Me>("/auth/me")).data;

export const setupFirstAdmin = async (
  body: AccountMaterial & { setupCode: string; loginId: string; name: string; adminGrantSig: string },
) => (await apiClient.post<{ next: "enroll_totp" }>("/auth/setup", body)).data;

export const prelogin = async (loginId: string) =>
  (await apiClient.post<{ kdfSalt: string; kdfParams: KdfParams }>("/auth/prelogin", { loginId })).data;

export const login = async (loginId: string, authValue: string) =>
  (await apiClient.post<{ next: "totp" | "enroll_totp" }>("/auth/login", { loginId, authValue })).data;

export const loginSecondFactor = async (body: { code?: string; backupCode?: string }) =>
  (await apiClient.post<{ next: "done" | "enroll_totp" }>("/auth/login/totp", body)).data;

export const startTotpEnrollment = async () =>
  (await apiClient.post<{ otpauthUri: string; secret: string }>("/auth/totp/enroll/start")).data;

export const confirmTotpEnrollment = async (code: string) =>
  (await apiClient.post<{ backupCodes: string[]; next: "done" | "recovery" }>("/auth/totp/enroll/confirm", { code })).data;

export const logout = async () => {
  await apiClient.post("/auth/logout");
};

export const changePassword = async (body: PasswordMaterial & { currentAuthValue: string }) => {
  await apiClient.post("/auth/password", body);
};

export const startRecovery = async (body: { loginId: string; recoveryAuthValue: string; code?: string; backupCode?: string }) =>
  (await apiClient.post<{ next: "recovery" | "enroll_totp" }>("/auth/recover/start", body)).data;

export const getRecoveryMaterial = async () =>
  (await apiClient.get<{ userId: string; accountKeyRecovery: string }>("/auth/recover/material")).data;

export const completeRecovery = async (body: PasswordMaterial & { recoveryAuthValue: string; accountKeyRecovery: string }) => {
  await apiClient.post("/auth/recover/complete", body);
};
