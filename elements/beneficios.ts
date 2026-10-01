/**
 * Tipos para beneficios de empleados (AFP, ISAPRE, FONASA, Seguros, Bonificación).
 */

export type TipoBeneficio = "afp" | "isapre" | "fonasa" | "seguros" | "bonificacion";

export interface BeneficioEmpleado {
  readonly empleadoId: string;
  readonly tipo: TipoBeneficio;
  readonly valor: number; // % o monto fijo
  readonly activo: boolean;
  readonly desde: Date;
  readonly hasta?: Date;
}

export interface ConfiguracionBeneficio {
  readonly tipo: TipoBeneficio;
  readonly porcentajeDescuento: number;
  readonly esDescuento: boolean; // true = resta de nómina, false = aporte
}
