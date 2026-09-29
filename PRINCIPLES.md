# PRINCIPLES — Núcleo operativo ABS

Documento de principios no negociables. Toda implementación del metaobjeto,
la gramática y los elementos debe respetarlos. Cambios aquí exigen **versión mayor**
de la especificación (ver `spec/VERSIONING.md`).

---

## Los 7 principios

### 1. La capa 0 es la transacción
Todo negocio se reduce, en su núcleo, a un **intercambio de valor entre partes**.
La transacción es la unidad operativa primaria; el resto de elementos existen para
hacer posible, registrar o derivar ese intercambio.

### 2. El núcleo tiene exactamente 10 elementos
Parte, Actor, Oferta, Recurso, Transacción, Estado, Compromiso, Movimiento de valor,
Evidencia y Evento. No se añaden elementos sin versión mayor de la gramática.

### 3. Subtipos finitos; contenido infinito
Cada elemento tiene un **conjunto cerrado de subtipos**. Solo el contenido concreto
(instancias, valores de campos, perfiles) es ilimitado.

### 4. Determinismo ~90 %; la IA solo traduce
Las reglas deciden. La IA convierte lenguaje natural en datos estructurados que
cumplen la gramática; no altera estado ni inventa transiciones.

### 5. El Evento es la única fuente de verdad
Los eventos son **inmutables**. Todo estado se **deriva** reproduciendo la secuencia
de eventos. Nunca se asigna estado a mano.

### 6. Estructura versionada; conocimiento autónomo
Las **definiciones** (estructura, gramática, subtipos) solo cambian por versión
aprobada por un humano. El **conocimiento** (perfiles) se actualiza de forma
incremental sin cambiar la gramática.

### 7. Solo la Transacción avanza su ciclo por sí misma
Los ciclos de vida de los demás elementos se **derivan** de los eventos de las
transacciones. Una “reapertura” de un terminal no muta el pasado: crea una
transacción nueva vinculada.

### 8. Granularidad: un acuerdo, compromisos de entrega propios
**Una transacción = un acuerdo** fijado por una aceptación vinculante a una
versión de oferta. **Cada entrega es un compromiso propio** (no un “truco” de
texto libre): las entregas parciales se modelan cumpliendo compromisos de
entrega de forma incremental dentro del mismo acuerdo, o como transacciones
vinculadas si fallan el test de independencia (ver `spec/GRANULARITY.md`).
Nunca se usa el evento `modificacion` para registrar un tramo de entrega.

### 9. Privacidad multiempresa: aislar, agregar, umbral
Varias empresas usan el mismo núcleo. **Todo dato operativo** (eventos,
especificaciones, perfiles propios, Partes) **pertenece a una empresa** y no
puede consultarse desde otra. La única excepción es la **capa agregada** de
perfiles compartidos del mismo arquetipo.

| Se comparte (capa agregada) | Nunca se comparte | Por qué |
|-----------------------------|-------------------|---------|
| Estadísticas suficientes del perfil (α/β, Dirichlet, Gamma) y sus medias | Eventos individuales (id, subject, actor, evidencia, texto libre, timestamps de hecho) | El Evento es fuente de verdad operativa de cada empresa (P5); filtrarlo rompería el aislamiento |
| Conteos agregados del arquetipo (≥ umbral) | Identificadores de empresa en el publicado; listados de contribuyentes | Impide atribuir el agregado a una empresa concreta |
| Priors heredables para empresas nuevas del mismo arquetipo | Datos de **Partes**, Ofertas concretas, Recursos nominativos | Son identidad de negocio / PII operativa; no son conocimiento estadístico |

Un perfil agregado **solo se publica si lo componen al menos 5 empresas**.
Por debajo del umbral no existe publicación: no hay lectura cruzada disfrazada.

---

## Glosario de los 10 elementos

| Elemento | Definición |
|----------|------------|
| **Parte** | Entidad que participa en un intercambio de valor (persona, organización, sistema externo). |
| **Actor** | Agente que ejecuta una acción dentro de una transición: humano, sistema o IA. |
| **Oferta** | Propuesta de valor intercambiable (bien, servicio, derecho, obligación) con condiciones. |
| **Recurso** | Capacidad o activo que puede comprometerse, consumirse o transferirse. |
| **Transacción** | Intercambio de valor entre partes; único elemento con ciclo de vida que avanza por sí mismo. |
| **Estado** | Lo ya probado como cierto; determina qué puede pasar después. Se deriva de compromisos cumplidos (con evidencia) y pendientes. |
| **Compromiso** | Obligación pendiente o cumplida entre partes, ligada a una transacción y a evidencia. |
| **Movimiento de valor** | Transferencia o registro de valor (entrada/salida) asociada a la transacción. |
| **Evidencia** | Prueba exigida por una transición: aceptación, sistema o física. Sin ella no hay avance. |
| **Evento** | Hecho inmutable que registra qué pasó, cuándo, qué actor y qué evidencia. Tipos cerrados: transición, excepción, modificación, vencimiento, alta, datos. `alta` y `datos` registran los datos de negocio de una transacción (parte, líneas, fecha, referencia, notas) y no cambian su estado (gramática 2.0.0). |

---

## Metaobjeto (plantilla de los 10)

Todo elemento instancia la misma plantilla de **5 capas**:

1. **Identidad** — qué lo hace único.
2. **Definición** — subtipo (conjunto cerrado) y campos tipados.
3. **Ciclo de vida** — máquina de estados según la gramática del núcleo.
4. **Invariantes** — condiciones que deben cumplirse según el estado.
5. **Perfil** — interfaz para aprendizaje incremental (conocimiento, no estructura).
