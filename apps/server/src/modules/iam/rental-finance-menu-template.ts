import type { MenuTemplateNode } from "./menu-template.js";

/** 租赁财务操作与出账依赖的读取权限，按实际业务入口归入现有页面。 */
export const RENTAL_FINANCE_MENU_TEMPLATE: readonly MenuTemplateNode[] = (
  [
    {
      templateKey: "rental-spaces.read",
      parentTemplateKey: "rental-properties",
      name: "查看空间",
      permissionCode: "rental_spaces:read",
      sortOrder: 160,
    },
    {
      templateKey: "rental-charges.read",
      parentTemplateKey: "rental-contracts",
      name: "查看收费配置",
      permissionCode: "rental_charges:read",
      sortOrder: 130,
    },
    {
      templateKey: "rental-charges.update",
      parentTemplateKey: "rental-contracts",
      name: "编辑收费配置",
      permissionCode: "rental_charges:update",
      sortOrder: 140,
    },
    {
      templateKey: "rental-meters.read",
      parentTemplateKey: "rental-contracts",
      name: "查看抄表读数",
      permissionCode: "rental_meters:read",
      sortOrder: 150,
    },
    {
      templateKey: "rental-meters.update",
      parentTemplateKey: "rental-contracts",
      name: "录入抄表读数",
      permissionCode: "rental_meters:update",
      sortOrder: 160,
    },
    {
      templateKey: "rental-period-bills.generate",
      parentTemplateKey: "rental-bills",
      name: "按账期生成账单",
      permissionCode: "rental_period_bills:generate",
      sortOrder: 120,
    },
    {
      templateKey: "rental-period-bills.void",
      parentTemplateKey: "rental-bills",
      name: "作废账期账单",
      permissionCode: "rental_period_bills:void",
      sortOrder: 130,
    },
    {
      templateKey: "rental-receipts.create",
      parentTemplateKey: "rental-bills",
      name: "登记收款",
      permissionCode: "rental_receipts:create",
      sortOrder: 140,
    },
    {
      templateKey: "rental-receipts.revoke",
      parentTemplateKey: "rental-bills",
      name: "撤销收款",
      permissionCode: "rental_receipts:revoke",
      sortOrder: 150,
    },
    {
      templateKey: "rental-refunds.create",
      parentTemplateKey: "rental-bills",
      name: "登记退款",
      permissionCode: "rental_refunds:create",
      sortOrder: 160,
    },
    {
      templateKey: "rental-refunds.revoke",
      parentTemplateKey: "rental-bills",
      name: "撤销退款",
      permissionCode: "rental_refunds:revoke",
      sortOrder: 170,
    },
  ] as const
).map(
  (node) =>
    ({
      ...node,
      type: "button",
      routeKey: null,
      icon: null,
      isExternal: null,
      isVisible: null,
      keepAlive: null,
    }) as const satisfies MenuTemplateNode,
);
