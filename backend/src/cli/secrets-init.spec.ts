// .env에 APP_SECRET_KEY를 만들어 넣는 도구(ensureAppSecretKey) 단위 시험
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateEnv } from "../config/env.validation.js";
import { ensureAppSecretKey } from "./secrets-init.js";

const dirs: string[] = [];
function tempEnvPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "km-secrets-"));
  dirs.push(dir);
  return join(dir, ".env");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function keyIn(text: string): string | undefined {
  return /^APP_SECRET_KEY=(.+)$/m.exec(text)?.[1];
}

describe("ensureAppSecretKey", () => {
  it(".env가 없으면 만들고 검증을 통과하는 열쇠를 넣는다", () => {
    const path = tempEnvPath();
    expect(ensureAppSecretKey(path)).toBe(true);
    const key = keyIn(readFileSync(path, "utf8"));
    expect(key).toBeDefined();
    expect(validateEnv({ DB_PASSWORD: "pw", APP_SECRET_KEY: key }).APP_SECRET_KEY).toBe(key);
  });

  it("기존 내용은 그대로 두고 끝에 열쇠만 더한다", () => {
    const path = tempEnvPath();
    writeFileSync(path, "DB_PASSWORD=pw\nPORT=5000");
    ensureAppSecretKey(path);
    const text = readFileSync(path, "utf8");
    expect(text.startsWith("DB_PASSWORD=pw\nPORT=5000\n")).toBe(true);
    expect(keyIn(text)).toBeDefined();
  });

  it("이미 열쇠가 있으면 바꾸지 않는다", () => {
    const path = tempEnvPath();
    writeFileSync(path, "APP_SECRET_KEY=existing\n");
    expect(ensureAppSecretKey(path)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("APP_SECRET_KEY=existing\n");
  });

  it("두 번 만들면 서로 다른 무작위 열쇠가 나온다", () => {
    const first = tempEnvPath();
    const second = tempEnvPath();
    ensureAppSecretKey(first);
    ensureAppSecretKey(second);
    expect(keyIn(readFileSync(first, "utf8"))).not.toBe(keyIn(readFileSync(second, "utf8")));
  });
});
