/**
 * Sistema de Infinite Scroll + Pagination
 * - Auto-load cuando llega a 80% del scroll
 * - Loading indicator (spinner)
 * - Error recovery (retry button)
 * - Manual pagination: Previous/Next, Jump to page
 * - Virtual scrolling para 1000+ items
 * - Performance optimizado
 */

export interface PaginationConfig {
  readonly pageSize: number;
  readonly currentPage: number;
  readonly totalItems: number;
  readonly onPageChange: (page: number) => Promise<any>;
}

export interface InfiniteScrollConfig {
  readonly container: HTMLElement;
  readonly onLoadMore: () => Promise<any>;
  readonly threshold?: number; // 0-1, default 0.8 (80%)
  readonly retryCount?: number;
  readonly retryDelay?: number;
}

export interface VirtualScrollConfig {
  readonly itemHeight: number;
  readonly containerHeight: number;
  readonly buffer?: number;
}

/**
 * Infinite Scroll Manager
 */
export class InfiniteScrollManager {
  private config: InfiniteScrollConfig;
  private isLoading: boolean = false;
  private hasError: boolean = false;
  private retryAttempts: number = 0;
  private observer: IntersectionObserver | null = null;
  private sentinel: HTMLElement | null = null;
  private devMode: boolean = true;

  constructor(config: InfiniteScrollConfig, devMode: boolean = true) {
    this.config = {
      threshold: 0.8,
      retryCount: 3,
      retryDelay: 1000,
      ...config,
    };
    this.devMode = devMode;
    this.init();
  }

  /**
   * Inicializa el sistema de infinite scroll
   */
  private init(): void {
    if (typeof IntersectionObserver === "undefined") {
      if (this.devMode) console.warn("[InfiniteScroll] IntersectionObserver no disponible");
      return;
    }

    // Crear sentinela (elemento para detectar scroll)
    this.sentinel = document.createElement("div");
    this.sentinel.className = "infinite-scroll-sentinel";
    this.sentinel.style.height = "1px";
    this.sentinel.style.pointerEvents = "none";
    this.config.container.appendChild(this.sentinel);

    // Configurar observer
    const threshold = this.config.threshold || 0.8;
    const options = {
      root: null,
      rootMargin: "0px",
      threshold,
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !this.isLoading && !this.hasError) {
          this.loadMore();
        }
      });
    }, options);

    this.observer.observe(this.sentinel);
  }

  /**
   * Carga más items
   */
  private async loadMore(): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;
    this.showLoadingIndicator();

    try {
      await this.config.onLoadMore();
      this.retryAttempts = 0;
      this.hasError = false;
      this.hideErrorState();
      if (this.devMode) console.log("[InfiniteScroll] Más items cargados");
    } catch (error) {
      this.hasError = true;
      this.retryAttempts++;

      if (this.retryAttempts < (this.config.retryCount || 3)) {
        const delay = this.config.retryDelay || 1000;
        setTimeout(() => {
          this.isLoading = false;
          this.loadMore();
        }, delay);
      } else {
        this.showErrorState();
        if (this.devMode) console.error("[InfiniteScroll] Error después de reintentos:", error);
      }
    } finally {
      this.isLoading = false;
      this.hideLoadingIndicator();
    }
  }

  /**
   * Muestra indicador de carga
   */
  private showLoadingIndicator(): void {
    let spinner = this.config.container.querySelector(".infinite-scroll-spinner");
    if (!spinner) {
      spinner = document.createElement("div");
      spinner.className = "infinite-scroll-spinner";
      spinner.innerHTML = `
        <div class="spinner"></div>
        <p>Cargando más items...</p>
      `;
      this.config.container.appendChild(spinner);
    }
  }

  /**
   * Oculta indicador de carga
   */
  private hideLoadingIndicator(): void {
    const spinner = this.config.container.querySelector(".infinite-scroll-spinner");
    spinner?.remove();
  }

  /**
   * Muestra estado de error con retry button
   */
  private showErrorState(): void {
    let errorEl = this.config.container.querySelector(".infinite-scroll-error");
    if (!errorEl) {
      errorEl = document.createElement("div");
      errorEl.className = "infinite-scroll-error";
      errorEl.innerHTML = `
        <p>Error cargando más items</p>
        <button class="retry-button">Reintentar</button>
      `;
      this.config.container.appendChild(errorEl);

      errorEl.querySelector(".retry-button")?.addEventListener("click", () => {
        this.retryAttempts = 0;
        this.hasError = false;
        this.hideErrorState();
        this.loadMore();
      });
    }
  }

  /**
   * Oculta estado de error
   */
  private hideErrorState(): void {
    const errorEl = this.config.container.querySelector(".infinite-scroll-error");
    errorEl?.remove();
  }

  /**
   * Detiene infinite scroll
   */
  destroy(): void {
    this.observer?.disconnect();
    this.sentinel?.remove();
  }

  /**
   * Reset para cargar desde el inicio
   */
  reset(): void {
    this.isLoading = false;
    this.hasError = false;
    this.retryAttempts = 0;
    this.hideLoadingIndicator();
    this.hideErrorState();
  }
}

