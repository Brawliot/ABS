/**
 * Librería de componentes base con estados y accesibilidad WCAG AAA.
 * 5 componentes iniciales: Button, Card, Input, Select, Badge.
 */

export type ButtonVariant = "primary" | "secondary" | "outlined" | "text";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonState = "default" | "hover" | "focus" | "active" | "disabled" | "loading";

export interface ButtonSpec {
  readonly id: string;
  readonly variant: ButtonVariant;
  readonly size: ButtonSize;
  readonly state: ButtonState;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly icon?: string;
}

export function renderButton(spec: ButtonSpec): string {
  const baseClass = `btn btn-${spec.variant} btn-${spec.size}`;
  const stateClass = `btn-state-${spec.state}`;
  const classes = [baseClass, stateClass];

  if (spec.disabled) classes.push("btn-disabled");
  if (spec.loading) classes.push("btn-loading");

  const ariaLabel = spec.ariaLabel || spec.label;
  const ariaPressed = spec.state === "active" ? "true" : "false";
  const ariaDisabled = spec.disabled || spec.loading ? "true" : "false";

  return `<button
    class="${classes.join(" ")}"
    aria-label="${ariaLabel}"
    aria-pressed="${ariaPressed}"
    aria-disabled="${ariaDisabled}"
    ${spec.disabled || spec.loading ? "disabled" : ""}
    tabindex="${spec.disabled || spec.loading ? "-1" : "0"}"
  >
    ${spec.icon ? `<span class="btn-icon">${spec.icon}</span>` : ""}
    <span class="btn-label">${spec.label}</span>
  </button>`;
}

export type CardVariant = "default" | "elevated" | "outlined";
export type CardState = "default" | "hover" | "focus" | "interactive";

export interface CardSpec {
  readonly id: string;
  readonly variant: CardVariant;
  readonly state: CardState;
  readonly title?: string;
  readonly description?: string;
  readonly content: string;
  readonly interactive?: boolean;
  readonly focusable?: boolean;
}

export function renderCard(spec: CardSpec): string {
  const classes = [`card card-${spec.variant}`, `card-state-${spec.state}`];
  if (spec.interactive) classes.push("card-interactive");

  const tabindex = spec.focusable ? "0" : "-1";
  const role = spec.interactive ? "button" : "article";

  return `<div
    class="${classes.join(" ")}"
    role="${role}"
    tabindex="${tabindex}"
  >
    ${spec.title ? `<h3 class="card-title">${spec.title}</h3>` : ""}
    ${spec.description ? `<p class="card-description">${spec.description}</p>` : ""}
    <div class="card-content">${spec.content}</div>
  </div>`;
}

export type InputType = "text" | "email" | "password" | "number" | "date";
export type InputState = "default" | "focus" | "filled" | "error" | "disabled";

export interface InputSpec {
  readonly id: string;
  readonly type: InputType;
  readonly state: InputState;
  readonly label: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly errorMessage?: string;
  readonly helpText?: string;
}

