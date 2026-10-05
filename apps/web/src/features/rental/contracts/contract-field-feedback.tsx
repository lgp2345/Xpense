import { createContext, useContext, useEffect, useRef } from "react";
import { FieldError } from "@/components/ui/field";

import type { ContractFieldErrors } from "./contract-validation-errors";
export const ContractFieldErrorsContext = createContext<ContractFieldErrors>({});
export const ContractFieldFocusContext = createContext(true);

export function useContractFieldFeedback(name: string, alternateName?: string) {
  const errors = useContext(ContractFieldErrorsContext);
  return contractFeedbackProps(errors, name, alternateName);
}

export function contractFeedbackProps(
  errors: ContractFieldErrors,
  name: string,
  alternateName?: string,
) {
  const message = errors[name] ?? (alternateName ? errors[alternateName] : undefined);
  return {
    "aria-invalid": Boolean(message),
    "aria-describedby": message ? `contract-${name}-error` : undefined,
  };
}

export function ContractFieldMessage({
  name,
  alternateName,
  focusOnError = true,
}: {
  name: string;
  alternateName?: string;
  focusOnError?: boolean;
}) {
  const errors = useContext(ContractFieldErrorsContext);
  const message = errors[name] ?? (alternateName ? errors[alternateName] : undefined);
  const ref = useRef<HTMLDivElement>(null);
  const firstName = Object.keys(errors)[0];
  const focusEnabled = useContext(ContractFieldFocusContext);
  const focus = Boolean(
    focusEnabled && focusOnError && message && (firstName === name || firstName === alternateName),
  );
  useEffect(() => {
    if (!focus || !message) return;
    const alert = ref.current;
    if (alert) {
      alert.tabIndex = -1;
      alert.focus();
    }
  }, [focus, message]);
  return (
    <FieldError ref={ref} id={`contract-${name}-error`}>
      {message}
    </FieldError>
  );
}
