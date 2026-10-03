/**
 * Sistema de Modal + Overlay
 * - Backdrop (click outside to close o custom)
 * - Focus trap (tab solo dentro de modal)
 * - Scroll lock (body no scrollea)
 * - Esc key para close
 * - Animaciones entrada/salida
 * - Stacking (modales sobre modales)
 * - Accesibilidad: role="dialog", aria-modal="true", aria-labelledby
 * - Tipos: confirmación, formulario, galería, custom
 */

export type ModalType = "confirm" | "form" | "gallery" | "custom";

export interface ModalConfig {
  readonly id?: string;
  readonly type?: ModalType;
  readonly title?: string;
  readonly content: string | HTMLElement;
  readonly width?: string; // ej: 500px, 50%, auto
  readonly maxHeight?: string;
  readonly closeOnBackdrop?: boolean;
  readonly closeOnEsc?: boolean;
  readonly showCloseButton?: boolean;
  readonly onClose?: ((modal: Modal) => void) | undefined;
  readonly onConfirm?: ((modal: Modal) => void) | undefined;
  readonly onCancel?: ((modal: Modal) => void) | undefined;
  readonly footer?: {
    readonly showConfirm?: boolean;
    readonly showCancel?: boolean;
    readonly confirmText?: string;
    readonly cancelText?: string;
  } | undefined;
}

interface NormalizedModalConfig extends ModalConfig {
  readonly id: string;
}

/**
 * Modal Class
 */
export class Modal {
  private config: NormalizedModalConfig;
  private element: HTMLElement | null = null;
  private backdrop: HTMLElement | null = null;
  private focusTrapStart: HTMLElement | null = null;
  private focusTrapEnd: HTMLElement | null = null;
  private previousFocus: HTMLElement | null = null;
  private devMode: boolean = true;
  static zIndex: number = 1000;

  constructor(config: ModalConfig, devMode: boolean = true) {
    const id = config.id || `modal-${Date.now()}-${Math.random()}`;
    this.config = {
      type: "custom",
      width: "500px",
      closeOnBackdrop: true,
      closeOnEsc: true,
      showCloseButton: true,
      ...config,
      id,
    };
    this.devMode = devMode;
  }

  /**
   * Abre el modal
   */
  open(): void {
    if (this.element) return; // Ya abierto

    this.previousFocus = document.activeElement as HTMLElement;

    this.render();
    this.attachEventListeners();
    this.lockScroll();
    this.focusFirst();

    if (this.devMode) console.log("[Modal] Abierto:", this.config.id);
  }

  /**
   * Cierra el modal
   */
  close(): void {
    if (!this.element) return; // Ya cerrado

    this.element.classList.remove("show");

    setTimeout(() => {
      this.element?.remove();
      this.backdrop?.remove();
      this.element = null;
      this.backdrop = null;
      this.unlockScroll();
      this.restoreFocus();

      if (this.config.onClose) {
        this.config.onClose(this);
      }

      if (this.devMode) console.log("[Modal] Cerrado:", this.config.id);
    }, 300); // Esperar animación
  }

