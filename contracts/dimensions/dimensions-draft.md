# Catálogo de dimensiones por elemento — BORRADOR PENDIENTE

Estado: **pendiente**. No implementar todavía. Se retomará después de la prueba de uso real en staging, incorporando lo aprendido en ella. Destino previsto: `contracts/dimensions/`.

## Propósito

El núcleo de producto no es una lista de módulos ("ventas", "reservas"), sino la capacidad de saber qué variante exacta de cada operación necesita cada negocio. Vender en un restaurante, en una tienda online y en una concesionaria usa el mismo arquetipo, pero requiere software distinto.

Las dimensiones se definen **por elemento del núcleo**, no por operación, para que sirvan a todos los arquetipos sin repetirse.

## Reglas

1. Una dimensión solo existe si cambiar su valor cambia el software (composición, reglas, pantallas o equipamiento). Si no cambia nada, sobra.
2. Cada dimensión tiene una lista cerrada de valores y una pregunta en lenguaje normal para el dueño del negocio, con política ante desconocido (preguntar, valor por defecto seguro o bloquear).
3. El equipamiento no es una dimensión: se deduce de las demás (p. ej. TPV = en local + cobro al momento + volumen alto). No se pregunta.
4. Estado y Evento no llevan dimensiones: son piezas internas de la gramática.

## Transversal: Canal


| Dimensión                  | Valores                                                     | Qué cambia                                               | Pregunta                                      |
| -------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------- |
| Canal de contacto y compra | En local, online, teléfono, mensajería, en casa del cliente | Web pública, portal, cerebro de llamadas y WhatsApp, TPV | ¿Cómo te contactan y te compran tus clientes? |


## Parte (clientes y proveedores)


| Dimensión                  | Valores                                                                                   | Qué cambia                                                                    | Pregunta                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Identificación del cliente | Anónimo, identificado en la operación, cliente habitual con ficha, cuenta con condiciones | CRM, portal, posibilidad de crédito, tipo de factura                          | ¿Sabes quién es cada cliente, o muchos pasan sin dejar datos? |
| Tipo de cliente            | Particular, empresa, ambos                                                                | Factura completa, factura electrónica entre empresas, condiciones comerciales | ¿Vendes a particulares, a empresas o a los dos?               |
| Tercero relacionado        | Ninguno, tutor de un menor, pagador distinto (financiera, aseguradora), representante     | Visibilidad delegada, cobro a un tercero                                      | ¿Alguien paga o decide por tu cliente?                        |
| Sensibilidad de los datos  | Normal, salud, menores, económicos                                                        | Reglas del Filtro, consentimientos                                            | ¿Guardas datos de salud, de menores o económicos?             |
| Relación con proveedores   | Compras sueltas, proveedores habituales con condiciones, subcontratas                     | Compras, pagos a plazo a proveedores, documentación de subcontratas           | ¿Compras siempre a los mismos? ¿Subcontratas trabajos?        |


## Oferta (lo que se vende)


| Dimensión            | Valores                                                                                    | Qué cambia                                                                 | Pregunta                                                          |
| -------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Naturaleza           | Bien, trabajo, acceso, uso, cobertura financiera                                           | Arquetipo de base (ya existe)                                              | ¿Vendes productos, servicios, acceso o alquiler?                  |
| Forma del precio     | Catálogo fijo, presupuesto, por tiempo, por cantidad o medida, tarifa periódica, negociado | Catálogo o flujo de presupuesto y aceptación, cálculos, contador de tiempo | ¿Tus precios están en una lista o los calculas para cada cliente? |
| Configuración        | Estándar, con opciones (tallas, menú), a medida                                            | Variantes de producto, configurador, presupuesto                           | ¿Lo que vendes es siempre igual o se adapta a cada cliente?       |
| Tamaño del catálogo  | Pocos, cientos, miles                                                                      | Búsqueda, lector de códigos, importación masiva                            | ¿Cuántos productos o servicios distintos tienes?                  |
| Cambios tras aceptar | No, sí (modificados)                                                                       | Versionado del alcance con nueva aceptación                                | ¿Es habitual que el cliente cambie lo acordado a mitad?           |


## Recurso (lo que se usa o se tiene)


| Dimensión       | Valores                                                                                             | Qué cambia                                                                   | Pregunta                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Propiedad       | Propios por cantidad, propios unitarios, del cliente                                                | Inventario, catálogo de unidades, custodia (ya existe como naturalezaBienes) | ¿Tienes stock? ¿Te dejan cosas los clientes?                             |
| Capacidad       | Sin límite, cita individual, plazas, unidades por fechas                                            | Agenda, aforo, disponibilidad (ya existe en parte como capacityMode)         | ¿Atiendes con cita, por plazas o alquilas por fechas?                    |
| Uso del recurso | Se revende tal cual, se transforma (cocina, fabricación), se consume en el servicio (tinte, piezas) | Recetas y escandallos, descuento automático de stock                         | ¿Lo que compras lo vendes igual, lo transformas o lo gastas al trabajar? |
| Control         | Ninguno, lote, caducidad, número de serie                                                           | Trazabilidad, alertas de caducidad                                           | ¿Necesitas controlar lotes, caducidades o números de serie?              |
| Ubicación       | Un almacén, varias sedes, en ruta                                                                   | Traspasos entre sedes, stock por ubicación                                   | ¿Tienes el material en un sitio o en varios?                             |


