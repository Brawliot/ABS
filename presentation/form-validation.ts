/**
 * Sistema de Validación de Formularios en Tiempo Real
 * - Validaciones síncronas: required, email, phone, min/max, regex
 * - Validaciones asincrónicas: check availability
 * - Feedback UX: icon, error message, disabled submit
 * - Real-time en blur/change
 */

export type ValidationRule =
  | { type: "required" }
  | { type: "email" }
  | { type: "phone"; pattern?: RegExp }
  | { type: "minLength"; min: number }
  | { type: "maxLength"; max: number }
  | { type: "min"; value: number }
  | { type: "max"; value: number }
  | { type: "pattern"; pattern: RegExp; message: string }
  | { type: "custom"; validate: (value: string) => boolean | Promise<boolean>; message: string };

export interface FormFieldValidation {
  readonly fieldName: string;
  readonly rules: readonly ValidationRule[];
}

export interface ValidationError {
  readonly field: string;
  readonly rule: ValidationRule;
  readonly message: string;
}

/**
 * Validador de formulario
 */
export class FormValidator {
  private errors: Map<string, ValidationError[]> = new Map();
  private validations: Map<string, FormFieldValidation> = new Map();

  /**
   * Registra validaciones para un campo
   */
  registerField(validation: FormFieldValidation): void {
    this.validations.set(validation.fieldName, validation);
  }

  /**
   * Valida un valor según las reglas
   */
  async validateField(
    fieldName: string,
    value: string
  ): Promise<ValidationError[]> {
    const validation = this.validations.get(fieldName);
    if (!validation) return [];

    const errors: ValidationError[] = [];

    for (const rule of validation.rules) {
      const message = this.getErrorMessage(rule, fieldName);
      const isValid = await this.checkRule(rule, value);

      if (!isValid) {
        errors.push({ field: fieldName, rule, message });
      }
    }

    this.errors.set(fieldName, errors);
    return errors;
  }

  /**
   * Valida un campo contra una regla
   */
  private async checkRule(rule: ValidationRule, value: string): Promise<boolean> {
    switch (rule.type) {
      case "required":
        return value.trim().length > 0;

      case "email":
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

      case "phone":
        const phonePattern = rule.pattern || /^[\d\s\-\+\(\)]+$/;
        return phonePattern.test(value);

      case "minLength":
        return value.length >= rule.min;

      case "maxLength":
        return value.length <= rule.max;

      case "min":
        return Number(value) >= rule.value;

      case "max":
        return Number(value) <= rule.value;

      case "pattern":
        return rule.pattern.test(value);

      case "custom":
        return await rule.validate(value);

      default:
        return true;
    }
  }

  /**
   * Genera mensaje de error
   */
  private getErrorMessage(rule: ValidationRule, fieldName: string): string {
    switch (rule.type) {
      case "required":
        return `${fieldName} es requerido`;

      case "email":
        return "Ingresa un email válido";

      case "phone":
        return "Ingresa un teléfono válido";

      case "minLength":
        return `Mínimo ${rule.min} caracteres`;

      case "maxLength":
        return `Máximo ${rule.max} caracteres`;

      case "min":
        return `Mínimo ${rule.value}`;

      case "max":
        return `Máximo ${rule.value}`;

      case "pattern":
      case "custom":
        return rule.message;

      default:
        return "Campo inválido";
    }
  }

  /**
   * Obtiene errores de un campo
   */
  getFieldErrors(fieldName: string): ValidationError[] {
    return this.errors.get(fieldName) || [];
  }

  /**
   * Obtiene todos los errores
   */
  getAllErrors(): Map<string, ValidationError[]> {
    return this.errors;
  }

  /**
   * Verifica si hay errores
   */
  hasErrors(): boolean {
    for (const errors of this.errors.values()) {
      if (errors.length > 0) return true;
    }
    return false;
  }

  /**
   * Limpia errores
   */
  clearErrors(): void {
    this.errors.clear();
  }
}

/**
 * Attach validación a formulario HTML
 */
export function attachFormValidation(
  formElement: any, // HTMLFormElement
  validations: FormFieldValidation[]
): FormValidator {
  const validator = new FormValidator();

  // Registrar validaciones
  for (const validation of validations) {
    validator.registerField(validation);
  }

  // Attachar listeners
  const fields = formElement.querySelectorAll(
    "input, select, textarea"
  ) as any[]; // NodeListOf<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>

  for (const field of fields) {
    // Validar en blur
    field.addEventListener("blur", async () => {
      const errors = await validator.validateField(field.name, field.value);
      updateFieldUI(field, errors);
    });

    // Validar en change (real-time)
    field.addEventListener("change", async () => {
      const errors = await validator.validateField(field.name, field.value);
      updateFieldUI(field, errors);
    });

    // Validar en input (real-time, más frecuente)
    field.addEventListener("input", async () => {
      const errors = await validator.validateField(field.name, field.value);
      if (field.classList.contains("touched")) {
        updateFieldUI(field, errors);
      }
    });

    // Mark as touched on blur
    field.addEventListener("blur", () => {
      field.classList.add("touched");
    });
  }

  // Validar en submit
  formElement.addEventListener("submit", async (e: any) => {
    e.preventDefault();

    let hasErrors = false;
    for (const field of fields) {
      const errors = await validator.validateField(field.name, field.value);
      updateFieldUI(field, errors);
      if (errors.length > 0) hasErrors = true;
    }

    if (!hasErrors) {
      // Submit allowed
      formElement.dispatchEvent(new CustomEvent("validSubmit"));
    }
  });

  // Disable submit button if there are errors
  updateSubmitButton(formElement, validator);

  validator.getAllErrors().forEach((errors) => {
    if (errors.length > 0) {
      updateSubmitButton(formElement, validator);
    }
  });

  return validator;
}

