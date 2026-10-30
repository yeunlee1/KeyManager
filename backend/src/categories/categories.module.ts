// 카테고리 허용 목록 API 모듈
import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller.js";

@Module({ controllers: [CategoriesController] })
export class CategoriesModule {}
