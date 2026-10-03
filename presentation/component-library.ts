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

// ============================================================================
// FASE 2: NUEVOS COMPONENTES (15+ adicionales)
// ============================================================================

// Checkbox
export interface CheckboxSpec {
  readonly id: string;
  readonly label: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly state: "default" | "checked" | "indeterminate" | "disabled";
  readonly ariaLabel?: string;
}

export function renderCheckbox(spec: CheckboxSpec): string {
  const classes = [`checkbox checkbox-${spec.state}`];
  if (spec.disabled) classes.push("checkbox-disabled");

  return `<div class="checkbox-wrapper">
    <input
      id="${spec.id}"
      type="checkbox"
      class="${classes.join(" ")}"
      ${spec.checked ? "checked" : ""}
      ${spec.disabled ? "disabled" : ""}
      aria-label="${spec.ariaLabel || spec.label}"
      tabindex="${spec.disabled ? "-1" : "0"}"
    />
    <label for="${spec.id}" class="checkbox-label">${spec.label}</label>
  </div>`;
}

// Radio Button
export interface RadioSpec {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly state: "default" | "selected" | "disabled";
  readonly ariaLabel?: string;
}

export function renderRadio(spec: RadioSpec): string {
  const classes = [`radio radio-${spec.state}`];
  if (spec.disabled) classes.push("radio-disabled");

  return `<div class="radio-wrapper">
    <input
      id="${spec.id}"
      type="radio"
      name="${spec.name}"
      value="${spec.value}"
      class="${classes.join(" ")}"
      ${spec.checked ? "checked" : ""}
      ${spec.disabled ? "disabled" : ""}
      aria-label="${spec.ariaLabel || spec.label}"
      tabindex="${spec.disabled ? "-1" : "0"}"
    />
    <label for="${spec.id}" class="radio-label">${spec.label}</label>
  </div>`;
}

// Toggle/Switch
export interface ToggleSpec {
  readonly id: string;
  readonly label: string;
  readonly enabled?: boolean;
  readonly disabled?: boolean;
  readonly state: "off" | "on" | "disabled";
  readonly ariaLabel?: string;
}

export function renderToggle(spec: ToggleSpec): string {
  const classes = [`toggle toggle-${spec.state}`];
  if (spec.disabled) classes.push("toggle-disabled");

  return `<div class="toggle-wrapper">
    <button
      id="${spec.id}"
      class="${classes.join(" ")}"
      role="switch"
      aria-checked="${spec.enabled === true ? "true" : "false"}"
      aria-label="${spec.ariaLabel || spec.label}"
      ${spec.disabled ? "disabled" : ""}
      tabindex="${spec.disabled ? "-1" : "0"}"
    >
      <span class="toggle-track"></span>
      <span class="toggle-thumb"></span>
    </button>
    <label for="${spec.id}" class="toggle-label">${spec.label}</label>
  </div>`;
}

// Textarea
export interface TextareaSpec {
  readonly id: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly rows?: number;
  readonly cols?: number;
  readonly disabled?: boolean;
  readonly state: "default" | "focus" | "filled" | "error";
  readonly errorMessage?: string;
  readonly required?: boolean;
}

export function renderTextarea(spec: TextareaSpec): string {
  const classes = [
    "textarea",
    `textarea-${spec.state}`,
  ];
  if (spec.disabled) classes.push("textarea-disabled");

  return `<div class="textarea-wrapper">
    <label for="${spec.id}" class="textarea-label">${spec.label}${spec.required ? " *" : ""}</label>
    <textarea
      id="${spec.id}"
      class="${classes.join(" ")}"
      placeholder="${spec.placeholder || ""}"
      rows="${spec.rows || 4}"
      cols="${spec.cols || 50}"
      ${spec.disabled ? "disabled" : ""}
      ${spec.required ? "required" : ""}
      tabindex="${spec.disabled ? "-1" : "0"}"
    >${spec.value || ""}</textarea>
    ${spec.errorMessage ? `<span class="textarea-error-message" role="alert">${spec.errorMessage}</span>` : ""}
  </div>`;
}

// Alert
export interface AlertSpec {
  readonly id: string;
  readonly variant: "info" | "success" | "warning" | "error";
  readonly title?: string;
  readonly message: string;
  readonly dismissible?: boolean;
  readonly ariaLabel?: string;
}