export function renderInput(spec: InputSpec): string {
  const classes = [
    `input input-${spec.type}`,
    `input-state-${spec.state}`,
  ];

  if (spec.disabled) classes.push("input-disabled");
  if (spec.state === "error") classes.push("input-error");

  const ariaLabel = spec.label;
  const ariaDescribedBy = [];
  if (spec.errorMessage) ariaDescribedBy.push(`error-${spec.id}`);
  if (spec.helpText) ariaDescribedBy.push(`help-${spec.id}`);

  const ariaDescribedByAttr =
    ariaDescribedBy.length > 0 ? `aria-describedby="${ariaDescribedBy.join(" ")}"` : "";

  return `<div class="input-wrapper">
    <label for="${spec.id}" class="input-label">${spec.label}${spec.required ? " *" : ""}</label>
    <input
      id="${spec.id}"
      class="${classes.join(" ")}"
      type="${spec.type}"
      placeholder="${spec.placeholder || ""}"
      value="${spec.value || ""}"
      aria-label="${ariaLabel}"
      ${ariaDescribedByAttr}
      ${spec.required ? "required" : ""}
      ${spec.disabled ? "disabled" : ""}
      tabindex="${spec.disabled ? "-1" : "0"}"
    />
    ${spec.errorMessage ? `<span id="error-${spec.id}" class="input-error-message" role="alert">${spec.errorMessage}</span>` : ""}
    ${spec.helpText ? `<span id="help-${spec.id}" class="input-help-text">${spec.helpText}</span>` : ""}
  </div>`;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export type SelectState = "default" | "focus" | "open" | "error" | "disabled";

export interface SelectSpec {
  readonly id: string;
  readonly state: SelectState;
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly value?: string;
  readonly multiple?: boolean;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly errorMessage?: string;
}

export function renderSelect(spec: SelectSpec): string {
  const classes = [
    `select select-${spec.state}`,
  ];

  if (spec.disabled) classes.push("select-disabled");
  if (spec.state === "error") classes.push("select-error");

  const ariaDescribedBy = spec.errorMessage ? `error-${spec.id}` : undefined;

  return `<div class="select-wrapper">
    <label for="${spec.id}" class="select-label">${spec.label}${spec.required ? " *" : ""}</label>
    <select
      id="${spec.id}"
      class="${classes.join(" ")}"
      ${spec.multiple ? "multiple" : ""}
      ${spec.required ? "required" : ""}
      ${spec.disabled ? "disabled" : ""}
      ${ariaDescribedBy ? `aria-describedby="${ariaDescribedBy}"` : ""}
      tabindex="${spec.disabled ? "-1" : "0"}"
    >
      ${spec.options.map((opt) => `<option value="${opt.value}" ${opt.disabled ? "disabled" : ""}>${opt.label}</option>`).join("\n")}
    </select>
    ${spec.errorMessage ? `<span id="error-${spec.id}" class="select-error-message" role="alert">${spec.errorMessage}</span>` : ""}
  </div>`;
}

export type BadgeVariant = "success" | "error" | "warning" | "info";

export interface BadgeSpec {
  readonly id: string;
  readonly variant: BadgeVariant;
  readonly label: string;
  readonly icon?: string;
  readonly dismissible?: boolean;
  readonly ariaLabel?: string;
}

export function renderBadge(spec: BadgeSpec): string {
  const classes = [`badge badge-${spec.variant}`];
  if (spec.dismissible) classes.push("badge-dismissible");

  return `<span
    class="${classes.join(" ")}"
    role="status"
    aria-label="${spec.ariaLabel || spec.label}"
  >
    ${spec.icon ? `<span class="badge-icon">${spec.icon}</span>` : ""}
    <span class="badge-label">${spec.label}</span>
    ${spec.dismissible ? `<button class="badge-dismiss" aria-label="Descartar ${spec.label}" tabindex="0">×</button>` : ""}
  </span>`;
}

/**
 * Registro de componentes disponibles.
 */
export interface ComponentRegistry {
  readonly button: typeof renderButton;
  readonly card: typeof renderCard;
  readonly input: typeof renderInput;
  readonly select: typeof renderSelect;
  readonly badge: typeof renderBadge;
}

export const COMPONENT_REGISTRY: ComponentRegistry = {
  button: renderButton,
  card: renderCard,
  input: renderInput,
  select: renderSelect,
  badge: renderBadge,
};

/**
 * Genera CSS base para componentes (WCAG AAA).
 */
export function generateComponentCss(): string {
  return `
/* Button Styles */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs, 4px);
  border: none;
  border-radius: var(--radius-md, 4px);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--animation-normal, 300ms) var(--easing-in-out, ease);
  outline-width: 2px;
  outline-offset: 2px;
  outline-style: solid;
  outline-color: transparent;
  min-height: 44px;
  min-width: 44px;
  padding: var(--spacing-xs, 4px) var(--spacing-m, 12px);
}

.btn:hover:not(.btn-disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn:focus-visible {
  outline-color: var(--color-primary, #2563EB);
  outline-width: 3px;
}

.btn-disabled,
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn-loading {
  position: relative;
  color: transparent;
}

.btn-loading::after {
  content: '';
  position: absolute;
  width: 1em;
  height: 1em;
  top: 50%;
  left: 50%;
  margin-left: -0.5em;
  margin-top: -0.5em;
  border: 2px solid var(--color-muted, #ccc);
  border-radius: 50%;
  border-top-color: var(--color-primary, #2563EB);
  animation: spin var(--animation-normal, 300ms) linear infinite;
}

/* Card Styles */
.card {
  display: block;
  border-radius: var(--radius-md, 4px);
  padding: var(--spacing-l, 16px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text, #000);
  border: 1px solid var(--color-border, #e0e0e0);
  transition: all var(--animation-normal, 300ms) ease;
}

.card-elevated {
  box-shadow: var(--elevation-md, 0 4px 6px rgba(0,0,0,0.1));
}

.card-interactive {
  cursor: pointer;
}

.card-interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--elevation-lg, 0 10px 15px rgba(0,0,0,0.1));
}

.card-interactive:focus-visible {
  outline: 3px solid var(--color-primary, #2563EB);
  outline-offset: 2px;
}

/* Input Styles */
.input-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 4px);
}

.input {
  padding: var(--spacing-s, 8px) var(--spacing-m, 12px);
  border: 2px solid var(--color-border, #ccc);
  border-radius: var(--radius-sm, 2px);
  font-size: var(--typography-base-size, 16px);
  line-height: var(--typography-base-line-height, 1.5);
  min-height: 44px;
  transition: border-color var(--animation-normal, 300ms) ease;
}

.input:focus-visible {
  outline: none;
  border-color: var(--color-primary, #2563EB);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.input-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--color-muted, #f5f5f5);
}

.input-error {
  border-color: var(--color-danger, #dc2626);
}

.input-error-message {
  color: var(--color-danger, #dc2626);
  font-size: var(--typography-sm-size, 14px);
}

/* Select Styles */
.select-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 4px);
}

.select {
  padding: var(--spacing-s, 8px) var(--spacing-m, 12px);
  border: 2px solid var(--color-border, #ccc);
  border-radius: var(--radius-sm, 2px);
  font-size: var(--typography-base-size, 16px);
  min-height: 44px;
  background-color: var(--color-surface, #fff);
  cursor: pointer;
  transition: border-color var(--animation-normal, 300ms) ease;
}

.select:focus-visible {
  outline: none;
  border-color: var(--color-primary, #2563EB);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.select-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--color-muted, #f5f5f5);
}

/* Badge Styles */
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs, 4px);
  padding: var(--spacing-xs, 4px) var(--spacing-s, 8px);
  border-radius: var(--radius-md, 4px);
  font-size: var(--typography-sm-size, 14px);
  font-weight: 500;
  white-space: nowrap;
}

.badge-success {
  background-color: rgba(34, 197, 94, 0.2);
  color: #15803d;
}

.badge-error {
  background-color: rgba(220, 38, 38, 0.2);
  color: #991b1b;
}

.badge-warning {
  background-color: rgba(217, 119, 6, 0.2);
  color: #b45309;
}

.badge-info {
  background-color: rgba(59, 130, 246, 0.2);
  color: #1e40af;
}

.badge-dismiss {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-size: 1.2em;
  line-height: 1;
  color: inherit;
  opacity: 0.7;
  transition: opacity var(--animation-normal, 300ms) ease;
}

.badge-dismiss:focus-visible {
  outline: 2px solid var(--color-primary, #2563EB);
  outline-offset: 1px;
  opacity: 1;
}

.badge-dismiss:hover {
  opacity: 1;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
`;
}
