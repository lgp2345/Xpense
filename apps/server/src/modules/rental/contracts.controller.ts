import { Body, Controller, Get, HttpCode, Optional, Post, Query, UseGuards } from "@nestjs/common";
import type {
  RentalContractAvailability,
  RentalContractDetail,
  RentalContractPage,
  RentalContractPartySensitiveDetail,
} from "@xpense/shared";

import type { AuthContext } from "../../common/auth/auth-context.js";
import { CurrentAuthContext } from "../../common/auth/current-auth-context.decorator.js";
import { RequirePermission } from "../iam/decorators/require-permission.decorator.js";
import { AuthGuard } from "../iam/guards/auth.guard.js";
import { RbacGuard } from "../iam/guards/rbac.guard.js";
import { ContractLifecycleService } from "./contract-lifecycle.service.js";
import { ContractPartiesService } from "./contract-parties.service.js";
import { ContractsService } from "./contracts.service.js";
import { ChangeContractPartiesDto } from "./dto/change-contract-parties.dto.js";
import { CheckContractAvailabilityDto } from "./dto/check-contract-availability.dto.js";
import {
  CancelContractDto,
  ConfirmContractDto,
  DeleteContractDto,
} from "./dto/contract-action.dto.js";
import { ContractDetailDto } from "./dto/contract-detail.dto.js";
import { CreateContractDto } from "./dto/create-contract.dto.js";
import { ListContractsDto } from "./dto/list-contracts.dto.js";
import { RevealContractPartySensitiveDto } from "./dto/reveal-contract-party-sensitive.dto.js";
import { TerminateContractDto } from "./dto/terminate-contract.dto.js";
import { UpdateContractDto } from "./dto/update-contract.dto.js";

/** 暴露租赁合同读取、草稿、可用性及核心生命周期动作接口。 */
@Controller("rental-contracts")
@UseGuards(AuthGuard, RbacGuard)
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly lifecycle: ContractLifecycleService,
    @Optional() private readonly parties?: ContractPartiesService,
  ) {}

  @Get("list")
  @RequirePermission("rental_contracts:read")
  list(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: ListContractsDto,
  ): Promise<RentalContractPage> {
    return this.contracts.list(authContext, dto);
  }

  @Get("detail")
  @RequirePermission("rental_contracts:read")
  detail(
    @CurrentAuthContext() authContext: AuthContext,
    @Query() dto: ContractDetailDto,
  ): Promise<RentalContractDetail> {
    return this.contracts.detail(authContext, dto);
  }

  @Post("create")
  @HttpCode(200)
  @RequirePermission("rental_contracts:create")
  create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CreateContractDto,
  ): Promise<RentalContractDetail> {
    return this.contracts.create(authContext, dto);
  }

  @Post("update")
  @HttpCode(200)
  @RequirePermission("rental_contracts:update")
  update(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: UpdateContractDto,
  ): Promise<RentalContractDetail> {
    return this.contracts.update(authContext, dto);
  }

  @Post("check-availability")
  @HttpCode(200)
  @RequirePermission("rental_contracts:read")
  checkAvailability(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CheckContractAvailabilityDto,
  ): Promise<RentalContractAvailability> {
    return this.contracts.checkAvailability(authContext, dto);
  }

  @Post("confirm")
  @HttpCode(200)
  @RequirePermission("rental_contracts:update")
  confirm(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: ConfirmContractDto,
  ): Promise<RentalContractDetail> {
    return this.lifecycle.confirm(authContext, dto);
  }

  @Post("cancel")
  @HttpCode(200)
  @RequirePermission("rental_contracts:update")
  cancel(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: CancelContractDto,
  ): Promise<RentalContractDetail> {
    return this.lifecycle.cancel(authContext, dto);
  }

  @Post("change-parties")
  @HttpCode(200)
  @RequirePermission("rental_contracts:update")
  changeParties(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: ChangeContractPartiesDto,
  ): Promise<RentalContractDetail> {
    if (!this.parties) throw new Error("ContractPartiesService is not configured");
    return this.parties.changeParties(authContext, dto);
  }

  @Post("terminate")
  @HttpCode(200)
  @RequirePermission("rental_contracts:update")
  terminate(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: TerminateContractDto,
  ): Promise<RentalContractDetail> {
    return this.lifecycle.terminate(authContext, dto);
  }

  @Post("revoke-termination")
  @HttpCode(200)
  @RequirePermission("rental_contracts:update")
  revokeTermination(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: import("./dto/contract-action.dto.js").RevokeContractTerminationDto,
  ): Promise<RentalContractDetail> {
    return this.lifecycle.revokeTermination(authContext, dto);
  }

  @Post("renew")
  @HttpCode(200)
  @RequirePermission("rental_contracts:update")
  renew(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: import("./dto/contract-action.dto.js").RenewContractDto,
  ): Promise<RentalContractDetail> {
    return this.lifecycle.renew(authContext, dto);
  }

  @Post("reveal-sensitive")
  @HttpCode(200)
  @RequirePermission(["rental_contracts:read", "rental_tenants:sensitive_read"])
  revealSensitive(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: RevealContractPartySensitiveDto,
  ): Promise<RentalContractPartySensitiveDetail> {
    if (!this.parties) throw new Error("ContractPartiesService is not configured");
    return this.parties.revealSensitive(authContext, dto);
  }

  @Post("delete")
  @HttpCode(200)
  @RequirePermission("rental_contracts:delete")
  delete(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() dto: DeleteContractDto,
  ): Promise<void> {
    return this.contracts.delete(authContext, dto);
  }
}