  /**
   * Renderiza el modal en el DOM
   */
  private render(): void {
    if (typeof document === "undefined") return;

    // Backdrop
    this.backdrop = document.createElement("div");
    this.backdrop.className = "modal-backdrop";
    this.backdrop.setAttribute("aria-hidden", "true");
    this.backdrop.style.zIndex = String(Modal.zIndex++);

    if (this.config.closeOnBackdrop) {
      this.backdrop.addEventListener("click", () => this.close());
    }

    document.body.appendChild(this.backdrop);

    // Modal container
    this.element = document.createElement("div");
    this.element.className = "modal";
    this.element.id = this.config.id;
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-modal", "true");
    if (this.config.title) {
      this.element.setAttribute("aria-labelledby", `${this.config.id}-title`);
    }
    this.element.style.zIndex = String(Modal.zIndex);
    if (this.config.width) {
      this.element.style.width = this.config.width;
    }
    if (this.config.maxHeight) {
      this.element.style.maxHeight = this.config.maxHeight;
    }

    // Header
    if (this.config.title || this.config.showCloseButton) {
      const header = document.createElement("div");
      header.className = "modal-header";

      if (this.config.title) {
        const title = document.createElement("h2");
        title.id = `${this.config.id}-title`;
        title.className = "modal-title";
        title.textContent = this.config.title;
        header.appendChild(title);
      }

      if (this.config.showCloseButton) {
        const closeBtn = document.createElement("button");
        closeBtn.className = "modal-close";
        closeBtn.setAttribute("aria-label", "Cerrar diálogo");
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", () => this.close());
        header.appendChild(closeBtn);
      }

      this.element.appendChild(header);
    }

    // Content
    const body = document.createElement("div");
    body.className = "modal-body";

    // Focus trap start
    this.focusTrapStart = document.createElement("div");
    this.focusTrapStart.tabIndex = 0;
    this.focusTrapStart.setAttribute("aria-hidden", "true");
    this.focusTrapStart.addEventListener("focus", () => this.focusTrapEnd?.focus());
    body.appendChild(this.focusTrapStart);

    // Content
    if (typeof this.config.content === "string") {
      const contentDiv = document.createElement("div");
      contentDiv.innerHTML = this.escapeHtml(this.config.content);
      body.appendChild(contentDiv);
    } else {
      body.appendChild(this.config.content);
    }

    // Focus trap end
    this.focusTrapEnd = document.createElement("div");
    this.focusTrapEnd.tabIndex = 0;
    this.focusTrapEnd.setAttribute("aria-hidden", "true");
    this.focusTrapEnd.addEventListener("focus", () => this.focusTrapStart?.focus());
    body.appendChild(this.focusTrapEnd);

    this.element.appendChild(body);

    // Footer
    if (this.config.footer) {
      const footer = document.createElement("div");
      footer.className = "modal-footer";

      if (this.config.footer.showCancel !== false) {
        const cancelBtn = document.createElement("button");
        cancelBtn.className = "modal-btn modal-btn-cancel";
        cancelBtn.textContent = this.config.footer.cancelText || "Cancelar";
        cancelBtn.addEventListener("click", () => {
          if (this.config.onCancel) this.config.onCancel(this);
          this.close();
        });
        footer.appendChild(cancelBtn);
      }

      if (this.config.footer.showConfirm !== false) {
        const confirmBtn = document.createElement("button");
        confirmBtn.className = "modal-btn modal-btn-confirm";
        confirmBtn.textContent = this.config.footer.confirmText || "Confirmar";
        confirmBtn.addEventListener("click", () => {
          if (this.config.onConfirm) this.config.onConfirm(this);
          this.close();
        });
        footer.appendChild(confirmBtn);
      }

      this.element.appendChild(footer);
    }

    document.body.appendChild(this.element);

    // Trigger animación
    requestAnimationFrame(() => {
      this.element?.classList.add("show");
    });
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (!this.element) return;

    // Esc key para cerrar
    if (this.config.closeOnEsc) {
      this.element.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.close();
        }
      });
    }

    // Tab key para focus trap
    this.element.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        this.handleTabKey(e as KeyboardEvent);
      }
    });
  }

  /**
   * Maneja tecla Tab para focus trap
   */
  private handleTabKey(e: KeyboardEvent): void {
    if (!this.element) return;

    const focusableElements = this.element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        lastElement.focus();
        e.preventDefault();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        firstElement.focus();
        e.preventDefault();
      }
    }
  }

  /**
   * Enfoca el primer elemento enfocable
   */
  private focusFirst(): void {
    if (!this.element) return;

    const focusableElements = this.element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    if (firstElement) {
      firstElement.focus();
    }
  }

  /**
   * Lock scroll en body
   */
  private lockScroll(): void {
    if (typeof document === "undefined") return;
    document.body.style.overflow = "hidden";
  }

  /**
   * Unlock scroll en body
   */
  private unlockScroll(): void {
    if (typeof document === "undefined") return;
    document.body.style.overflow = "";
  }

  /**
   * Restaura focus al elemento anterior
   */
  private restoreFocus(): void {
    if (this.previousFocus) {
      this.previousFocus.focus();
    }
  }

  /**
   * Escapa HTML para evitar XSS
   */
  private escapeHtml(html: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return html.replace(/[&<>"']/g, (char) => map[char] ?? char);
  }

  /**
   * Obtiene el ID del modal
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Obtiene el elemento del modal
   */
  getElement(): HTMLElement | null {
    return this.element;
  }

  /**
   * Verifica si está abierto
   */
  isOpen(): boolean {
    return this.element !== null;
  }
}

/**
 * Modal Manager para gestionar múltiples modales
 */
export class ModalManager {
  private modals: Map<string, Modal> = new Map();
  private devMode: boolean = true;

  constructor(devMode: boolean = true) {
    this.devMode = devMode;
  }

  /**
   * Crea y abre un modal
   */
  create(config: ModalConfig): Modal {
    const modal = new Modal(config, this.devMode);
    const id = config.id || `modal-${Date.now()}`;
    this.modals.set(id, modal);
    modal.open();
    return modal;
  }

  /**
   * Cierra un modal
   */
  close(idOrModal: string | Modal): void {
    const modal =
      typeof idOrModal === "string" ? this.modals.get(idOrModal) : idOrModal;
    if (modal) {
      modal.close();
      this.modals.delete(modal.getId());
    }
  }

  /**
   * Cierra todos los modales
   */
  closeAll(): void {
    const ids = Array.from(this.modals.keys());
    ids.forEach((id) => this.close(id));
  }

  /**
   * Obtiene modal por ID
   */
  get(id: string): Modal | undefined {
    return this.modals.get(id);
  }

  /**
   * Obtiene número de modales abiertos
   */
  count(): number {
    return this.modals.size;
  }
}

/**
 * CSS para modales
 */
export function generateModalCss(): string {
  return `
/* Modal & Overlay Styles */

.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  animation: fadeIn 300ms ease;
  opacity: 0;
}

.modal-backdrop.show {
  opacity: 1;
}

.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.95);
  background-color: var(--color-surface);
  border-radius: 8px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
  animation: modalEnter 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
}

.modal.show {
  transform: translate(-50%, -50%) scale(1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.5rem;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text);
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--color-text-secondary);
  padding: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 200ms ease;
  border-radius: 4px;
}

.modal-close:hover {
  background-color: var(--color-border);
  color: var(--color-text);
}

.modal-body {
  padding: 1.5rem;
  flex: 1;
  overflow: auto;
  color: var(--color-text);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.5rem;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.modal-btn {
  padding: 0.5rem 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 200ms ease;
}

.modal-btn-cancel {
  background-color: var(--color-surface);
  color: var(--color-text);
}

.modal-btn-cancel:hover {
  background-color: var(--color-border);
  transform: translateY(-1px);
}

.modal-btn-confirm {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.modal-btn-confirm:hover {
  background-color: var(--color-primary-dark);
  transform: translateY(-1px);
}

/* Responsive */
@media (max-width: 640px) {
  .modal {
    width: 95vw;
    max-width: 95vw;
    max-height: 95vh;
  }

  .modal-body {
    max-height: calc(95vh - 120px);
  }

  .modal-header {
    padding: 1rem;
  }

  .modal-body {
    padding: 1rem;
  }

  .modal-footer {
    padding: 1rem;
  }
}

/* Reduce motion preference */
@media (prefers-reduced-motion: reduce) {
  .modal-backdrop {
    animation: none;
  }

  .modal {
    animation: none;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes modalEnter {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}
`.trim();
}

/**
 * Singleton global modal manager
 */
let globalModalManager: ModalManager | null = null;

export function getGlobalModalManager(): ModalManager {
  if (!globalModalManager) {
    const devMode = typeof process !== "undefined" && process.env.NODE_ENV === "development";
    globalModalManager = new ModalManager(devMode);
  }
  return globalModalManager;
}

export function resetGlobalModalManager(): void {
  globalModalManager?.closeAll();
  globalModalManager = null;
}

/**
 * Helpers convenientes
 */
export function showConfirmDialog(
  title: string,
  message: string,
  onConfirm: (modal: Modal) => void,
  onCancel?: ((modal: Modal) => void) | undefined
): Modal {
  const manager = getGlobalModalManager();

  let config: any = {
    type: "confirm",
    title,
    content: message,
    width: "400px",
    footer: {
      showConfirm: true,
      showCancel: true,
      confirmText: "Confirmar",
      cancelText: "Cancelar",
    },
    onConfirm,
  };

  if (onCancel !== undefined) {
    config = { ...config, onCancel };
  }

  return manager.create(config as ModalConfig);
}