## Compromiso de entregar


| Dimensión          | Valores                                                                         | Qué cambia                                                   | Pregunta                                       |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Momento            | Inmediato, programado, tras preparación, por fases                              | Flujo rápido, agenda, seguimiento, hitos                     | ¿Lo entregas en el momento o más adelante?     |
| Lugar              | En el local, consumo en el local, envío, recogida, en casa del cliente, digital | Mesas, envíos, rutas, descargas                              | ¿Dónde recibe el cliente lo que compra?        |
| Preparación previa | Ninguna, en el momento (cocina), bajo pedido (fabricar o pedir al proveedor)    | Comandas a cocina, órdenes de fabricación, pedido automático | ¿Tienes que preparar algo antes de entregarlo? |


## Compromiso de pagar


| Dimensión         | Valores                                                                                | Qué cambia                             | Pregunta                         |
| ----------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| Momento del cobro | Antes, al momento, al final del servicio, a fin de mes, a plazos, por hitos, periódico | Cuenta abierta, crédito, cuotas, hitos | ¿Cuándo te paga el cliente?      |
| Garantía          | Ninguna, señal, fianza                                                                 | Retención y liquidación                | ¿Pides señal o fianza?           |
| Quién paga        | El cliente, un tercero, repartido                                                      | Cobro a financieras o aseguradoras     | ¿Siempre paga el propio cliente? |


## Movimiento (el dinero)


| Dimensión       | Valores                                                                                       | Qué cambia                                                | Pregunta                      |
| --------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- |
| Medios de cobro | Efectivo, tarjeta presencial, pago online, transferencia, domiciliación, financiación externa | Datáfono, pasarela, remesas, arqueo de caja, conciliación | ¿Cómo te pagan?               |
| Devoluciones    | No, reembolso, vale o abono, cambio                                                           | Flujo de devolución y sus plazos                          | ¿Aceptas devoluciones? ¿Cómo? |
| Repartos        | Ninguno, propinas, comisiones a empleados, reparto con terceros                               | Reparto de propinas, cálculo de comisiones                | ¿Hay propinas o comisiones?   |


## Evidencia (los comprobantes)


| Dimensión         | Valores                                                                   | Qué cambia                                     | Pregunta                                                        |
| ----------------- | ------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| Comprobante       | Ticket, factura simplificada, factura completa, factura electrónica       | Verifactu, series de facturación               | ¿Das ticket o factura?                                          |
| Aceptación previa | Ninguna, verbal registrada, presupuesto firmado, contrato, consentimiento | Bloqueos antes de empezar, firma               | ¿El cliente tiene que aceptar o firmar algo antes?              |
| Constancia física | Ninguna, fotos, albarán firmado, lista de revisión                        | Fotos adjuntas, checklists de entrada y salida | ¿Dejas constancia del estado de algo al recibirlo o entregarlo? |


## Transacción (cada operación)


| Dimensión  | Valores                                                      | Qué cambia                                            | Pregunta                                              |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Duración   | Minutos, horas o días, semanas o meses, indefinida           | Pantalla de cobro rápido o expediente con seguimiento | ¿Cuánto dura de principio a fin una operación normal? |
| Volumen    | Pocas al día, decenas, cientos                               | Interfaz rápida o detallada                           | ¿Cuántas operaciones haces en un día normal?          |
| Repetición | Única, recurrente con el mismo cliente, periódica programada | Historial, recordatorios, renovaciones                | ¿Los clientes repiten? ¿Cada cuánto?                  |


## Actor (el equipo)


| Dimensión   | Valores                                            | Qué cambia                                 | Pregunta                                |
| ----------- | -------------------------------------------------- | ------------------------------------------ | --------------------------------------- |
| Movilidad   | En puesto fijo, en movimiento, en casa del cliente | Interfaz móvil, trabajo sin conexión       | ¿Tu equipo trabaja en el local o fuera? |
| Dispositivo | Cada uno el suyo, terminal compartido              | Acceso rápido por PIN en un terminal común | ¿Usan un mismo aparato varias personas? |


## Problemas ya detectados que estas dimensiones resuelven

- **Duración**: la peluquería usa servicio_proyecto, pero un corte de 30 minutos no puede pasar por las mismas pantallas que una obra de tres meses. Con duración "minutos", el Generador debe mostrar un flujo rápido.
- **Preparación previa + uso del recurso**: el restaurante recibe hoy un TPV pero no comandas ni cocina. Con "preparación en el momento" y "se transforma", el sistema sabe que necesita comandas a cocina y descuento de ingredientes.

## Pasos pendientes cuando se retome

1. Revisar el catálogo con lo aprendido en la prueba de uso real.
2. Para cada dimensión, documentar qué cambia exactamente en composición, reglas, pantallas y equipamiento derivado.
3. Probar con los 10 perfiles: cada negocio debe describirse por completo, y dos negocios que necesitan software distinto no pueden acabar con los mismos valores.
4. Solo después: añadir al contrato (nueva versión) y al compositor.

