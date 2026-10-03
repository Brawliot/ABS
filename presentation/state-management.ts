/**
 * Sistema de Gestión de Estado (State Management)
 * - Zustand-like store implementation
 * - UI state: theme, sidebarOpen, modalOpen, notifications
 * - Form state: formData, formErrors, isSubmitting
 * - Data state: items, filters, sortBy, currentPage
 * - Async state: isLoading, error, retryCount
 * - Persistencia: localStorage para preferencias
 * - Devtools: logging en desarrollo
 */

export type Theme = "light" | "dark" | "auto";
export type NotificationType = "success" | "error" | "warning" | "info";

export interface Notification {
  readonly id: string;
  readonly type: NotificationType;
  readonly message: string;
  readonly duration?: number; // ms, 0 = manual close
}

export interface UIState {
  readonly theme: Theme;
  readonly sidebarOpen: boolean;
  readonly modalOpen: boolean;
  readonly notifications: readonly Notification[];
}

export interface FormState {
  readonly formData: Record<string, any>;
  readonly formErrors: Record<string, string>;
  readonly isSubmitting: boolean;
  readonly isDirty: boolean;
}

export interface DataState {
  readonly items: readonly any[];
  readonly filters: Record<string, any>;
  readonly sortBy: string;
  readonly sortOrder: "asc" | "desc";
  readonly currentPage: number;
  readonly totalPages: number;
}

export interface AsyncState {
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly retryCount: number;
}

export interface AppState extends UIState, FormState, DataState, AsyncState {}

export interface StateActions {
  // UI actions
  setTheme(theme: Theme): void;
  toggleSidebar(): void;
  setSidebarOpen(open: boolean): void;
  setModalOpen(open: boolean): void;

  // Notification actions
  addNotification(notification: Omit<Notification, "id">): void;
  removeNotification(id: string): void;
  clearNotifications(): void;

  // Form actions
  setFormData(data: Record<string, any>): void;
  updateFormField(field: string, value: any): void;
  setFormErrors(errors: Record<string, string>): void;
  setFormSubmitting(submitting: boolean): void;
  setFormDirty(dirty: boolean): void;
  resetForm(): void;

  // Data actions
  setItems(items: readonly any[]): void;
  setFilters(filters: Record<string, any>): void;
  setSortBy(sortBy: string, order?: "asc" | "desc"): void;
  setCurrentPage(page: number): void;
  setTotalPages(total: number): void;

  // Async actions
  setLoading(loading: boolean): void;
  setError(error: string | null): void;
  incrementRetryCount(): void;
  resetRetryCount(): void;

  // Persist
  persistToLocalStorage(key: string, value: any): void;
  getFromLocalStorage(key: string): any;

  // Utils
  reset(): void;
}

const initialState: AppState = {
  // UI
  theme: "auto",
  sidebarOpen: true,
  modalOpen: false,
  notifications: [],

  // Form
  formData: {},
  formErrors: {},
  isSubmitting: false,
  isDirty: false,

  // Data
  items: [],
  filters: {},
  sortBy: "id",
  sortOrder: "asc",
  currentPage: 1,
  totalPages: 1,

  // Async
  isLoading: false,
  error: null,
  retryCount: 0,
};

/**
 * Mutable version of AppState for internal use
 */
type MutableAppState = {
  -readonly [K in keyof AppState]: AppState[K];
};

/**
 * Simple state store (similar to Zustand)
 * En producción, usar Zustand real: import { create } from "zustand"
 */
export class StateStore {
  private state: MutableAppState = { ...initialState };
  private listeners: Set<(state: AppState) => void> = new Set();
  private devMode: boolean = true;

  constructor(devMode: boolean = true) {
    this.devMode = devMode;
    this.restoreFromLocalStorage();
  }

  /**
   * Obtiene el estado actual
   */
  getState(): AppState {
    return { ...this.state };
  }

  /**
   * Subscribe a cambios de estado
   */
  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifica a todos los listeners
   */
  private notify(): void {
    if (this.devMode) {
      console.log("[StateStore] State updated:", this.state);
    }
    this.listeners.forEach((listener) => listener(this.getState()));
  }

