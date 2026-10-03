/**
 * Sistema de Lazy Loading + Image Optimization
 * - Intersection Observer para detectar imágenes visibles
 * - Placeholder (skeleton/blur) mientras carga
 * - Fallback si falla
 * - Retry automático
 * - Responsive srcset + WebP con fallback JPEG
 * - CSS fade-in animation
 */

export interface ImageSource {
  readonly src: string;
  readonly srcset?: string;
  readonly sizes?: string;
  readonly type?: string; // image/webp, image/jpeg, etc
}

export interface LazyImageConfig {
  readonly src: string;
  readonly alt: string;
  readonly srcset?: string;
  readonly sizes?: string;
  readonly placeholder?: "blur" | "skeleton" | "solid";
  readonly placeholderColor?: string;
  readonly sources?: readonly ImageSource[];
  readonly fallbackSrc?: string;
  readonly width?: number;
  readonly height?: number;
  readonly onLoad?: (img: HTMLImageElement) => void;
  readonly onError?: (error: Error) => void;
  readonly retryCount?: number;
  readonly retryDelay?: number;
}

/**
 * Lazy Loader usando Intersection Observer
 */
export class LazyLoader {
  private observer: IntersectionObserver | null = null;
  private loadedImages: Set<HTMLImageElement> = new Set();
  private failedImages: Map<HTMLImageElement, number> = new Map();
  private devMode: boolean = true;
  private retryAttempts: number = 3;

  constructor(devMode: boolean = true) {
    this.devMode = devMode;
    this.initObserver();
  }

  /**
   * Inicializa Intersection Observer
   */
  private initObserver(): void {
    if (typeof IntersectionObserver === "undefined") {
      if (this.devMode) console.warn("[LazyLoader] IntersectionObserver no disponible");
      return;
    }

    const options = {
      root: null,
      rootMargin: "50px", // Empieza a cargar 50px antes de que sea visible
      threshold: 0.01,
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          this.loadImage(img);
        }
      });
    }, options);
  }

  /**
   * Observa una imagen para lazy loading
   */
  observe(img: HTMLImageElement): void {
    if (!this.observer) {
      this.loadImage(img);
      return;
    }

    // Marcar como imagen lazy
    img.classList.add("lazy-image");

    // Agregar clase de cargando
    img.classList.add("loading");

    this.observer.observe(img);
  }

  /**
   * Detiene observación de una imagen
   */
  unobserve(img: HTMLImageElement): void {
    this.observer?.unobserve(img);
  }

  /**
   * Carga una imagen
   */
  private loadImage(img: HTMLImageElement): void {
    if (this.loadedImages.has(img)) return;

    const src = img.dataset.src || img.src;
    const srcset = img.dataset.srcset;
    const sizes = img.dataset.sizes;

    if (!src) return;

    // Crear imagen temporal para cargar
    const tempImg = new Image();

    // Configurar eventos
    tempImg.onload = () => {
      img.src = src;
      if (srcset) img.srcset = srcset;
      if (sizes) img.sizes = sizes;
      img.classList.remove("loading");
      img.classList.add("loaded");
      this.loadedImages.add(img);
      this.unobserve(img);

      const config = (img as any).__lazyConfig as LazyImageConfig | undefined;
      if (config?.onLoad) {
        config.onLoad(img);
      }

      if (this.devMode) console.log("[LazyLoader] Imagen cargada:", src);
    };

    tempImg.onerror = () => {
      const retries = this.failedImages.get(img) || 0;
      const maxRetries = ((img as any).__lazyConfig as LazyImageConfig | undefined)?.retryCount ?? this.retryAttempts;

      if (retries < maxRetries) {
        this.failedImages.set(img, retries + 1);
        const delay = ((img as any).__lazyConfig as LazyImageConfig | undefined)?.retryDelay ?? 1000;
        setTimeout(() => this.loadImage(img), delay);
        if (this.devMode) console.log(`[LazyLoader] Reintentando imagen (${retries + 1}/${maxRetries}):`, src);
      } else {
        // Fallback
        const fallbackSrc = ((img as any).__lazyConfig as LazyImageConfig | undefined)?.fallbackSrc;
        if (fallbackSrc && fallbackSrc !== src) {
          img.src = fallbackSrc;
          if (this.devMode) console.log("[LazyLoader] Usando fallback:", fallbackSrc);
        }

        img.classList.remove("loading");
        img.classList.add("error");

        const config = (img as any).__lazyConfig as LazyImageConfig | undefined;
        if (config?.onError) {
          config.onError(new Error(`Error cargando imagen: ${src}`));
        }
      }
    };

    // Iniciar carga
    tempImg.src = src;
    if (srcset) tempImg.srcset = srcset;
  }

  /**
   * Detiene todas las observaciones
   */
  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.loadedImages.clear();
    this.failedImages.clear();
  }
}