export function renderAlert(spec: AlertSpec): string {
  const classes = [`alert alert-${spec.variant}`];
  const roleMap = {
    info: "status",
    success: "status",
    warning: "alert",
    error: "alert",
  };

  return `<div
    class="${classes.join(" ")}"
    role="${roleMap[spec.variant]}"
    aria-label="${spec.ariaLabel || spec.message}"
  >
    ${spec.title ? `<h4 class="alert-title">${spec.title}</h4>` : ""}
    <p class="alert-message">${spec.message}</p>
    ${spec.dismissible ? `<button class="alert-dismiss" aria-label="Cerrar" tabindex="0">×</button>` : ""}
  </div>`;
}

// Breadcrumb
export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
  readonly current?: boolean;
}

export interface BreadcrumbSpec {
  readonly id: string;
  readonly items: readonly BreadcrumbItem[];
  readonly ariaLabel?: string;
}

export function renderBreadcrumb(spec: BreadcrumbSpec): string {
  return `<nav aria-label="${spec.ariaLabel || "Navegación breadcrumb"}">
    <ol class="breadcrumb" id="${spec.id}">
      ${spec.items
        .map(
          (item, idx) =>
            `<li class="breadcrumb-item ${item.current ? "breadcrumb-current" : ""}">
        ${item.href ? `<a href="${item.href}">${item.label}</a>` : `<span>${item.label}</span>`}
        ${idx < spec.items.length - 1 ? `<span class="breadcrumb-separator">/</span>` : ""}
      </li>`,
        )
        .join("\n")}
    </ol>
  </nav>`;
}

// Pagination
export interface PaginationSpec {
  readonly id: string;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly onPageChange?: string;
  readonly ariaLabel?: string;
}

export function renderPagination(spec: PaginationSpec): string {
  const items: string[] = [];

  // Previous button
  if (spec.currentPage > 1) {
    items.push(
      `<li><a href="#" class="pagination-btn pagination-prev" aria-label="Página anterior">←</a></li>`
    );
  }

  // Page numbers
  for (let i = 1; i <= spec.totalPages; i++) {
    const isActive = i === spec.currentPage;
    items.push(
      `<li><a href="#" class="pagination-btn ${isActive ? "pagination-active" : ""}" aria-current="${isActive ? "page" : "false"}">${i}</a></li>`
    );
  }

  // Next button
  if (spec.currentPage < spec.totalPages) {
    items.push(
      `<li><a href="#" class="pagination-btn pagination-next" aria-label="Página siguiente">→</a></li>`
    );
  }

  return `<nav aria-label="${spec.ariaLabel || "Paginación"}">
    <ul class="pagination" id="${spec.id}">
      ${items.join("\n")}
    </ul>
  </nav>`;
}

// Tabs
export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly disabled?: boolean;
}

export interface TabsSpec {
  readonly id: string;
  readonly tabs: readonly TabItem[];
  readonly activeTab?: string;
  readonly ariaLabel?: string;
}

export function renderTabs(spec: TabsSpec): string {
  const activeTab = spec.activeTab || spec.tabs[0]?.id;

  return `<div class="tabs-container" id="${spec.id}">
    <div class="tabs-header" role="tablist" aria-label="${spec.ariaLabel || "Tabs"}">
      ${spec.tabs
        .map(
          (tab) =>
            `<button
        class="tabs-button ${tab.id === activeTab ? "tabs-active" : ""} ${tab.disabled ? "tabs-disabled" : ""}"
        role="tab"
        aria-selected="${tab.id === activeTab ? "true" : "false"}"
        aria-controls="tabpanel-${tab.id}"
        ${tab.disabled ? "disabled" : ""}
        tabindex="${tab.id === activeTab ? "0" : "-1"}"
      >${tab.label}</button>`,
        )
        .join("\n")}
    </div>
    <div class="tabs-content">
      ${spec.tabs
        .map(
          (tab) =>
            `<div
        id="tabpanel-${tab.id}"
        class="tabpanel ${tab.id === activeTab ? "tabpanel-active" : ""}"
        role="tabpanel"
        aria-labelledby="${spec.id}-tab-${tab.id}"
        hidden="${tab.id !== activeTab}"
      >${tab.content}</div>`,
        )
        .join("\n")}
    </div>
  </div>`;
}

// Spinner/Loading
export interface SpinnerSpec {
  readonly id: string;
  readonly size: "sm" | "md" | "lg";
  readonly ariaLabel?: string;
}