/**
 * Pagination Manager
 */
export class PaginationManager {
  private config: PaginationConfig;
  private devMode: boolean = true;

  constructor(config: PaginationConfig, devMode: boolean = true) {
    this.config = config;
    this.devMode = devMode;
  }

  /**
   * Obtiene número total de páginas
   */
  getTotalPages(): number {
    return Math.ceil(this.config.totalItems / this.config.pageSize);
  }

  /**
   * Va a la página anterior
   */
  async previousPage(): Promise<void> {
    const newPage = Math.max(1, this.config.currentPage - 1);
    await this.goToPage(newPage);
  }

  /**
   * Va a la página siguiente
   */
  async nextPage(): Promise<void> {
    const maxPage = this.getTotalPages();
    const newPage = Math.min(maxPage, this.config.currentPage + 1);
    await this.goToPage(newPage);
  }

  /**
   * Va a una página específica
   */
  async goToPage(page: number): Promise<void> {
    const maxPage = this.getTotalPages();
    if (page < 1 || page > maxPage) {
      if (this.devMode) console.warn(`[Pagination] Página inválida: ${page}`);
      return;
    }

    if (this.devMode) console.log(`[Pagination] Yendo a página ${page} de ${maxPage}`);
    await this.config.onPageChange(page);
  }

  /**
   * Obtiene rango de items para página actual
   */
  getItemRange(): { start: number; end: number } {
    const start = (this.config.currentPage - 1) * this.config.pageSize;
    const end = Math.min(start + this.config.pageSize, this.config.totalItems);
    return { start, end };
  }

  /**
   * Puede ir a la página anterior
   */
  canGoPrevious(): boolean {
    return this.config.currentPage > 1;
  }

  /**
   * Puede ir a la página siguiente
   */
  canGoNext(): boolean {
    return this.config.currentPage < this.getTotalPages();
  }

  /**
   * Crea controles de paginación HTML
   */
  createControls(): HTMLElement {
    const container = document.createElement("div");
    container.className = "pagination-controls";

    const totalPages = this.getTotalPages();

    // Botón anterior
    const prevBtn = document.createElement("button");
    prevBtn.className = "pagination-btn pagination-btn-prev";
    prevBtn.textContent = "← Anterior";
    prevBtn.disabled = !this.canGoPrevious();
    prevBtn.addEventListener("click", () => this.previousPage());

    // Indicador de página
    const pageIndicator = document.createElement("span");
    pageIndicator.className = "pagination-indicator";
    pageIndicator.textContent = `Página ${this.config.currentPage} de ${totalPages}`;

    // Botón siguiente
    const nextBtn = document.createElement("button");
    nextBtn.className = "pagination-btn pagination-btn-next";
    nextBtn.textContent = "Siguiente →";
    nextBtn.disabled = !this.canGoNext();
    nextBtn.addEventListener("click", () => this.nextPage());

    container.appendChild(prevBtn);
    container.appendChild(pageIndicator);
    container.appendChild(nextBtn);

    return container;
  }
}

