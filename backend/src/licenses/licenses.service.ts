// 라이선스 목록·통계·등록·수정·소프트 삭제를 처리하는 서비스
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, type Repository } from "typeorm";
import { CATEGORIES, VERSION_OPTIONS } from "../categories/constants.js";
import type { CreateItemDto } from "./dto/create-item.dto.js";
import type { ListItemsQuery } from "./dto/list-items.query.js";
import type { UpdateItemDto } from "./dto/update-item.dto.js";
import { assignedSql, buildItemsConditions, parsePagination, unassignedSql } from "./items-filter.js";
import { LicenseKey } from "./license-key.entity.js";
import { LICENSE_MESSAGES as MSG } from "./license-messages.js";

export type LicenseListItem = Pick<LicenseKey, "no" | "key" | "member" | "category" | "version">;

export interface ItemsPage {
  items: LicenseListItem[];
  total: number;
}

export interface CategoryStat {
  category: string;
  total: number;
  active: number;
  available: number;
}

// 삭제되지 않은 다른 행이 같은 key를 이미 쓰고 있을 때 부분 유니크 인덱스가 내는 오류(23505)인지 본다.
// 중복 확인과 저장 사이에 다른 요청이 같은 키를 먼저 넣는 경우도 이 오류로 걸러진다.
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === "23505"
  );
}

// 수정·삭제 결과로 돌려줄 컬럼. 목록 항목에 isdelete를 더한 형태로 등록 응답과 맞춘다.
const RETURNED_COLUMNS = ["no", "key", "member", "isdelete", "category", "version"];

@Injectable()
export class LicensesService {
  constructor(@InjectRepository(LicenseKey) private readonly repo: Repository<LicenseKey>) {}

  // 같은 조건으로 전체 개수와 현재 페이지 항목을 함께 구한다(프론트 페이지네이션용).
  async list(query: ListItemsQuery): Promise<ItemsPage> {
    const { limit, offset } = parsePagination(query.page, query.limit);
    const qb = this.repo
      .createQueryBuilder("lk")
      .select(["lk.no", "lk.key", "lk.member", "lk.category", "lk.version"]);
    for (const condition of buildItemsConditions(query, "lk")) {
      qb.andWhere(condition.sql, condition.params);
    }
    const [items, total] = await qb.orderBy("lk.no", "ASC").offset(offset).limit(limit).getManyAndCount();
    return { items, total };
  }

  // 상단 통계 카드용. FILTER (WHERE ...)로 사용 중·미사용을 한 번의 쿼리로 센다.
  async stats(): Promise<CategoryStat[]> {
    const rows = await this.repo
      .createQueryBuilder("lk")
      .select("lk.category", "category")
      .addSelect("COUNT(*)", "total")
      .addSelect(`COUNT(*) FILTER (WHERE ${assignedSql("lk")})`, "active")
      .addSelect(`COUNT(*) FILTER (WHERE ${unassignedSql("lk")})`, "available")
      .where("lk.isdelete = 0")
      .groupBy("lk.category")
      .getRawMany<{ category: string | null; total: string; active: string; available: string }>();

    // PostgreSQL COUNT는 bigint라 pg 드라이버가 문자열로 돌려준다. 프론트 계약대로 숫자로 바꾼다.
    return rows.map((row) => ({
      category: row.category || "미지정",
      total: Number(row.total),
      active: Number(row.active),
      available: Number(row.available),
    }));
  }

  // 검사 순서는 옛 서버와 같다. 필수값(DTO) → 카테고리 → 버전 → 중복.
  async create(dto: CreateItemDto): Promise<LicenseKey> {
    if (!CATEGORIES.includes(dto.category)) {
      throw new BadRequestException(MSG.UNSUPPORTED_CATEGORY);
    }
    if (!VERSION_OPTIONS[dto.category].includes(dto.version)) {
      throw new BadRequestException(MSG.UNSUPPORTED_VERSION);
    }
    // 삭제되지 않은 행만 비교한다. 소프트 삭제된 키는 다시 등록할 수 있다.
    if (await this.repo.existsBy({ key: dto.key, isdelete: 0 })) {
      throw new BadRequestException(MSG.DUPLICATE_KEY);
    }

    try {
      return await this.repo.save(
        this.repo.create({ key: dto.key, category: dto.category, version: dto.version }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException(MSG.DUPLICATE_KEY);
      throw error;
    }
  }

  // UPDATE ... RETURNING 한 번으로 존재 확인과 수정을 함께 해서, 확인과 수정 사이에 삭제되는 경쟁을 막는다.
  async update(no: number, dto: UpdateItemDto): Promise<LicenseKey> {
    try {
      const result = await this.repo
        .createQueryBuilder()
        .update(LicenseKey)
        // member가 빠지면 옛 서버처럼 NULL(미배정)로 저장한다.
        .set({ key: dto.key, member: dto.member ?? null })
        .where({ no, isdelete: 0 })
        .returning(RETURNED_COLUMNS)
        .execute();
      const updated = (result.raw as LicenseKey[])[0];
      if (!updated) throw new NotFoundException(MSG.NOT_FOUND);
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) throw new BadRequestException(MSG.DUPLICATE_KEY);
      throw error;
    }
  }

  // 소프트 삭제. 행을 지우지 않고 isdelete = 1로 표시해 이력을 남기고 실수를 되돌릴 수 있게 한다.
  async remove(no: number): Promise<void> {
    const result = await this.repo
      .createQueryBuilder()
      .update(LicenseKey)
      .set({ isdelete: 1 })
      .where({ no, isdelete: 0 })
      .execute();
    if (!result.affected) throw new NotFoundException(MSG.NOT_FOUND);
  }
}