/**
 * Aplica lazy loading a una imagen
 */
export function createLazyImage(config: LazyImageConfig): HTMLImageElement {
  const img = document.createElement("img");
  img.alt = config.alt;
  img.width = config.width || 0;
  img.height = config.height || 0;

  // Guardar configuración para acceso posterior
  (img as any).__lazyConfig = config;

  // Aplicar placeholder
  const placeholderColor = config.placeholderColor || "#f0f0f0";
  if (config.placeholder === "blur") {
    // Usar una imagen placeholder blur muy pequeña como data URI
    img.style.backgroundImage = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="${placeholderColor}" width="10" height="10"/></svg>')`;
    img.style.backgroundSize = "cover";
  } else if (config.placeholder === "skeleton") {
    img.style.backgroundColor = placeholderColor;
    img.classList.add("skeleton");
  } else if (config.placeholder === "solid") {
    img.style.backgroundColor = placeholderColor;
  }

  // Usar data attributes para lazy loading
  img.dataset.src = config.src;
  if (config.srcset) img.dataset.srcset = config.srcset;
  if (config.sizes) img.dataset.sizes = config.sizes;

  // Fallback inmediato si no tenemos IntersectionObserver
  if (typeof IntersectionObserver === "undefined") {
    img.src = config.src;
    if (config.srcset) img.srcset = config.srcset;
    if (config.sizes) img.sizes = config.sizes;
  }

  return img;
}

/**
 * Genera srcset responsivo para diferentes breakpoints
 */
export function generateResponsiveSrcset(
  baseUrl: string,
  widths: readonly number[] = [320, 640, 960, 1280, 1920]
): string {
  return widths
    .map((w) => {
      // Asumir que baseUrl tiene formato como: /images/photo.jpg
      // Convertir a: /images/photo-320w.jpg
      const parts = baseUrl.split(".");
      const ext = parts.pop();
      const base = parts.join(".");
      return `${base}-${w}w.${ext} ${w}w`;
    })
    .join(", ");
}

/**
 * Genera picture element con múltiples fuentes (WebP + JPEG)
 */
export function createPictureElement(
  jpegUrl: string,
  webpUrl: string,
  alt: string,
  config: Partial<LazyImageConfig> = {}
): HTMLPictureElement {
  const picture = document.createElement("picture");

  // Fuente WebP
  const webpSource = document.createElement("source");
  webpSource.type = "image/webp";
  webpSource.dataset.srcset = config.srcset || webpUrl;
  picture.appendChild(webpSource);

  // Fallback JPEG
  const img = createLazyImage({
    src: jpegUrl,
    alt,
    ...config,
  });

  picture.appendChild(img);
  return picture;
}

/**
 * CSS para lazy loading (fade-in animation)
 */
export function generateLazyLoadingCss(): string {
  return `
/* Lazy Loading Styles */

.lazy-image {
  transition: opacity 300ms ease-in;
}

.lazy-image.loading {
  opacity: 0.5;
}

.lazy-image.loaded {
  animation: fadeInImage 300ms ease-in;
  opacity: 1;
}

.lazy-image.error {
  opacity: 0.3;
}

@keyframes fadeInImage {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.lazy-image.skeleton {
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Responsive images */
img {
  max-width: 100%;
  height: auto;
  display: block;
}

picture {
  display: block;
}

picture img {
  width: 100%;
  height: auto;
}

/* Reduce motion preference */
@media (prefers-reduced-motion: reduce) {
  .lazy-image {
    transition: none;
  }

  .lazy-image.skeleton {
    animation: none;
  }

  @keyframes fadeInImage {
    from, to {
      opacity: 1;
    }
  }
}
`.trim();
}

/**
 * Singleton global lazy loader
 */
let globalLazyLoader: LazyLoader | null = null;

export function getGlobalLazyLoader(): LazyLoader {
  if (!globalLazyLoader) {
    const devMode = typeof process !== "undefined" && process.env.NODE_ENV === "development";
    globalLazyLoader = new LazyLoader(devMode);
  }
  return globalLazyLoader;
}

export function resetGlobalLazyLoader(): void {
  globalLazyLoader?.destroy();
  globalLazyLoader = null;
}

/**
 * Observa todas las imágenes lazy en el documento
 */
export function observeAllLazyImages(): void {
  if (typeof document === "undefined") return;

  const loader = getGlobalLazyLoader();
  const lazyImages = document.querySelectorAll("img.lazy-image, img[data-src]");

  lazyImages.forEach((img) => {
    loader.observe(img as HTMLImageElement);
  });
}
