// /items 경로의 라이선스 API 라우트 (옛 Express 서버와 같은 주소·상태 코드)
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CreateItemDto } from "./dto/create-item.dto.js";
import { ListItemsQuery } from "./dto/list-items.query.js";
import { UpdateItemDto } from "./dto/update-item.dto.js";
import { ItemNoPipe } from "./item-no.pipe.js";
import type { LicenseKey } from "./license-key.entity.js";
import { type CategoryStat, type ItemsPage, LicensesService } from "./licenses.service.js";

@Controller("items")
export class LicensesController {
  constructor(private readonly licenses: LicensesService) {}

  // 라이선스 목록 (페이지네이션 + 카테고리·사용 상태·검색어 필터)
  @Get()
  list(@Query() query: ListItemsQuery): Promise<ItemsPage> {
    return this.licenses.list(query);
  }

  // 상단 통계 카드용 카테고리별 집계
  @Get("category-stats")
  stats(): Promise<CategoryStat[]> {
    return this.licenses.stats();
  }

  // 새 라이선스 키 등록. Nest 기본값(201) 대신 옛 서버와 같은 200을 돌려준다.
  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() dto: CreateItemDto): Promise<LicenseKey> {
    return this.licenses.create(dto);
  }

  // 라이선스 키와 사용자명 수정. member를 빈 문자열로 보내면 배정 해제다.
  @Put(":no")
  update(@Param("no", ItemNoPipe) no: string, @Body() dto: UpdateItemDto): Promise<LicenseKey> {
    return this.licenses.update(Number(no), dto);
  }

  // 소프트 삭제. 성공하면 본문 없이 204를 돌려준다.
  @Delete(":no")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("no", ItemNoPipe) no: string): Promise<void> {
    return this.licenses.remove(Number(no));
  }
}
