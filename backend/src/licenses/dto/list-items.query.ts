// GET /items 쿼리 문자열. 값은 모두 문자열로 받고, page·limit은 서비스가 너그럽게 해석한다
import { IsOptional, IsString } from "class-validator";
import { LICENSE_MESSAGES as MSG } from "../license-messages.js";

// 같은 이름을 여러 번 보내 배열이 되면(?category=a&category=b) 잘못된 요청으로 막는다.
export class ListItemsQuery {
  @IsOptional() @IsString({ message: MSG.BAD_REQUEST }) page?: string;
  @IsOptional() @IsString({ message: MSG.BAD_REQUEST }) limit?: string;
  @IsOptional() @IsString({ message: MSG.BAD_REQUEST }) category?: string;
  @IsOptional() @IsString({ message: MSG.BAD_REQUEST }) status?: string;
  @IsOptional() @IsString({ message: MSG.BAD_REQUEST }) searchField?: string;
  @IsOptional() @IsString({ message: MSG.BAD_REQUEST }) searchValue?: string;
}
