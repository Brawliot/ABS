/**
 * Sistema de Manejo Avanzado de Formularios
 * - Validaciones asincrónicas: check email uniqueness, username availability
 * - Campos dependientes: si seleccionas "otro", muestra textarea
 * - Validaciones condicionales: requerido solo si cierta condición
 * - Multi-step forms: validar por paso, progress indicator
 * - Auto-save draft en localStorage
 * - Unsaved changes warning
 */

export type FieldType = "text" | "email" | "password" | "number" | "select" | "textarea" | "checkbox" | "radio";
export type ValidationType = "required" | "email" | "async" | "conditional" | "pattern";

export interface AsyncValidator {
  (value: string): Promise<boolean | string>; // true = válido, string = mensaje error
}

export interface ConditionalRule {
  readonly field: string;
  readonly value: any;
}

export interface AdvancedFieldConfig {
  readonly name: string;
  readonly type: FieldType;
  readonly label: string;
  readonly required?: boolean;
  readonly asyncValidator?: AsyncValidator;
  readonly dependencies?: readonly string[]; // Campos que afectan a este
  readonly conditionalRules?: readonly ConditionalRule[];
  readonly options?: readonly { value: string; label: string }[]; // Para select/radio
  readonly placeholder?: string;
  readonly help?: string;
  readonly pattern?: RegExp;
}

export interface FormStep {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly fields: readonly AdvancedFieldConfig[];
}

export interface MultiStepFormConfig {
  readonly steps: readonly FormStep[];
  readonly onStepChange?: (stepIndex: number) => void | undefined;
  readonly onSubmit?: (formData: Record<string, any>) => Promise<void> | undefined;
  readonly autoSaveDraft?: boolean;
  readonly draftKey?: string;
}

/**
 * Advanced Form Handler
 */
export class AdvancedFormHandler {
  private formData: Record<string, any> = {};
  private formErrors: Map<string, string> = new Map();
  private touchedFields: Set<string> = new Set();
  private validatingFields: Set<string> = new Set();
  private isDirty: boolean = false;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private devMode: boolean = true;
  private draftKey: string = "form-draft";

  constructor(devMode: boolean = true) {
    this.devMode = devMode;
  }

  /**
   * Inicializa formulario con datos
   */
  init(initialData: Record<string, any> = {}, draftKey?: string | undefined): void {
    this.formData = { ...initialData };
    if (draftKey) {
      this.draftKey = draftKey;
    }
    this.restoreDraft();
  }

  /**
   * Obtiene valor de campo
   */
  getFieldValue(fieldName: string): any {
    return this.formData[fieldName];
  }

  /**
   * Actualiza valor de campo
   */
  async updateField(
    fieldName: string,
    value: any,
    config?: AdvancedFieldConfig
  ): Promise<void> {
    this.formData[fieldName] = value;
    this.touchedFields.add(fieldName);
    this.isDirty = true;

    // Validar campo
    if (config) {
      await this.validateField(fieldName, config);
    }

    // Auto-save draft
    this.saveDraft();
  }

  /**
   * Valida un campo con validaciones async
   */
  async validateField(
    fieldName: string,
    config: AdvancedFieldConfig
  ): Promise<string | null> {
    const value = this.formData[fieldName];

    // Limpiar error anterior
    this.formErrors.delete(fieldName);

    // Validación requerida
    if (config.required && !value) {
      const error = `${config.label} es requerido`;
      this.formErrors.set(fieldName, error);
      return error;
    }

    if (!value) return null; // Campo vacío pero no requerido

    // Validación pattern
    if (config.pattern && !config.pattern.test(String(value))) {
      const error = `${config.label} tiene un formato inválido`;
      this.formErrors.set(fieldName, error);
      return error;
    }

    // Validación email
    if (config.type === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        const error = "Email inválido";
        this.formErrors.set(fieldName, error);
        return error;
      }
    }

    // Validación asincrónica (ej: check disponibilidad)
    if (config.asyncValidator && this.touchedFields.has(fieldName)) {
      this.validatingFields.add(fieldName);
      try {
        const result = await config.asyncValidator(value);
        if (typeof result === "string") {
          this.formErrors.set(fieldName, result);
          return result;
        }
        if (!result) {
          const error = `${config.label} no está disponible`;
          this.formErrors.set(fieldName, error);
          return error;
        }
      } finally {
        this.validatingFields.delete(fieldName);
      }
    }

