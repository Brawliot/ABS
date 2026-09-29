/**
 * Textos legales — borradores. Marcados claramente como pendientes de abogado.
 */

export const PRIVACY_POLICY_DRAFT = `
# Política de privacidad (BORRADOR)

**PENDIENTE DE REVISIÓN POR ABOGADO. No usar en producción sin validación legal.**

## Responsable
[Nombre / NIF / domicilio de la empresa usuaria de ABS]

## Datos que tratamos
- Cuenta: correo, nombre, rol, sede/equipo, hashes de contraseña (argon2id).
- Parte (clientes/proveedores): nombre, contacto, identificadores fiscales — almacenados fuera del historial de eventos.
- Logs de seguridad: eventos técnicos sin contraseñas ni secretos.

## Finalidades
Prestación del servicio de gestión, seguridad del acceso, cumplimiento de obligaciones legales.

## Conservación
Según política técnica de retención configurable; las facturas pueden tener plazos legales más largos.

## Destinatarios
Personal autorizado; proveedores de infraestructura, correo y, si se activa, LLM (ver registro de terceros).

## Derechos
Acceso, rectificación, supresión, portabilidad, oposición y limitación — ejercibles vía la empresa responsable.
La supresión de PII de Parte no altera el historial inmutable de eventos (solo referencias opacas).

## Contacto
[email DPO / privacidad]
`.trim();

export const DPA_DRAFT = `
# Contrato de encargado del tratamiento (BORRADOR — art. 28 RGPD)

**PENDIENTE DE REVISIÓN POR ABOGADO. No firmar ni publicar sin validación legal.**

Entre:
- Responsable: [cliente / negocio]
- Encargado: [operador de la instancia ABS / hosting]

## Objeto
Tratamiento de datos personales necesarios para operar el software ABS (cuentas, identidad de Partes, logs).

## Instrucciones
El Encargado solo trata datos según instrucciones documentadas del Responsable.

## Seguridad
Medidas técnicas descritas en la documentación ABS (cifrado en tránsito, hashing, separación PII/EventStore, CSRF, etc.).

## Subencargados
Lista actualizable (hosting, correo, LLM). El Responsable será informado con antelación razonable.

## Asistencia
Colaboración en derechos de interesados, DPIA y notificaciones de brechas.

## Fin del contrato
Devolución o borrado de datos personales a elección del Responsable, salvo obligación legal de conservación.
`.trim();
