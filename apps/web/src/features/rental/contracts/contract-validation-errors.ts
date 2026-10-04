import { type ContractFormValues, contractFormSchema, stepSchemas } from "./contract-form-schema";

export type ContractFieldErrors = Record<string, string>;
export type ContractValidationScope = 0 | 1 | 2 | 3 | "contract";

export function validateContractValues(values: ContractFormValues, scope: ContractValidationScope) {
  if (scope === "contract") return contractFormSchema.safeParse(values);
  if (scope === 0) {
    if (!values.propertyId) {
      return {
        success: false as const,
        error: { issues: [{ path: ["propertyId"], message: "请选择房产" }] },
      };
    }
    return stepSchemas.spaces.safeParse({
      billingMode: values.billingMode,
      propertyId: values.propertyId,
      spaces: values.spaces,
    });
  }
  if (scope === 1) return stepSchemas.parties.safeParse({ parties: values.parties });
  return stepSchemas.terms.safeParse(values);
}

/** 保留完整校验路径，每个字段只展示首条错误，不改变校验规则。 */
export function contractFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): ContractFieldErrors {
  const errors: ContractFieldErrors = {};
  for (const issue of issues) {
    const name = issue.path.join(".");
    errors[name] ??= issue.message;
  }
  return errors;
}
