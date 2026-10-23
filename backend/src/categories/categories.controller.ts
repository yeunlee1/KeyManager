// 등록 폼이 쓰는 category → version 허용 목록 API
import { Controller, Get } from "@nestjs/common";
import { VERSION_OPTIONS } from "./constants.js";

@Controller("categories")
export class CategoriesController {
  // constants.ts를 프론트와 공유하는 단일 소스로 쓰려고 그대로 돌려준다.
  // (프론트에 같은 목록을 하드코딩하면 한쪽만 고쳐질 때 값이 어긋난다)
  @Get()
  list(): Record<string, string[]> {
    return VERSION_OPTIONS;
  }
}
