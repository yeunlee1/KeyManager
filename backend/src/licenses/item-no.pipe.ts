// :no 경로 값이 PostgreSQL int 범위 안의 양의 정수 문자열인지 확인하는 파이프
import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import { LICENSE_MESSAGES as MSG } from "./license-messages.js";

const MAX_INT4 = 2147483647;

// 핸들러 매개변수를 number로 선언하면 전역 ValidationPipe(transform)가 먼저 "1e3"을 1000으로 바꿔 버린다.
// 그래서 문자열 그대로 받아 여기서 검사만 하고, 숫자 변환은 컨트롤러가 한다.
// 옛 서버는 int 범위를 넘는 번호에서 DB 오류(500)가 났다. 여기서는 400으로 막는다.
@Injectable()
export class ItemNoPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^\d+$/.test(value) || Number(value) > MAX_INT4) {
      throw new BadRequestException(MSG.BAD_REQUEST);
    }
    return value;
  }
}
