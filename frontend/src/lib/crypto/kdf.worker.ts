// Argon2id 계산을 화면 스레드 밖(웹 작업자)에서 돌린다. 64MiB·3회 계산이 1~2초 걸려도 화면이 멈추지 않게 한다.
import { argon2id } from "hash-wasm";

interface KdfRequest {
  id: number;
  password: Uint8Array;
  salt: Uint8Array;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}

self.onmessage = async (event: MessageEvent<KdfRequest>) => {
  const { id, password, salt, memoryKiB, iterations, parallelism } = event.data;
  try {
    const result = await argon2id({
      password,
      salt,
      parallelism,
      iterations,
      memorySize: memoryKiB,
      hashLength: 32,
      outputType: "binary",
    });
    // 받은 비밀번호 바이트는 계산이 끝나면 바로 지운다.
    password.fill(0);
    self.postMessage({ id, result }, { transfer: [result.buffer] });
  } catch (error) {
    password.fill(0);
    self.postMessage({ id, error: error instanceof Error ? error.message : "비밀번호 변환에 실패했어요." });
  }
};