export function renderSpinner(spec: SpinnerSpec): string {
  return `<div
    class="spinner spinner-${spec.size}"
    role="status"
    aria-label="${spec.ariaLabel || "Cargando"}"
    id="${spec.id}"
  >
    <span class="spinner-track"></span>
    <span class="sr-only">Cargando...</span>
  </div>`;
}

// Progress Bar
export interface ProgressSpec {
  readonly id: string;
  readonly value: number;
  readonly max?: number;
  readonly label?: string;
  readonly state: "default" | "success" | "error" | "warning";
}

export function renderProgress(spec: ProgressSpec): string {
  const max = spec.max || 100;
  const percentage = Math.min((spec.value / max) * 100, 100);

  return `<div class="progress-wrapper">
    ${spec.label ? `<label class="progress-label">${spec.label}</label>` : ""}
    <div class="progress" id="${spec.id}" role="progressbar" aria-valuenow="${spec.value}" aria-valuemin="0" aria-valuemax="${max}">
      <div class="progress-bar progress-${spec.state}" style="width: ${percentage}%"></div>
    </div>
    <span class="progress-text">${percentage.toFixed(0)}%</span>
  </div>`;
}

// Table
export interface TableRow {
  readonly cells: readonly string[];
}

export interface TableSpec {
  readonly id: string;
  readonly headers: readonly string[];
  readonly rows: readonly TableRow[];
  readonly striped?: boolean;
  readonly hoverable?: boolean;
  readonly ariaLabel?: string;
}

export function renderTable(spec: TableSpec): string {
  const classes = ["table"];
  if (spec.striped) classes.push("table-striped");
  if (spec.hoverable) classes.push("table-hoverable");

  return `<div class="table-wrapper">
    <table class="${classes.join(" ")}" id="${spec.id}" aria-label="${spec.ariaLabel || "Tabla"}">
      <thead>
        <tr>
          ${spec.headers.map((h) => `<th scope="col">${h}</th>`).join("\n")}
        </tr>
      </thead>
      <tbody>
        ${spec.rows
          .map(
            (row) =>
              `<tr>
          ${row.cells.map((cell) => `<td>${cell}</td>`).join("\n")}
        </tr>`,
          )
          .join("\n")}
      </tbody>
    </table>
  </div>`;
}

// Modal/Dialog
export interface ModalSpec {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly open?: boolean;
  readonly actions?: readonly { label: string; action: string }[];
  readonly ariaLabel?: string;
}

export function renderModal(spec: ModalSpec): string {
  return `<dialog class="modal" id="${spec.id}" ${spec.open ? "open" : ""} aria-label="${spec.ariaLabel || spec.title}">
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <h2 class="modal-title">${spec.title}</h2>
      <div class="modal-body">${spec.content}</div>
      ${
        spec.actions
          ? `<div class="modal-footer">
        ${spec.actions.map((a) => `<button class="modal-action">${a.label}</button>`).join("\n")}
      </div>`
          : ""
      }
      <button class="modal-close" aria-label="Cerrar diálogo">×</button>
    </div>
  </dialog>`;
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
  readonly checkbox: typeof renderCheckbox;
  readonly radio: typeof renderRadio;
  readonly toggle: typeof renderToggle;
  readonly textarea: typeof renderTextarea;
  readonly alert: typeof renderAlert;
  readonly breadcrumb: typeof renderBreadcrumb;
  readonly pagination: typeof renderPagination;
  readonly tabs: typeof renderTabs;
  readonly spinner: typeof renderSpinner;
  readonly progress: typeof renderProgress;
  readonly table: typeof renderTable;
  readonly modal: typeof renderModal;
}

export const COMPONENT_REGISTRY: ComponentRegistry = {
  button: renderButton,
  card: renderCard,
  input: renderInput,
  select: renderSelect,
  badge: renderBadge,
  checkbox: renderCheckbox,
  radio: renderRadio,
  toggle: renderToggle,
  textarea: renderTextarea,
  alert: renderAlert,
  breadcrumb: renderBreadcrumb,
  pagination: renderPagination,
  tabs: renderTabs,
  spinner: renderSpinner,
  progress: renderProgress,
  table: renderTable,
  modal: renderModal,
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

/* Checkbox Styles */
.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs, 8px);
  min-height: 44px;
}

.checkbox {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--color-primary, #2563EB);
}

