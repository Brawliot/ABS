/**
 * Sistema de Notificaciones (Toast System)
 * - Tipos: success, error, warning, info
 * - Posición: top-right (default), top-left, bottom-right, bottom-left
 * - Duración: automática (3-5s) o manual
 * - Animaciones: slide-in, fade-out, slide-out
 * - Stacking: máximo 5 toasts simultáneos
 * - Queue: esperar a desaparecer si hay >5
 * - Interactividad: close button, click to dismiss
 * - Accesibilidad: role="alert", ARIA live regions
 */

export type NotificationType = "success" | "error" | "warning" | "info";
export type NotificationPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface ToastConfig {
  readonly id?: string;
  readonly type: NotificationType;
  readonly message: string;
  readonly title?: string | undefined;
  readonly duration?: number; // ms, 0 = no auto-dismiss
  readonly position?: NotificationPosition;
  readonly dismissible?: boolean;
  readonly onDismiss?: (id: string) => void | undefined;
  readonly action?: {
    readonly label: string;
    readonly onClick: () => void;
  };
}

/**
 * Toast Notification Manager
 */
export class ToastManager {
  private toasts: Map<string, ToastConfig> = new Map();
  private container: HTMLElement | null = null;
  private position: NotificationPosition = "top-right";
  private maxToasts: number = 5;
  private queue: ToastConfig[] = [];
  private devMode: boolean = true;
  private liveRegion: HTMLElement | null = null;

  constructor(
    position: NotificationPosition = "top-right",
    devMode: boolean = true
  ) {
    this.position = position;
    this.devMode = devMode;
    this.initContainer();
    this.initLiveRegion();
  }

  /**
   * Inicializa contenedor de toasts
   */
  private initContainer(): void {
    if (typeof document === "undefined") return;

    this.container = document.createElement("div");
    this.container.className = `toast-container toast-${this.position}`;
    this.container.setAttribute("role", "region");
    this.container.setAttribute("aria-label", "Notificaciones");
    document.body.appendChild(this.container);
  }

  /**
   * Inicializa región live ARIA para accesibilidad
   */
  private initLiveRegion(): void {
    if (typeof document === "undefined") return;

    this.liveRegion = document.createElement("div");
    this.liveRegion.setAttribute("role", "status");
    this.liveRegion.setAttribute("aria-live", "polite");
    this.liveRegion.setAttribute("aria-atomic", "true");
    this.liveRegion.className = "sr-only"; // Screen reader only
    this.liveRegion.style.position = "absolute";
    this.liveRegion.style.left = "-10000px";
    this.liveRegion.style.width = "1px";
    this.liveRegion.style.height = "1px";
    this.liveRegion.style.overflow = "hidden";
    document.body.appendChild(this.liveRegion);
  }

  /**
   * Muestra una notificación (toast)
   */
  show(config: ToastConfig): string {
    const id = config.id || `toast-${Date.now()}-${Math.random()}`;
    const toastConfig: ToastConfig = {
      ...config,
      id,
      position: config.position || this.position,
      duration: config.duration ?? (config.type === "success" ? 3000 : 4000),
      dismissible: config.dismissible !== false,
    };

    // Límite máximo de 5 toasts
    if (this.toasts.size >= this.maxToasts) {
      this.queue.push(toastConfig);
      if (this.devMode) console.log("[ToastManager] Toast encolado (límite alcanzado)");
      return id;
    }

    this.toasts.set(id, toastConfig);
    this.renderToast(id, toastConfig);

    // Anunciar para lectores de pantalla
    this.announceToastAriaLive(config);

    // Auto-dismiss
    if (toastConfig.duration && toastConfig.duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, toastConfig.duration);
    }

    if (this.devMode) console.log("[ToastManager] Toast mostrado:", id, config.type);
    return id;
  }

  /**
   * Renderiza un toast en el DOM
   */
  private renderToast(id: string, config: ToastConfig): void {
    if (!this.container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${config.type}`;
    toast.setAttribute("role", "alert");
    toast.setAttribute("data-toast-id", id);

    const titleHtml = config.title ? `<div class="toast-title">${this.escapeHtml(config.title)}</div>` : "";
    const actionHtml = config.action
      ? `<button class="toast-action" data-action="true">${this.escapeHtml(config.action.label)}</button>`
      : "";
    const closeHtml = config.dismissible
      ? '<button class="toast-close" aria-label="Cerrar notificación">✕</button>'
      : "";

    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">
          ${this.getIconForType(config.type)}
        </div>
        <div class="toast-message">
          ${titleHtml}
          <div class="toast-text">${this.escapeHtml(config.message)}</div>
        </div>
      </div>
      ${actionHtml}
      ${closeHtml}
    `;

    // Event listeners
    const closeBtn = toast.querySelector(".toast-close");
    closeBtn?.addEventListener("click", () => this.dismiss(id));

    const actionBtn = toast.querySelector(".toast-action");
    if (actionBtn && config.action) {
      actionBtn.addEventListener("click", () => {
        config.action!.onClick();
        this.dismiss(id);
      });
    }

    // Click en el toast para cerrar
    toast.addEventListener("click", () => {
      if (config.dismissible) this.dismiss(id);
    });

    this.container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });
  }

  /**
   * Descartar un toast
   */
  dismiss(id: string): void {
    const config = this.toasts.get(id);
    if (!config) return;

    const toast = this.container?.querySelector(`[data-toast-id="${id}"]`) as HTMLElement;
    if (!toast) {
      this.toasts.delete(id);
      return;
    }

    // Trigger exit animation
    toast.classList.remove("show");

    setTimeout(() => {
      toast.remove();
      this.toasts.delete(id);

      if (config.onDismiss) config.onDismiss(id);

      // Procesar queue si hay toasts esperando
      if (this.queue.length > 0 && this.toasts.size < this.maxToasts) {
        const nextConfig = this.queue.shift();
        if (nextConfig) {
          this.show(nextConfig);
        }
      }

      if (this.devMode) console.log("[ToastManager] Toast descartar:", id);
    }, 300); // Esperar a que termine animación
  }

  /**
   * Descarta todos los toasts
   */
  dismissAll(): void {
    const toastIds = Array.from(this.toasts.keys());
    toastIds.forEach((id) => this.dismiss(id));
  }

  /**
   * Obtiene icono por tipo
   */
  private getIconForType(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      success: "✓",
      error: "✕",
      warning: "⚠",
      info: "ℹ",
    };
    return icons[type];
  }

  /**
   * Escapa HTML para evitar XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (char) => map[char] ?? char);
  }

  /**
   * Anuncia notificación en región live ARIA
   */
  private announceToastAriaLive(config: ToastConfig): void {
    if (!this.liveRegion) return;
    this.liveRegion.textContent = `${config.type}: ${config.title ? config.title + ". " : ""}${config.message}`;
  }

  /**
   * Limpia el manager
   */
  destroy(): void {
    this.container?.remove();
    this.liveRegion?.remove();
    this.toasts.clear();
    this.queue = [];
  }
}

