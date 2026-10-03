/**
 * Motor de Microinteractions & Animaciones (Fase 2, Paso 5)
 * Animaciones predefinidas: ripple, fade, slide, spring.
 * Timing configurable: fast (150ms), normal (300ms), slow (500ms).
 * Easing: easeIn, easeOut, easeInOut, cubic-bezier personalizados.
 */

export type AnimationType =
  | "ripple"
  | "fade-in"
  | "fade-out"
  | "slide-in"
  | "slide-out"
  | "bounce"
  | "spring"
  | "pulse";

export type AnimationTiming = "fast" | "normal" | "slow";
export type AnimationEasing =
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "linear"
  | "cubic-bezier";

export type AnimationTrigger = "hover" | "focus" | "click" | "load";

export interface MicrointeractionSpec {
  readonly type: AnimationType;
  readonly timing: AnimationTiming;
  readonly easing: AnimationEasing;
  readonly trigger: AnimationTrigger;
  readonly duration?: number; // ms override
  readonly easingFunction?: string; // custom cubic-bezier
}

const TIMING_MAP: Record<AnimationTiming, number> = {
  fast: 150,
  normal: 300,
  slow: 500,
};

const EASING_MAP: Record<AnimationEasing, string> = {
  easeIn: "cubic-bezier(0.42, 0, 1, 1)",
  easeOut: "cubic-bezier(0, 0, 0.58, 1)",
  easeInOut: "cubic-bezier(0.42, 0, 0.58, 1)",
  linear: "linear",
  "cubic-bezier": "cubic-bezier(0.34, 1.56, 0.64, 1)", // spring default
};

/**
 * Genera CSS keyframes para la animación ripple (Material Design).
 */
function generateRippleKeyframes(): string {
  return `
@keyframes ripple-effect {
  0% {
    transform: scale(0);
    opacity: 0.6;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

.ripple-container {
  position: relative;
  overflow: hidden;
}

.ripple {
  position: absolute;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.6);
  transform: scale(0);
}

.ripple-active {
  animation: ripple-effect var(--animation-timing, 600ms) linear;
}
`;
}

/**
 * Genera CSS keyframes para fade in/out.
 */
function generateFadeKeyframes(): string {
  return `
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.fade-in {
  animation: fade-in var(--animation-timing, 300ms) ease-out;
}

.fade-out {
  animation: fade-out var(--animation-timing, 300ms) ease-in;
}
`;
}

/**
 * Genera CSS keyframes para slide in/out.
 */
function generateSlideKeyframes(): string {
  return `
@keyframes slide-in-left {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slide-in-top {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes slide-out-left {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

@keyframes slide-out-right {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

.slide-in {
  animation: slide-in-right var(--animation-timing, 300ms) ease-out;
}

.slide-out {
  animation: slide-out-right var(--animation-timing, 300ms) ease-in;
}
`;
}

/**
 * Genera CSS keyframes para bounce y spring.
 */
function generateBounceKeyframes(): string {
  return `
@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  25% {
    transform: translateY(-8px);
  }
  50% {
    transform: translateY(0);
  }
  75% {
    transform: translateY(-4px);
  }
}

@keyframes spring {
  0% {
    transform: scale(0.8) translateY(10px);
    opacity: 0;
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

.bounce {
  animation: bounce var(--animation-timing, 600ms) ease-in-out;
}

.spring {
  animation: spring var(--animation-timing, 500ms) cubic-bezier(0.34, 1.56, 0.64, 1);
}
`;
}

/**
 * Genera CSS keyframes para pulse (atención).
 */
function generatePulseKeyframes(): string {
  return `
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.pulse {
  animation: pulse var(--animation-timing, 2000ms) ease-in-out infinite;
}
`;
}

/**
 * Genera todos los CSS keyframes y clases de animación.
 */
export function generateMicrointeractionsCss(): string {
  return (
    generateRippleKeyframes() +
    "\n" +
    generateFadeKeyframes() +
    "\n" +
    generateSlideKeyframes() +
    "\n" +
    generateBounceKeyframes() +
    "\n" +
    generatePulseKeyframes() +
    `
/* Animation variables for dynamic timing */
:root {
  --animation-fast: 150ms;
  --animation-normal: 300ms;
  --animation-slow: 500ms;
  --easing-ease-in: cubic-bezier(0.42, 0, 1, 1);
  --easing-ease-out: cubic-bezier(0, 0, 0.58, 1);
  --easing-ease-in-out: cubic-bezier(0.42, 0, 0.58, 1);
  --easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Trigger-based styles */
.animation-hover:hover {
  animation-play-state: running;
}

.animation-focus:focus {
  animation-play-state: running;
}

.animation-click {
  cursor: pointer;
}

.animation-load {
  animation-play-state: running;
}

/* Paused by default for manual trigger */
.animation-paused {
  animation-play-state: paused;
}
`
  );
}

/**
 * Genera clase de animación con timing y easing.
 */
export function generateAnimationClass(
  spec: MicrointeractionSpec
): string {
  const duration = spec.duration || TIMING_MAP[spec.timing];
  const easing =
    spec.easingFunction || EASING_MAP[spec.easing] || "ease";

  const animationName = spec.type.replace(/-/g, "-");
  const triggerClass =
    spec.trigger === "load" ? "animation-load" : `animation-${spec.trigger}`;

  return `animation: ${animationName} ${duration}ms ${easing} ${spec.trigger === "load" ? "" : "both"}; animation-play-state: paused;`;
}

/**
 * Envuelve elemento con clase de animación.
 */
export function wrapWithAnimation(
  content: string,
  spec: MicrointeractionSpec,
  elementId: string
): string {
  const animClass = spec.type
    .replace(/-/g, "-")
    .toLowerCase();
  const triggerClass = `animation-${spec.trigger}`;
  const timingClass = `animation-${spec.timing}`;
  const easingClass = `easing-${spec.easing}`;

  return `<div
    id="${elementId}-animated"
    class="${animClass} ${triggerClass} ${timingClass} ${easingClass}"
    data-animation="${spec.type}"
    data-trigger="${spec.trigger}"
  >
    ${content}
  </div>`;
}

/**
 * Genera JavaScript para ripple effect en click.
 */
export function generateRippleScript(): string {
  return `
<script>
(function() {
  const rippleContainers = document.querySelectorAll('.ripple-container');

  rippleContainers.forEach(container => {
    container.addEventListener('click', function(e) {
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      const ripple = document.createElement('div');
      ripple.className = 'ripple ripple-active';
      ripple.style.width = size + 'px';
      ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';

      this.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    });
  });
})();
</script>
`;
}

/**
 * Genera objeto de especificación completo por defecto.
 */
export function defaultMicrointeraction(
  type: AnimationType
): MicrointeractionSpec {
  return {
    type,
    timing: "normal",
    easing: "easeOut",
    trigger: "click",
  };
}

/**
 * Convierte especificación a atributos HTML data-.
 */
export function microinteractionToDataAttrs(
  spec: MicrointeractionSpec,
  elementId: string
): string {
  return `data-animation="${spec.type}" data-timing="${spec.timing}" data-easing="${spec.easing}" data-trigger="${spec.trigger}" id="${elementId}"`;
}
