/**
 * A/B Testing Framework
 * Maneja: asignación de variantes, tracking, conversiones determinísticas
 */

export interface Variant {
  id: string;
  name: string;
  weight: number; // 0-100, suma debe ser 100
  config: Record<string, unknown>;
}

export interface ABTest {
  id: string;
  name: string;
  active: boolean;
  variants: Variant[];
  createdAt: string;
  expiresAt?: string;
}

export interface UserAssignment {
  testId: string;
  variantId: string;
  assignedAt: string;
  conversionTracked: boolean;
}

export interface ConversionEvent {
  testId: string;
  variantId: string;
  goal: string;
  value: number | undefined;
  timestamp: string;
}

export class ABTestManager {
  private tests: Map<string, ABTest> = new Map();
  private userAssignments: Map<string, UserAssignment> = new Map();
  private conversions: ConversionEvent[] = [];
  private userId: string;
  private seed: number;

  constructor() {
    this.userId = this.getOrCreateUserId();
    this.seed = this.generateSeed(this.userId);
    this.restoreState();
  }

  /**
   * Obtiene o crea ID de usuario para determinismo
   */
  private getOrCreateUserId(): string {
    let userId = localStorage.getItem('abs-user-id');
    if (!userId) {
      userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('abs-user-id', userId);
    }
    return userId;
  }

  /**
   * Genera seed determinístico a partir del user ID
   */
  private generateSeed(userId: string): number {
    let seed = 0;
    for (let i = 0; i < userId.length; i++) {
      seed = ((seed << 5) - seed) + userId.charCodeAt(i);
      seed = seed & seed; // Convierte a 32-bit int
    }
    return Math.abs(seed);
  }

  /**
   * Generador de números pseudo-aleatorios seeded (determinístico)
   */
  private seededRandom(testId: string): number {
    const combined = this.seed ^ this.hashString(testId);
    let x = Math.sin(combined) * 10000;
    return x - Math.floor(x);
  }

  /**
   * Hash simple de string
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Registra un test A/B
   */
  registerTest(test: ABTest): void {
    // Valida que los pesos sumen 100
    const totalWeight = test.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      throw new Error(`Pesos de variantes deben sumar 100, actual: ${totalWeight}`);
    }

