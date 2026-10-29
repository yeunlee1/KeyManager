// 사용자가 한 명도 없을 때 서버 콘솔에만 보여 주는 처음 설정 코드. 첫 관리자를 만들면 없앤다.
import { timingSafeEqual } from "node:crypto";
import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { User } from "../accounts/user.entity.js";
import { normalizeCrockford, randomCrockford } from "../security/crockford.js";

@Injectable()
export class SetupCodeService implements OnApplicationBootstrap {
  private readonly logger = new Logger("처음 설정");
  private code: string | null = null;

  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.refresh();
  }

  // 사용자가 없을 때만 새 코드를 만들어 콘솔에 찍는다. 시험에서는 표를 비운 뒤 다시 부른다.
  async refresh(): Promise<string | null> {
    this.code = (await this.users.count()) === 0 ? randomCrockford(10) : null;
    if (this.code) {
      this.logger.log(
        `처음 설정 코드: ${this.code.slice(0, 5)}-${this.code.slice(5)} (/setup 화면에 넣으세요. 서버를 다시 켜면 바뀝니다.)`,
      );
    }
    return this.code;
  }

  matches(input: string): boolean {
    if (!this.code) return false;
    const given = Buffer.from(normalizeCrockford(input));
    const expected = Buffer.from(this.code);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  consume(): void {
    this.code = null;
  }
}