  /**
   * Actualiza estado (shallow merge)
   */
  private setState(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    this.notify();
  }

  // =========================================================================
  // UI ACTIONS
  // =========================================================================

  setTheme(theme: Theme): void {
    this.setState({ theme });
    this.persistToLocalStorage("theme", theme);
  }

  toggleSidebar(): void {
    this.setState({ sidebarOpen: !this.state.sidebarOpen });
    this.persistToLocalStorage("sidebarOpen", !this.state.sidebarOpen);
  }

  setSidebarOpen(open: boolean): void {
    this.setState({ sidebarOpen: open });
    this.persistToLocalStorage("sidebarOpen", open);
  }

  setModalOpen(open: boolean): void {
    this.setState({ modalOpen: open });
  }

  // =========================================================================
  // NOTIFICATION ACTIONS
  // =========================================================================

  addNotification(notification: Omit<Notification, "id">): void {
    const id = `notification-${Date.now()}-${Math.random()}`;
    const newNotification: Notification = { ...notification, id };

    const notifications = [...this.state.notifications, newNotification];

    // Límite máximo de 5 toasts simultáneos
    if (notifications.length > 5) {
      notifications.shift();
    }

    this.setState({ notifications: notifications as readonly Notification[] });

    // Auto-dismiss después de duración especificada
    if (notification.duration !== 0) {
      const duration = notification.duration || 3000;
      setTimeout(() => {
        this.removeNotification(id);
      }, duration);
    }
  }

  removeNotification(id: string): void {
    const notifications = this.state.notifications.filter((n) => n.id !== id);
    this.setState({ notifications: notifications as readonly Notification[] });
  }

  clearNotifications(): void {
    this.setState({ notifications: [] });
  }

  // =========================================================================
  // FORM ACTIONS
  // =========================================================================

  setFormData(data: Record<string, any>): void {
    this.setState({ formData: data });
  }

  updateFormField(field: string, value: any): void {
    const formData = { ...this.state.formData, [field]: value };
    this.setState({ formData, isDirty: true });
  }

  setFormErrors(errors: Record<string, string>): void {
    this.setState({ formErrors: errors });
  }

  setFormSubmitting(submitting: boolean): void {
    this.setState({ isSubmitting: submitting });
  }

  setFormDirty(dirty: boolean): void {
    this.setState({ isDirty: dirty });
  }

  resetForm(): void {
    this.setState({
      formData: {},
      formErrors: {},
      isSubmitting: false,
      isDirty: false,
    });
  }

  // =========================================================================
  // DATA ACTIONS
  // =========================================================================

  setItems(items: readonly any[]): void {
    this.setState({ items });
  }

  setFilters(filters: Record<string, any>): void {
    this.setState({ filters, currentPage: 1 }); // Reset a página 1 cuando cambian filtros
  }

  setSortBy(sortBy: string, order: "asc" | "desc" = "asc"): void {
    this.setState({ sortBy, sortOrder: order });
  }

  setCurrentPage(page: number): void {
    this.setState({ currentPage: Math.max(1, page) });
  }

  setTotalPages(total: number): void {
    this.setState({ totalPages: Math.max(1, total) });
  }

  // =========================================================================
  // ASYNC ACTIONS
  // =========================================================================

  setLoading(loading: boolean): void {
    this.setState({ isLoading: loading });
  }

  setError(error: string | null): void {
    this.setState({ error });
  }

  incrementRetryCount(): void {
    this.setState({ retryCount: this.state.retryCount + 1 });
  }

  resetRetryCount(): void {
    this.setState({ retryCount: 0 });
  }

  // =========================================================================
  // PERSISTENCE
  // =========================================================================

