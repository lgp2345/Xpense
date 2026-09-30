import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import type {
  RentalBillDetail,
  RentalBillGenerationResult,
  RentalBillPage,
  RentalBillPreview,
  RentalTerminationPreview,
} from "@xpense/shared";
import { z } from "zod";
import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import type { BillRevisionHistory } from "./bill-revisions.repository.js";
import { BillRevisionsService } from "./bill-revisions.service.js";
import { BillingLifecycleService } from "./billing-lifecycle.service.js";
import { BillsService } from "./bills.service.js";
import { BillsReadService } from "./bills-read.service.js";
import { type BillDetailDto, billDetailSchema } from "./dto/bill-detail.dto.js";
import { type GenerateBillsDto, generateBillsSchema } from "./dto/generate-bills.dto.js";
import { type ListBillsDto, listBillsSchema } from "./dto/list-bills.dto.js";
import { type PreviewBillsDto, previewBillsSchema } from "./dto/preview-bills.dto.js";
import {
  type PreviewTerminationDto,
  previewTerminationSchema,
} from "./dto/preview-termination.dto.js";

const billRevisionHistorySchema = z
  .object({
    billId: z.string().uuid(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
type BillRevisionHistoryQuery = z.output<typeof billRevisionHistorySchema>;

/** 应收只读查询、全租期生成和终止参考，不开放通用金额编辑。 */
@Controller("rental-bills")
@UseGuards(AuthGuard, RbacGuard)
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly reads: BillsReadService,
    private readonly lifecycle: BillingLifecycleService,
    private readonly revisions: BillRevisionsService,
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
  @Get("revisions")
  @RequirePermission("rental_bills:read")
  revisionHistory(
    @CurrentAuthContext() auth: AuthContext,
    @Query({ schema: billRevisionHistorySchema }) dto: BillRevisionHistoryQuery,
  ): Promise<BillRevisionHistory> {
    return this.revisions.history(auth, dto);
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
  @Post("termination-preview")
  @HttpCode(200)
  @RequirePermission([
    "rental_contracts:read",
    "rental_contracts:update",
    "rental_bills:read",
    "rental_bills:adjust",
  ])
  previewTermination(
    @CurrentAuthContext() auth: AuthContext,
    @Body({ schema: previewTerminationSchema }) dto: PreviewTerminationDto,
  ): Promise<RentalTerminationPreview> {
    return this.lifecycle.previewTermination(auth, dto);
  }
}
