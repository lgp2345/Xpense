import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { MonthlyStatistics } from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import {
  type MonthlyStatisticsDto,
  monthlyStatisticsSchema,
} from "./dto/monthly-statistics.dto.js";
import { StatisticsService } from "./statistics.service.js";

/** 暴露当前组织月度收支统计接口。 */
@Controller("statistics")
@UseGuards(AuthGuard, RbacGuard)
export class StatisticsController {
  constructor(private readonly service: StatisticsService) {}

  /** 返回指定公历月及可选账本范围内的月度统计。 */
  @Get("monthly")
  @RequirePermission("statistics:read")
  monthly(
    @CurrentAuthContext() authContext: AuthContext,
    @Query({ schema: monthlyStatisticsSchema }) dto: MonthlyStatisticsDto,
  ): Promise<MonthlyStatistics> {
    return this.service.monthly(authContext, dto);
  }
}