  persistToLocalStorage(key: string, value: any): void {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`abs-state:${key}`, JSON.stringify(value));
      }
    } catch (e) {
      if (this.devMode) {
        console.warn(`[StateStore] Failed to persist ${key}:`, e);
      }
    }
  }

  getFromLocalStorage(key: string): any {
    try {
      if (typeof localStorage !== "undefined") {
        const value = localStorage.getItem(`abs-state:${key}`);
        return value ? JSON.parse(value) : null;
      }
    } catch (e) {
      if (this.devMode) {
        console.warn(`[StateStore] Failed to read ${key} from localStorage:`, e);
      }
    }
    return null;
  }

  private restoreFromLocalStorage(): void {
    try {
      if (typeof localStorage !== "undefined") {
        const theme = this.getFromLocalStorage("theme");
        const sidebarOpen = this.getFromLocalStorage("sidebarOpen");

        if (theme) this.state.theme = theme;
        if (sidebarOpen !== null) this.state.sidebarOpen = sidebarOpen;
      }
    } catch (e) {
      if (this.devMode) {
        console.warn("[StateStore] Failed to restore from localStorage:", e);
      }
    }
  }

  // =========================================================================
  // UTILS
  // =========================================================================

  reset(): void {
    this.state = { ...initialState };
    this.notify();
  }
}

/**
 * Singleton global store
 */
let globalStore: StateStore | null = null;

export function getGlobalStore(): StateStore {
  if (!globalStore) {
    const devMode = typeof process !== "undefined" && process.env.NODE_ENV === "development";
    globalStore = new StateStore(devMode);
  }
  return globalStore;
}

export function resetGlobalStore(): void {
  globalStore = null;
}

export interface StoreInterface extends StateActions {
  readonly theme: Theme;
  readonly sidebarOpen: boolean;
  readonly modalOpen: boolean;
  readonly notifications: readonly Notification[];
  readonly formData: Record<string, any>;
  readonly formErrors: Record<string, string>;
  readonly isSubmitting: boolean;
  readonly isDirty: boolean;
  readonly items: readonly any[];
  readonly filters: Record<string, any>;
  readonly sortBy: string;
  readonly sortOrder: "asc" | "desc";
  readonly currentPage: number;
  readonly totalPages: number;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly retryCount: number;
}

/**
 * Hook-like function para usar el store en componentes
 * Uso: const { theme, setTheme } = useStore()
 */
export function useStore(): StoreInterface {
  const store = getGlobalStore();
  const state = store.getState();

  return {
    theme: state.theme,
    sidebarOpen: state.sidebarOpen,
    modalOpen: state.modalOpen,
    notifications: state.notifications,
    formData: state.formData,
    formErrors: state.formErrors,
    isSubmitting: state.isSubmitting,
    isDirty: state.isDirty,
    items: state.items,
    filters: state.filters,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    currentPage: state.currentPage,
    totalPages: state.totalPages,
    isLoading: state.isLoading,
    error: state.error,
    retryCount: state.retryCount,
    setTheme: (t) => store.setTheme(t),
    toggleSidebar: () => store.toggleSidebar(),
    setSidebarOpen: (o) => store.setSidebarOpen(o),
    setModalOpen: (o) => store.setModalOpen(o),
    addNotification: (n) => store.addNotification(n),
    removeNotification: (id) => store.removeNotification(id),
    clearNotifications: () => store.clearNotifications(),
    setFormData: (d) => store.setFormData(d),
    updateFormField: (f, v) => store.updateFormField(f, v),
    setFormErrors: (e) => store.setFormErrors(e),
    setFormSubmitting: (s) => store.setFormSubmitting(s),
    setFormDirty: (d) => store.setFormDirty(d),
    resetForm: () => store.resetForm(),
    setItems: (i) => store.setItems(i),
    setFilters: (f) => store.setFilters(f),
    setSortBy: (s, o) => store.setSortBy(s, o),
    setCurrentPage: (p) => store.setCurrentPage(p),
    setTotalPages: (t) => store.setTotalPages(t),
    setLoading: (l) => store.setLoading(l),
    setError: (e) => store.setError(e),
    incrementRetryCount: () => store.incrementRetryCount(),
    resetRetryCount: () => store.resetRetryCount(),
    persistToLocalStorage: (k, v) => store.persistToLocalStorage(k, v),
    getFromLocalStorage: (k) => store.getFromLocalStorage(k),
    reset: () => store.reset(),
  };
}