/**
 * CSS para toasts y notificaciones
 */
export function generateToastCss(): string {
  return `
/* Toast Notification Styles */

.toast-container {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
}

.toast-container.toast-top-left {
  top: 1rem;
  left: 1rem;
}

.toast-container.toast-top-right {
  top: 1rem;
  right: 1rem;
}

.toast-container.toast-bottom-left {
  bottom: 1rem;
  left: 1rem;
}

.toast-container.toast-bottom-right {
  bottom: 1rem;
  right: 1rem;
}

.toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  margin: 0.5rem 0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
  animation: slideIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
  opacity: 0;
  transform: translateY(-20px);
  transition: all 300ms ease;
  max-width: 400px;
  cursor: pointer;
}

.toast.show {
  opacity: 1;
  transform: translateY(0);
}

.toast-success {
  background-color: #ECFDF5;
  color: #065F46;
  border-left: 4px solid #10B981;
}

.toast-error {
  background-color: #FEE2E2;
  color: #7F1D1D;
  border-left: 4px solid #EF4444;
}

.toast-warning {
  background-color: #FFFBEB;
  color: #78350F;
  border-left: 4px solid #F59E0B;
}

.toast-info {
  background-color: #E0F2FE;
  color: #0C4A6E;
  border-left: 4px solid #0284C7;
}

.toast-content {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  flex: 1;
}

.toast-icon {
  flex-shrink: 0;
  font-weight: bold;
  font-size: 1.25rem;
  line-height: 1;
  margin-top: 2px;
}

.toast-message {
  flex: 1;
}

.toast-title {
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.toast-text {
  font-size: 0.95rem;
  line-height: 1.4;
}

.toast-action,
.toast-close {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 200ms ease;
  opacity: 0.7;
}

.toast-action:hover,
.toast-close:hover {
  opacity: 1;
  transform: scale(1.1);
}

.toast-close {
  color: inherit;
  opacity: 0.5;
  line-height: 1;
}

.toast-close:hover {
  opacity: 0.8;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .toast-success {
    background-color: #064E3B;
    color: #D1FAE5;
  }

  .toast-error {
    background-color: #5F1F1A;
    color: #FECACA;
  }

  .toast-warning {
    background-color: #5D3801;
    color: #FDE68A;
  }

  .toast-info {
    background-color: #082F49;
    color: #BAE6FD;
  }
}

/* Reduce motion preference */
@media (prefers-reduced-motion: reduce) {
  .toast {
    animation: none;
    opacity: 1;
    transform: none;
  }

  .toast-action:hover,
  .toast-close:hover {
    transform: none;
  }
}

/* Responsive */
@media (max-width: 640px) {
  .toast {
    max-width: 90vw;
  }

  .toast-container.toast-top-left,
  .toast-container.toast-top-right,
  .toast-container.toast-bottom-left,
  .toast-container.toast-bottom-right {
    left: 0.5rem !important;
    right: 0.5rem !important;
    top: auto !important;
    bottom: 0.5rem !important;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`.trim();
}

/**
 * Singleton global toast manager
 */
let globalToastManager: ToastManager | null = null;

export function getGlobalToastManager(
  position: NotificationPosition = "top-right"
): ToastManager {
  if (!globalToastManager) {
    const devMode = typeof process !== "undefined" && process.env.NODE_ENV === "development";
    globalToastManager = new ToastManager(position, devMode);
  }
  return globalToastManager;
}

export function resetGlobalToastManager(): void {
  globalToastManager?.destroy();
  globalToastManager = null;
}

/**
 * Helpers convenientes
 */
export function showSuccess(message: string, title?: string | undefined): string {
  return getGlobalToastManager().show({ type: "success", message, title: title ?? undefined });
}

export function showError(message: string, title?: string | undefined): string {
  return getGlobalToastManager().show({ type: "error", message, title: title ?? undefined });
}

export function showWarning(message: string, title?: string | undefined): string {
  return getGlobalToastManager().show({ type: "warning", message, title: title ?? undefined });
}

export function showInfo(message: string, title?: string | undefined): string {
  return getGlobalToastManager().show({ type: "info", message, title: title ?? undefined });
}