.checkbox:focus-visible {
  outline: 3px solid var(--color-primary, #2563EB);
  outline-offset: 2px;
}

.checkbox-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Radio Styles */
.radio-wrapper {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs, 8px);
  min-height: 44px;
}

.radio {
  width: 20px;
  height: 20px;
  cursor: pointer;
  accent-color: var(--color-primary, #2563EB);
}

.radio:focus-visible {
  outline: 3px solid var(--color-primary, #2563EB);
  outline-offset: 2px;
}

.radio-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Toggle/Switch Styles */
.toggle-wrapper {
  display: flex;
  align-items: center;
  gap: var(--spacing-m, 12px);
  min-height: 44px;
}

.toggle {
  display: inline-flex;
  align-items: center;
  width: 50px;
  height: 28px;
  background-color: var(--color-muted, #ccc);
  border: none;
  border-radius: 14px;
  cursor: pointer;
  transition: background-color 300ms ease;
  position: relative;
  padding: 0;
}

.toggle-on {
  background-color: var(--color-primary, #2563EB);
}

.toggle-track {
  position: absolute;
  width: 100%;
  height: 100%;
}

.toggle-thumb {
  position: absolute;
  width: 24px;
  height: 24px;
  background-color: white;
  border-radius: 50%;
  left: 2px;
  transition: left 300ms ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-on .toggle-thumb {
  left: calc(100% - 26px);
}

.toggle:focus-visible {
  outline: 3px solid var(--color-primary, #2563EB);
  outline-offset: 2px;
}

.toggle-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Textarea Styles */
.textarea-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 4px);
}

.textarea {
  padding: var(--spacing-s, 8px) var(--spacing-m, 12px);
  border: 2px solid var(--color-border, #ccc);
  border-radius: var(--radius-sm, 2px);
  font-size: var(--typography-base-size, 16px);
  line-height: 1.5;
  font-family: inherit;
  resize: vertical;
  transition: border-color 300ms ease;
}

.textarea:focus-visible {
  outline: none;
  border-color: var(--color-primary, #2563EB);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.textarea-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--color-muted, #f5f5f5);
}

/* Alert Styles */
.alert {
  padding: var(--spacing-l, 16px);
  border-radius: var(--radius-md, 4px);
  border-left: 4px solid;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-m, 12px);
}

.alert-info {
  background-color: rgba(59, 130, 246, 0.1);
  border-color: #3b82f6;
  color: #1e40af;
}

.alert-success {
  background-color: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
  color: #15803d;
}

.alert-warning {
  background-color: rgba(217, 119, 6, 0.1);
  border-color: #d97706;
  color: #b45309;
}

.alert-error {
  background-color: rgba(220, 38, 38, 0.1);
  border-color: #dc2626;
  color: #991b1b;
}

.alert-title {
  margin: 0 0 var(--spacing-xs, 4px) 0;
  font-weight: 600;
}

.alert-dismiss {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.5em;
  color: inherit;
  opacity: 0.7;
  transition: opacity 300ms ease;
  padding: 0;
  min-width: 44px;
  min-height: 44px;
}

.alert-dismiss:hover {
  opacity: 1;
}

/* Breadcrumb Styles */
.breadcrumb {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  gap: var(--spacing-xs, 4px);
  flex-wrap: wrap;
  align-items: center;
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs, 4px);
}

.breadcrumb-item a {
  color: var(--color-primary, #2563EB);
  text-decoration: none;
  min-height: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
}

.breadcrumb-item a:focus-visible {
  outline: 2px solid var(--color-primary, #2563EB);
  outline-offset: 2px;
}

.breadcrumb-current {
  color: var(--color-text, #000);
}

/* Pagination Styles */
.pagination {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  gap: var(--spacing-xs, 4px);
  flex-wrap: wrap;
  justify-content: center;
}

.pagination-btn {
  padding: var(--spacing-xs, 4px) var(--spacing-s, 8px);
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--color-border, #ccc);
  background-color: var(--color-surface, #fff);
  color: var(--color-text, #000);
  cursor: pointer;
  border-radius: var(--radius-sm, 2px);
  transition: all 300ms ease;
  text-decoration: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pagination-btn:hover:not([aria-current="page"]) {
  background-color: var(--color-muted, #f5f5f5);
  border-color: var(--color-primary, #2563EB);
}

.pagination-btn:focus-visible {
  outline: 2px solid var(--color-primary, #2563EB);
  outline-offset: 2px;
}

.pagination-active {
  background-color: var(--color-primary, #2563EB);
  color: white;
  border-color: var(--color-primary, #2563EB);
}

/* Tabs Styles */
.tabs-container {
  display: flex;
  flex-direction: column;
}

.tabs-header {
  display: flex;
  border-bottom: 2px solid var(--color-border, #ccc);
  gap: 0;
}

.tabs-button {
  padding: var(--spacing-m, 12px) var(--spacing-l, 16px);
  border: none;
  background-color: transparent;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 300ms ease;
  min-height: 44px;
  font-weight: 500;
  color: var(--color-muted, #5C5C5C);
}

.tabs-button:hover:not(.tabs-disabled) {
  color: var(--color-text, #000);
  background-color: var(--color-muted, #f5f5f5);
}

.tabs-active {
  color: var(--color-primary, #2563EB);
  border-bottom-color: var(--color-primary, #2563EB);
}

.tabs-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tabs-content {
  padding: var(--spacing-l, 16px);
}

.tabpanel {
  display: none;
}

.tabpanel-active {
  display: block;
}

/* Spinner Styles */
.spinner {
  display: inline-block;
  position: relative;
}

.spinner-sm {
  width: 20px;
  height: 20px;
}

.spinner-md {
  width: 40px;
  height: 40px;
}

.spinner-lg {
  width: 60px;
  height: 60px;
}

.spinner-track {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid var(--color-muted, #ccc);
  border-radius: 50%;
  border-top-color: var(--color-primary, #2563EB);
  animation: spin 1s linear infinite;
}

/* Progress Bar Styles */
.progress-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 4px);
}

.progress-label {
  font-size: var(--typography-sm-size, 14px);
  font-weight: 500;
}

.progress {
  width: 100%;
  height: 8px;
  background-color: var(--color-muted, #ccc);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.progress-bar {
  height: 100%;
  transition: width 300ms ease;
  border-radius: 4px;
}

.progress-default {
  background-color: var(--color-primary, #2563EB);
}

.progress-success {
  background-color: #22c55e;
}

.progress-error {
  background-color: #dc2626;
}

.progress-warning {
  background-color: #d97706;
}

.progress-text {
  font-size: var(--typography-sm-size, 14px);
  color: var(--color-muted, #5C5C5C);
}

/* Table Styles */
.table-wrapper {
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--color-border, #ccc);
  background-color: var(--color-surface, #fff);
}

.table th,
.table td {
  padding: var(--spacing-m, 12px);
  text-align: left;
  border-bottom: 1px solid var(--color-border, #ccc);
  min-height: 44px;
}

.table th {
  background-color: var(--color-muted, #f5f5f5);
  font-weight: 600;
}

.table-striped tbody tr:nth-child(odd) {
  background-color: var(--color-muted, #f5f5f5);
}

.table-hoverable tbody tr:hover {
  background-color: rgba(37, 99, 235, 0.05);
}

/* Modal Styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: none;
  z-index: 1000;
}

.modal[open] {
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
}

.modal-content {
  background-color: var(--color-surface, #fff);
  border-radius: var(--radius-md, 4px);
  padding: var(--spacing-l, 16px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  position: relative;
  z-index: 1001;
  max-width: 90%;
  max-height: 90%;
  overflow-y: auto;
}

.modal-title {
  margin: 0 0 var(--spacing-m, 12px) 0;
  font-size: var(--typography-lg-size, 20px);
  font-weight: 600;
}

.modal-body {
  margin-bottom: var(--spacing-l, 16px);
}

.modal-footer {
  display: flex;
  gap: var(--spacing-m, 12px);
  justify-content: flex-end;
  margin-top: var(--spacing-l, 16px);
}

.modal-action {
  padding: var(--spacing-s, 8px) var(--spacing-l, 16px);
  min-height: 44px;
  background-color: var(--color-primary, #2563EB);
  color: white;
  border: none;
  border-radius: var(--radius-md, 4px);
  cursor: pointer;
  transition: all 300ms ease;
}

.modal-action:hover {
  opacity: 0.9;
}

.modal-close {
  position: absolute;
  top: var(--spacing-m, 12px);
  right: var(--spacing-m, 12px);
  background: none;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:focus-visible {
  outline: 2px solid var(--color-primary, #2563EB);
  outline-offset: 2px;
}
`;
}
