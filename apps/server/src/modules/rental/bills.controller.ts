import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type {
  RentalBillDetail,
  RentalBillGenerationResult,
  RentalBillPage,
  RentalBillPreview,
} from "@xpense/shared";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { BillsService } from "./bills.service.js";
import { BillsReadService } from "./bills-read.service.js";
import { type BillDetailDto, billDetailSchema } from "./dto/bill-detail.dto.js";
import { type GenerateBillsDto, generateBillsSchema } from "./dto/generate-bills.dto.js";
import { type ListBillsDto, listBillsSchema } from "./dto/list-bills.dto.js";
import { type PreviewBillsDto, previewBillsSchema } from "./dto/preview-bills.dto.js";

/** 账单只读查询和押金生成；普通账单通过独立账期接口生成及作废。 */
@Controller("rental-bills")
@UseGuards(AuthGuard, RbacGuard)
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly reads: BillsReadService,
  ) {}
  @Get("list")
  @RequirePermission("rental_bills:read")
  list(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: listBillsSchema }) dto: ListBillsDto,
  ): Promise<RentalBillPage> {
    return this.reads.list(auth, dto);
  }
  @Get("detail")
  @RequirePermission("rental_bills:read")
  detail(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: billDetailSchema }) dto: BillDetailDto,
  ): Promise<RentalBillDetail> {
    return this.reads.detail(auth, dto);
  }
  @Post("preview")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_bills:read", "rental_bills:generate"])
  preview(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: previewBillsSchema }) dto: PreviewBillsDto,
  ): Promise<RentalBillPreview> {
    return this.bills.preview(auth, dto);
  }
  @Post("generate")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_bills:read", "rental_bills:generate"])
  generate(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: generateBillsSchema }) dto: GenerateBillsDto,
  ): Promise<RentalBillGenerationResult> {
    return this.bills.generate(auth, dto);
  }
}