/**
 * Virtual Scroll Manager (para listas muy grandes)
 */
export class VirtualScrollManager {
  private config: VirtualScrollConfig;
  private items: readonly any[] = [];
  private visibleStart: number = 0;
  private visibleEnd: number = 0;
  private devMode: boolean = true;

  constructor(config: VirtualScrollConfig, devMode: boolean = true) {
    this.config = {
      buffer: 5,
      ...config,
    };
    this.devMode = devMode;
  }

  /**
   * Calcula items visibles basado en scroll position
   */
  calculateVisibleRange(scrollTop: number): { start: number; end: number } {
    const buffer = this.config.buffer || 5;
    const visibleCount = Math.ceil(this.config.containerHeight / this.config.itemHeight);

    this.visibleStart = Math.max(0, Math.floor(scrollTop / this.config.itemHeight) - buffer);
    this.visibleEnd = Math.min(this.items.length, this.visibleStart + visibleCount + buffer * 2);

    return {
      start: this.visibleStart,
      end: this.visibleEnd,
    };
  }

  /**
   * Obtiene items visibles
   */
  getVisibleItems(items: readonly any[], scrollTop: number): readonly any[] {
    this.items = items;
    const range = this.calculateVisibleRange(scrollTop);
    return items.slice(range.start, range.end);
  }

  /**
   * Obtiene el offset del primer item visible
   */
  getOffsetY(): number {
    return this.visibleStart * this.config.itemHeight;
  }
}

/**
 * CSS para infinite scroll y pagination
 */
export function generateInfiniteScrollCss(): string {
  return `
/* Infinite Scroll & Pagination Styles */

.infinite-scroll-sentinel {
  display: block;
  height: 1px;
  pointer-events: none;
}

.infinite-scroll-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
  color: var(--color-text-secondary);
}

.infinite-scroll-spinner .spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.infinite-scroll-error {
  padding: 2rem;
  text-align: center;
  color: var(--color-error);
  background-color: var(--color-error-bg);
  border-radius: 4px;
  margin: 1rem 0;
}

.infinite-scroll-error .retry-button {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 200ms ease;
}

.infinite-scroll-error .retry-button:hover {
  background-color: var(--color-primary-dark);
  transform: translateY(-1px);
}

/* Pagination Controls */
.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1.5rem;
  flex-wrap: wrap;
}

.pagination-btn {
  padding: 0.5rem 1rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  transition: all 200ms ease;
  color: var(--color-text);
  font-size: 0.9rem;
}

.pagination-btn:hover:not(:disabled) {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
  transform: translateY(-2px);
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.pagination-indicator {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* Virtual Scroll Container */
.virtual-scroll-container {
  overflow: auto;
  position: relative;
}

.virtual-scroll-content {
  position: relative;
}

.virtual-scroll-item {
  position: absolute;
  left: 0;
  right: 0;
}

/* Reduce motion preference */
@media (prefers-reduced-motion: reduce) {
  .infinite-scroll-spinner .spinner {
    animation: none;
  }

  .pagination-btn:hover:not(:disabled) {
    transform: none;
  }
}
`.trim();
}

/**
 * Singleton global infinite scroll manager
 */
let globalInfiniteScroll: InfiniteScrollManager | null = null;

export function getGlobalInfiniteScrollManager(
  config: InfiniteScrollConfig
): InfiniteScrollManager {
  if (!globalInfiniteScroll) {
    const devMode = typeof process !== "undefined" && process.env.NODE_ENV === "development";
    globalInfiniteScroll = new InfiniteScrollManager(config, devMode);
  }
  return globalInfiniteScroll;
}

export function resetGlobalInfiniteScroll(): void {
  globalInfiniteScroll?.destroy();
  globalInfiniteScroll = null;
}
