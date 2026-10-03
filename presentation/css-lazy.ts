/**
 * CSS Lazy (defer loading)
 * Estilos no críticos cargados en background:
 * - Component states (hover, active, disabled)
 * - Animations y transitions
 * - Responsive breakpoints (sm, md, lg, xl)
 * - Dark mode (si no es crítico)
 * - Utilidades avanzadas
 * - Microinteractions (fase 2)
 */

/**
 * Genera CSS lazy que se carga en background
 */
export function generateLazyCss(): string {
  return `
/* CSS LAZY - Cargado en background */

/* ============================================================================
   COMPONENT STATES - MICROINTERACTIONS
   ============================================================================ */

/* Button states - Fase 2: Enhanced microinteractions */
button {
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

button:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

/* Input/Select/Textarea focus states with glow */
input,
select,
textarea {
  padding: var(--spacing-s) var(--spacing-m);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  font-size: 16px;
  line-height: 1.5;
  min-height: 44px;
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1), inset 0 0 0 1px rgba(37, 99, 235, 0.05);
}

input:hover:not(:disabled),
select:hover:not(:disabled),
textarea:hover:not(:disabled) {
  border-color: var(--color-primary-light);
}

input:disabled,
select:disabled,
textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: #f5f5f5;
}

input,
select,
textarea {
  padding: var(--spacing-s) var(--spacing-m);
  border: 2px solid var(--color-border);
  border-radius: 4px;
  font-size: 16px;
  line-height: 1.5;
  min-height: 44px;
  transition: border-color 300ms ease, box-shadow 300ms ease;
}

input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

input:disabled,
select:disabled,
textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: #f5f5f5;
}

/* Cards */
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: var(--spacing-l);
  transition: all 300ms ease;
}

.card:hover {
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

/* Alerts */
.alert {
  padding: var(--spacing-m);
  border-radius: 4px;
  border-left: 4px solid;
  animation: slideIn 300ms ease;
}

.alert-info {
  background-color: #E0F2FE;
  border-color: #0284C7;
  color: #0C4A6E;
}

.alert-success {
  background-color: #ECFDF5;
  border-color: #10B981;
  color: #065F46;
}

.alert-warning {
  background-color: #FFFBEB;
  border-color: #F59E0B;
  color: #78350F;
}

.alert-error {
  background-color: #FEE2E2;
  border-color: #EF4444;
  color: #7F1D1D;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
}

.badge-success {
  background-color: #D1FAE5;
  color: #065F46;
}

.badge-error {
  background-color: #FEE2E2;
  color: #7F1D1D;
}

.badge-warning {
  background-color: #FEF3C7;
  color: #78350F;
}

.badge-info {
  background-color: #DBEAFE;
  color: #0C4A6E;
}

/* Badges dismissible */
.badge-dismissible {
  padding-right: 4px;
}

.badge-dismiss {
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  padding: 0 4px;
  font-size: 1.25rem;
  line-height: 1;
  transition: opacity 200ms ease;
}

.badge-dismiss:hover {
  opacity: 0.7;
}

/* Breadcrumb */
.breadcrumb {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-s);
}

.breadcrumb-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.breadcrumb-item a {
  color: var(--color-primary);
  text-decoration: none;
}

.breadcrumb-item a:hover {
  text-decoration: underline;
}

.breadcrumb-current {
  color: var(--color-text);
  font-weight: 500;
}

.breadcrumb-separator {
  opacity: 0.5;
}

/* Pagination */
.pagination {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  gap: 4px;
  justify-content: center;
}

.pagination-btn {
  min-height: 44px;
  min-width: 44px;
  padding: var(--spacing-s) var(--spacing-m);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: 4px;
  text-decoration: none;
  transition: all 200ms ease;
}

.pagination-btn:hover {
  background-color: var(--color-bg);
  border-color: var(--color-primary);
}

.pagination-active {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

/* Tabs */
.tabs-header {
  display: flex;
  border-bottom: 2px solid var(--color-border);
  gap: 0;
}

.tabs-button {
  background: none;
  border: none;
  padding: var(--spacing-m) var(--spacing-l);
  border-bottom: 3px solid transparent;
  cursor: pointer;
  transition: all 200ms ease;
  font-weight: 500;
  color: var(--color-text);
}

.tabs-button:hover {
  color: var(--color-primary);
}

.tabs-active {
  border-bottom-color: var(--color-primary);
  color: var(--color-primary);
}

.tabs-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tabpanel {
  display: none;
  padding: var(--spacing-l);
}

.tabpanel-active {
  display: block;
}

/* Spinner/Loading */
.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid var(--color-border);
  border-radius: 50%;
  border-top-color: var(--color-primary);
  animation: spin 1s linear infinite;
}

.spinner-sm { width: 1rem; height: 1rem; }
.spinner-md { width: 2rem; height: 2rem; }
.spinner-lg { width: 3rem; height: 3rem; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Progress Bar */
.progress {
  width: 100%;
  height: 8px;
  background-color: var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background-color: var(--color-primary);
  transition: width 300ms ease;
  border-radius: 4px;
}

.progress-success { background-color: #10B981; }
.progress-error { background-color: #EF4444; }
.progress-warning { background-color: #F59E0B; }

/* Table */
.table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-surface);
}

.table th,
.table td {
  padding: var(--spacing-m);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.table th {
  background-color: var(--color-bg);
  font-weight: 600;
  color: var(--color-text);
}

.table-striped tbody tr:nth-child(odd) {
  background-color: var(--color-bg);
}

.table-hoverable tbody tr:hover {
  background-color: #f0f0f0;
  transition: background-color 200ms ease;
}

/* Modal */
.modal {
  all: revert;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 500px;
  width: 90%;
  background: var(--color-surface);
  border-radius: 8px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  padding: 0;
}

.modal::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
  animation: fadeIn 300ms ease;
}

.modal-title {
  margin: 0;
  font-size: 1.5rem;
  padding: var(--spacing-l);
  border-bottom: 1px solid var(--color-border);
}

.modal-body {
  padding: var(--spacing-l);
}

.modal-footer {
  padding: var(--spacing-l);
  display: flex;
  gap: var(--spacing-m);
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
}

.modal-close {
  position: absolute;
  top: var(--spacing-m);
  right: var(--spacing-m);
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--color-text);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Responsive breakpoints */
@media (max-width: 640px) {
  .pagination {
    gap: 2px;
  }

  .pagination-btn {
    min-width: 40px;
    padding: var(--spacing-xs) var(--spacing-s);
  }

  .breadcrumb {
    gap: 2px;
  }

  .tabs-button {
    padding: var(--spacing-s) var(--spacing-m);
    font-size: 0.875rem;
  }

  .modal {
    width: 95%;
  }
}

@media (max-width: 768px) {
  .table {
    font-size: 0.875rem;
  }

  .table th,
  .table td {
    padding: 8px;
  }
}

@media (max-width: 1024px) {
  main {
    padding: var(--spacing-l);
  }
}

/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  .alert-info {
    background-color: #082F49;
    border-color: #0284C7;
    color: #BAE6FD;
  }

  .alert-success {
    background-color: #064E3B;
    border-color: #10B981;
    color: #A7F3D0;
  }

  .alert-warning {
    background-color: #54340F;
    border-color: #F59E0B;
    color: #FCD34D;
  }

  .alert-error {
    background-color: #5F1F1A;
    border-color: #EF4444;
    color: #FECACA;
  }

  .badge-success {
    background-color: #064E3B;
    color: #A7F3D0;
  }

  .badge-error {
    background-color: #5F1F1A;
    color: #FECACA;
  }

  .badge-warning {
    background-color: #54340F;
    color: #FCD34D;
  }

  .badge-info {
    background-color: #082F49;
    color: #BAE6FD;
  }

  .table-hoverable tbody tr:hover {
    background-color: #374151;
  }
}
`.trim();
}

/**
 * Inserta CSS lazy con media print trick para defer
 */
export function injectLazyCss(htmlContent: string, cssContent: string): string {
  const linkTag =
    `<link rel="stylesheet" media="print" onload="this.media='all'" ` +
    `href="data:text/css;base64,${Buffer.from(cssContent).toString("base64")}" />`;
  return htmlContent.replace("</head>", `${linkTag}</head>`);
}

/**
 * Genera archivo CSS lazy externo
 */
export function generateLazyCssFile(): string {
  return generateLazyCss();
}