    this.tests.set(test.id, test);
    this.persistState();
  }

  /**
   * Obtiene la variante asignada a un usuario para un test
   */
  getVariant(testId: string): Variant | null {
    const test = this.tests.get(testId);
    if (!test || !test.active) return null;

    // Verifica expiración
    if (test.expiresAt && new Date(test.expiresAt) < new Date()) {
      return null;
    }

    // Revisa si ya está asignado
    const key = `${testId}-${this.userId}`;
    let assignment = this.userAssignments.get(key);

    if (!assignment) {
      // Asigna determinísticamente
      const rand = this.seededRandom(testId);
      let cumulative = 0;
      let selectedVariant: Variant | undefined;

      for (const variant of test.variants) {
        cumulative += variant.weight / 100;
        if (rand < cumulative) {
          selectedVariant = variant;
          break;
        }
      }

      if (!selectedVariant) {
        selectedVariant = test.variants[test.variants.length - 1];
      }

      assignment = {
        testId,
        variantId: selectedVariant!.id,
        assignedAt: new Date().toISOString(),
        conversionTracked: false,
      };

      this.userAssignments.set(key, assignment);
      this.persistState();
    }

    return (
      test.variants.find((v) => v.id === assignment!.variantId) || null
    );
  }

  /**
   * Obtiene config de variante
   */
  getVariantConfig(testId: string): Record<string, unknown> | null {
    const variant = this.getVariant(testId);
    return variant ? variant.config : null;
  }

  /**
   * Trackea una conversión
   */
  trackConversion(testId: string, goal: string, value?: number): void {
    const key = `${testId}-${this.userId}`;
    const assignment = this.userAssignments.get(key);

    if (!assignment) {
      console.warn(`No assignment found for test ${testId}`);
      return;
    }

    const event: ConversionEvent = {
      testId,
      variantId: assignment.variantId,
      goal,
      value: value !== undefined ? value : undefined,
      timestamp: new Date().toISOString(),
    };

    this.conversions.push(event);
    this.persistState();

    // Marca como tracked
    const stored = this.userAssignments.get(key);
    if (stored) {
      (stored as any).conversionTracked = true;
    }
  }

  /**
   * Obtiene estadísticas de un test
   */
  getTestStats(testId: string): {
    variantStats: Record<
      string,
      {
        assignments: number;
        conversions: number;
        conversionRate: number;
      }
    >;
    totalAssignments: number;
    totalConversions: number;
  } {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} no encontrado`);
    }

    const variantStats: Record<
      string,
      {
        assignments: number;
        conversions: number;
        conversionRate: number;
      }
    > = {};

    for (const variant of test.variants) {
      variantStats[variant.id] = {
        assignments: 0,
        conversions: 0,
        conversionRate: 0,
      };
    }

    // Cuenta asignaciones
    for (const assignment of this.userAssignments.values()) {
      if (assignment.testId === testId && variantStats[assignment.variantId]) {
        variantStats[assignment.variantId]!.assignments++;
      }
    }

    // Cuenta conversiones
    for (const conversion of this.conversions) {
      if (conversion.testId === testId && variantStats[conversion.variantId]) {
        variantStats[conversion.variantId]!.conversions++;
      }
    }

    // Calcula conversion rate
    for (const stats of Object.values(variantStats)) {
      if (stats.assignments > 0) {
        stats.conversionRate = stats.conversions / stats.assignments;
      }
    }

    const totalAssignments = Object.values(variantStats).reduce(
      (sum, s) => sum + s.assignments,
      0
    );
    const totalConversions = Object.values(variantStats).reduce(
      (sum, s) => sum + s.conversions,
      0
    );

    return {
      variantStats,
      totalAssignments,
      totalConversions,
    };
  }

  /**
   * Obtiene todas las asignaciones del usuario
   */
  getUserAssignments(): Record<string, Variant> {
    const assignments: Record<string, Variant> = {};

    for (const [key, assignment] of this.userAssignments) {
      const testId = assignment.testId;
      const variant = this.getVariant(testId);
      if (variant) {
        assignments[testId] = variant;
      }
    }

    return assignments;
  }

  /**
   * Limpia un test (lo desactiva)
   */
  deactivateTest(testId: string): void {
    const test = this.tests.get(testId);
    if (test) {
      test.active = false;
      this.persistState();
    }
  }

  /**
   * Persiste estado en localStorage
   */
  private persistState(): void {
    try {
      const state = {
        tests: Array.from(this.tests.entries()),
        assignments: Array.from(this.userAssignments.entries()),
        conversions: this.conversions,
      };
      localStorage.setItem('abs-ab-testing', JSON.stringify(state));
    } catch (error) {
      console.error('Error persistiendo AB testing state:', error);
    }
  }

  /**
   * Restaura estado desde localStorage
   */
  private restoreState(): void {
    try {
      const stored = localStorage.getItem('abs-ab-testing');
      if (stored) {
        const state = JSON.parse(stored);
        if (state.tests) {
          this.tests = new Map(state.tests);
        }
        if (state.assignments) {
          this.userAssignments = new Map(state.assignments);
        }
        if (state.conversions) {
          this.conversions = state.conversions;
        }
      }
    } catch (error) {
      console.error('Error restaurando AB testing state:', error);
    }
  }

  /**
   * Obtiene ID de usuario
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Obtiene todos los tests
   */
  getAllTests(): ABTest[] {
    return Array.from(this.tests.values());
  }

  /**
   * Limpia todo el estado (para tests)
   */
  clear(): void {
    this.tests.clear();
    this.userAssignments.clear();
    this.conversions = [];
    localStorage.removeItem('abs-ab-testing');
    localStorage.removeItem('abs-user-id');
  }
}

/**
 * Singleton global del AB Test Manager
 */
let abTestManager: ABTestManager | null = null;

export function getABTestManager(): ABTestManager {
  if (!abTestManager) {
    abTestManager = new ABTestManager();
  }
  return abTestManager;
}

export function resetABTestManager(): void {
  abTestManager = null;
}