    return null;
  }

  /**
   * Valida formulario completo
   */
  async validateForm(fieldConfigs: readonly AdvancedFieldConfig[]): Promise<boolean> {
    let hasErrors = false;

    for (const config of fieldConfigs) {
      const error = await this.validateField(config.name, config);
      if (error) hasErrors = true;
    }

    return !hasErrors;
  }

  /**
   * Valida solo campos condicionales
   */
  validateConditionalFields(
    fieldConfigs: readonly AdvancedFieldConfig[]
  ): void {
    for (const config of fieldConfigs) {
      if (!config.conditionalRules) continue;

      // Verificar si las reglas condicionales se cumplen
      const shouldValidate = config.conditionalRules.every((rule) => {
        return this.formData[rule.field] === rule.value;
      });

      if (shouldValidate && config.required && !this.formData[config.name]) {
        this.formErrors.set(
          config.name,
          `${config.label} es requerido cuando la condición aplica`
        );
      } else if (!shouldValidate) {
        this.formErrors.delete(config.name);
      }
    }
  }

  /**
   * Obtiene campos visibles/relevantes
   */
  getVisibleFields(allFields: readonly AdvancedFieldConfig[]): AdvancedFieldConfig[] {
    return allFields.filter((field) => {
      if (!field.conditionalRules) return true;

      // Mostrar campo solo si sus reglas condicionales se cumplen
      return field.conditionalRules.every((rule) => {
        return this.formData[rule.field] === rule.value;
      });
    });
  }

  /**
   * Obtiene datos del formulario
   */
  getFormData(): Record<string, any> {
    return { ...this.formData };
  }

  /**
   * Obtiene errores del formulario
   */
  getErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    this.formErrors.forEach((value, key) => {
      errors[key] = value;
    });
    return errors;
  }

  /**
   * Obtiene error de un campo
   */
  getFieldError(fieldName: string): string | null {
    return this.formErrors.get(fieldName) || null;
  }

  /**
   * Verifica si un campo está siendo validado async
   */
  isFieldValidating(fieldName: string): boolean {
    return this.validatingFields.has(fieldName);
  }

  /**
   * Verifica si formulario está sucio
   */
  isDirtyForm(): boolean {
    return this.isDirty;
  }

  /**
   * Reseta formulario
   */
  reset(initialData: Record<string, any> = {}): void {
    this.formData = { ...initialData };
    this.formErrors.clear();
    this.touchedFields.clear();
    this.isDirty = false;
    this.clearDraft();
  }

  /**
   * Guarda draft en localStorage
   */
  saveDraft(): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`${this.draftKey}:data`, JSON.stringify(this.formData));
        localStorage.setItem(`${this.draftKey}:timestamp`, String(Date.now()));
      }
    } catch (e) {
      if (this.devMode) console.warn("[AdvancedForm] Failed to save draft:", e);
    }
  }

  /**
   * Restaura draft desde localStorage
   */
  private restoreDraft(): void {
    try {
      if (typeof localStorage !== "undefined") {
        const data = localStorage.getItem(`${this.draftKey}:data`);
        if (data) {
          this.formData = JSON.parse(data);
          if (this.devMode) console.log("[AdvancedForm] Draft restaurado");
        }
      }
    } catch (e) {
      if (this.devMode) console.warn("[AdvancedForm] Failed to restore draft:", e);
    }
  }

  /**
   * Limpia draft
   */
  clearDraft(): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(`${this.draftKey}:data`);
        localStorage.removeItem(`${this.draftKey}:timestamp`);
      }
    } catch (e) {
      if (this.devMode) console.warn("[AdvancedForm] Failed to clear draft:", e);
    }
  }

  /**
   * Obtiene timestamp del draft
   */
  getDraftTimestamp(): number | null {
    try {
      if (typeof localStorage !== "undefined") {
        const ts = localStorage.getItem(`${this.draftKey}:timestamp`);
        return ts ? parseInt(ts, 10) : null;
      }
    } catch (e) {
      if (this.devMode) console.warn("[AdvancedForm] Failed to get draft timestamp:", e);
    }
    return null;
  }
}

/**
 * Multi-Step Form Handler
 */
export class MultiStepFormHandler {
  private steps: readonly FormStep[];
  private currentStepIndex: number = 0;
  private config: MultiStepFormConfig;
  private formHandler: AdvancedFormHandler;
  private devMode: boolean = true;

  constructor(config: MultiStepFormConfig, devMode: boolean = true) {
    this.config = config;
    this.steps = config.steps;
    this.devMode = devMode;
    this.formHandler = new AdvancedFormHandler(devMode);
    if (config.autoSaveDraft) {
      this.formHandler.init({}, config.draftKey);
    }
  }

  /**
   * Obtiene paso actual
   */
  getCurrentStep(): FormStep {
    return this.steps[this.currentStepIndex] as FormStep;
  }

  /**
   * Obtiene índice del paso actual
   */
  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  /**
   * Obtiene número total de pasos
   */
  getTotalSteps(): number {
    return this.steps.length;
  }

  /**
   * Va al paso siguiente
   */
  async nextStep(): Promise<boolean> {
    // Validar paso actual
    const currentStep = this.getCurrentStep();
    const isValid = await this.formHandler.validateForm(currentStep.fields);

    if (!isValid) {
      if (this.devMode) console.log("[MultiStepForm] Paso actual inválido");
      return false;
    }

    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      if (this.config.onStepChange) {
        this.config.onStepChange(this.currentStepIndex);
      }
      if (this.devMode) console.log(`[MultiStepForm] Paso ${this.currentStepIndex + 1}/${this.steps.length}`);
      return true;
    }