/**
 * Actualiza UI del campo después de validación
 */
function updateFieldUI(
  field: any, // HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  errors: ValidationError[]
): void {
  const wrapper =
    field.closest?.(".input-wrapper") ||
    field.closest?.(".select-wrapper") ||
    field.closest?.(".textarea-wrapper") ||
    field.parentElement;

  if (!wrapper) return;

  // Limpiar mensajes previos
  const prevError = wrapper.querySelector(".validation-error");
  if (prevError) prevError.remove();

  // Añadir/quitar clase de error
  if (errors.length > 0) {
    field.classList.add("is-invalid");
    wrapper.classList.add("has-error");

    // Mostrar primer error
    const doc = (field.ownerDocument || (typeof document !== "undefined" ? document : null)) as any;
    if (doc && doc.createElement) {
      const errorMsg = doc.createElement("span");
      errorMsg.className = "validation-error";
      errorMsg.setAttribute("role", "alert");
      errorMsg.textContent = errors[0]!.message;
      wrapper.appendChild(errorMsg);
    }

    // Icono de error
    updateFieldIcon(field, "error");
  } else if (field.classList.contains("touched")) {
    field.classList.remove("is-invalid");
    wrapper.classList.remove("has-error");
    field.classList.add("is-valid");
    updateFieldIcon(field, "success");
  } else {
    field.classList.remove("is-invalid", "is-valid");
    wrapper.classList.remove("has-error");
    updateFieldIcon(field, "none");
  }
}

/**
 * Actualiza icono de validación
 */
function updateFieldIcon(
  field: any, // HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  state: "success" | "error" | "none"
): void {
  let icon = field.parentElement?.querySelector(".validation-icon");

  if (state === "none") {
    if (icon) icon.remove();
    return;
  }

  if (!icon) {
    const doc = (field.ownerDocument || (typeof document !== "undefined" ? document : null)) as any;
    if (doc && doc.createElement) {
      icon = doc.createElement("span");
      icon.className = "validation-icon";
      field.parentElement?.appendChild(icon);
    }
  }

  if (!icon) return;

  const iconMap = {
    success: "✓",
    error: "✕",
    none: "",
  };

  icon.textContent = iconMap[state];
  icon.className = `validation-icon validation-icon-${state}`;
}

/**
 * Actualiza estado del botón submit
 */
function updateSubmitButton(
  formElement: any, // HTMLFormElement
  validator: FormValidator
): void {
  const submitButton = formElement.querySelector(
    'button[type="submit"]'
  ) as any; // HTMLButtonElement | null
  if (!submitButton) return;

  submitButton.disabled = validator.hasErrors();
}

/**
 * CSS para validación (inline o external)
 */
export function generateValidationCss(): string {
  return `
/* Form Validation Styles */

.input-wrapper,
.select-wrapper,
.textarea-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

input,
select,
textarea {
  transition: border-color 300ms ease, box-shadow 300ms ease;
}

input.is-invalid,
select.is-invalid,
textarea.is-invalid {
  border-color: #EF4444;
}

input.is-invalid:focus-visible,
select.is-invalid:focus-visible,
textarea.is-invalid:focus-visible {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}

input.is-valid,
select.is-valid,
textarea.is-valid {
  border-color: #10B981;
}

input.is-valid:focus-visible,
select.is-valid:focus-visible,
textarea.is-valid:focus-visible {
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.validation-error {
  color: #EF4444;
  font-size: 0.875rem;
  margin-top: 4px;
  display: block;
}

.validation-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  font-weight: bold;
  font-size: 1rem;
  pointer-events: none;
}

.validation-icon-success {
  color: #10B981;
}

.validation-icon-error {
  color: #EF4444;
}

.has-error {
  position: relative;
}

button[type="submit"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

button[type="submit"]:disabled:hover {
  background-color: inherit;
  transform: none;
}

.form-error-summary {
  background-color: #FEE2E2;
  border: 1px solid #FECACA;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 16px;
  color: #7F1D1D;
}

.form-error-summary ul {
  margin: 0;
  padding-left: 20px;
}

.form-error-summary li {
  margin: 4px 0;
}

@media (prefers-color-scheme: dark) {
  .form-error-summary {
    background-color: #5F1F1A;
    border-color: #7F1D1D;
    color: #FECACA;
  }
}
`.trim();
}
