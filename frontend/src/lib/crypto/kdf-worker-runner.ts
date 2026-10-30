// 화면에서 Argon2id를 웹 작업자로 계산하게 하는 계산기. 앱이 시작할 때 setKdfRunner로 끼운다.
import type { KdfParams, KdfRunner } from "./argon2";
import type { Bytes } from "./encoding";

type Pending = { resolve: (value: Bytes) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./kdf.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<{ id: number; result?: Uint8Array; error?: string }>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if (event.data.result) entry.resolve(new Uint8Array(event.data.result));
    else entry.reject(new Error(event.data.error ?? "비밀번호 변환에 실패했어요."));
  };
  worker.onerror = () => {
    for (const entry of pending.values()) entry.reject(new Error("비밀번호 변환 작업자를 시작하지 못했어요."));
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export const workerKdfRunner: KdfRunner = (password: Bytes, salt: Bytes, params: KdfParams) =>
  new Promise<Bytes>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    // 비밀번호 바이트는 작업자로 옮겨 보내(transfer) 이 스레드에 사본을 남기지 않는다.
    ensureWorker().postMessage(
      {
        id,
        password,
        salt,
        memoryKiB: params.memoryKiB,
        iterations: params.iterations,
        parallelism: params.parallelism,
      },
      [password.buffer],
    );
  });