    return false;
  }

  /**
   * Va al paso anterior
   */
  previousStep(): boolean {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      if (this.config.onStepChange) {
        this.config.onStepChange(this.currentStepIndex);
      }
      if (this.devMode) console.log(`[MultiStepForm] Paso ${this.currentStepIndex + 1}/${this.steps.length}`);
      return true;
    }
    return false;
  }

  /**
   * Verifica si es el primer paso
   */
  isFirstStep(): boolean {
    return this.currentStepIndex === 0;
  }

  /**
   * Verifica si es el último paso
   */
  isLastStep(): boolean {
    return this.currentStepIndex === this.steps.length - 1;
  }

  /**
   * Obtiene progreso (0-100)
   */
  getProgress(): number {
    return Math.round(((this.currentStepIndex + 1) / this.steps.length) * 100);
  }

  /**
   * Actualiza campo del formulario
   */
  async updateField(fieldName: string, value: any): Promise<void> {
    const currentStep = this.getCurrentStep();
    const config = currentStep.fields.find((f) => f.name === fieldName);
    if (config) {
      await this.formHandler.updateField(fieldName, value, config);
    }
  }

  /**
   * Obtiene datos del formulario
   */
  getFormData(): Record<string, any> {
    return this.formHandler.getFormData();
  }

  /**
   * Obtiene errores del paso actual
   */
  getStepErrors(): Record<string, string> {
    const currentStep = this.getCurrentStep();
    const stepErrors: Record<string, string> = {};
    const allErrors = this.formHandler.getErrors();

    currentStep.fields.forEach((field) => {
      const error = allErrors[field.name];
      if (error !== undefined) {
        stepErrors[field.name] = error;
      }
    });

    return stepErrors;
  }

  /**
   * Envía el formulario completo
   */
  async submit(): Promise<void> {
    // Validar todos los pasos
    for (const step of this.steps) {
      const isValid = await this.formHandler.validateForm(step.fields);
      if (!isValid) {
        if (this.devMode) console.error("[MultiStepForm] Error en paso:", step.id);
        throw new Error(`Error validando paso: ${step.title}`);
      }
    }

    // Llamar callback submit
    if (this.config.onSubmit) {
      await this.config.onSubmit(this.getFormData());
    }

    // Limpiar draft
    if (this.config.autoSaveDraft) {
      this.formHandler.clearDraft();
    }

    if (this.devMode) console.log("[MultiStepForm] Formulario enviado");
  }

  /**
   * Reseta formulario
   */
  reset(): void {
    this.currentStepIndex = 0;
    this.formHandler.reset();
  }

  /**
   * Obtiene progress bar HTML
   */
  createProgressBar(): HTMLElement {
    const container = document.createElement("div");
    container.className = "form-progress";

    const bar = document.createElement("div");
    bar.className = "form-progress-bar";
    bar.style.width = `${this.getProgress()}%`;

    const label = document.createElement("div");
    label.className = "form-progress-label";
    label.textContent = `Paso ${this.currentStepIndex + 1} de ${this.steps.length}`;

    container.appendChild(bar);
    container.appendChild(label);

    return container;
  }
}

/**
 * CSS para formularios avanzados
 */
export function generateAdvancedFormCss(): string {
  return `
/* Advanced Form Styles */

.form-field {
  margin-bottom: 1.5rem;
}

.form-field.is-validating {
  opacity: 0.7;
  pointer-events: none;
}

.form-field-async-validator {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.form-field-async-validator .spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.form-field-help {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  margin-top: 0.5rem;
}

.form-field-error {
  color: var(--color-error);
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

.form-field-conditional {
  margin-left: 2rem;
  padding-left: 1rem;
  border-left: 2px solid var(--color-border);
  animation: slideDown 300ms ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Multi-step form */
.form-progress {
  margin-bottom: 2rem;
}

.form-progress-bar {
  height: 4px;
  background-color: var(--color-primary);
  border-radius: 2px;
  transition: width 300ms ease;
}

.form-progress-label {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  text-align: center;
}

.form-steps-navigation {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2rem;
}

.form-steps-nav-btn {
  padding: 0.75rem 1.5rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 200ms ease;
}

.form-steps-nav-btn:hover:not(:disabled) {
  background-color: var(--color-border);
  transform: translateY(-1px);
}

.form-steps-nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-steps-nav-btn-next {
  margin-left: auto;
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.form-steps-nav-btn-next:hover:not(:disabled) {
  background-color: var(--color-primary-dark);
}

/* Unsaved changes warning */
.unsaved-changes-warning {
  padding: 1rem;
  background-color: var(--color-warning-bg);
  border: 1px solid var(--color-warning);
  border-radius: 4px;
  color: var(--color-warning-text);
  margin-bottom: 1rem;
  animation: slideDown 300ms ease;
}

/* Reduce motion preference */
@media (prefers-reduced-motion: reduce) {
  .form-field-conditional {
    animation: none;
  }

  .unsaved-changes-warning {
    animation: none;
  }

  .form-field-async-validator .spinner {
    animation: none;
  }
}
`.trim();
}
