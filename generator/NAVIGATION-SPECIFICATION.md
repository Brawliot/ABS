# Navegación Generada: Sidebar Híbrido

## Resumen

La **navegación se genera dinámicamente** basándose en el perfil del negocio. Tiene estructura híbrida con dos secciones colapsables:

1. **Operación**: Flujos de dinero (dinero, ventas, stock, facturas, cuotas, crédito)
2. **Empresa**: Configuración organizacional (documentos, marketing, reputación, procesos, equipo)

Cada negocio ve **solo lo que necesita** según módulos activos.

---

## Arquitectura

### Capa 0: Deducción (generator/navigation-generator.ts)

Define **qué áreas y pantallas** debería mostrar cada negocio.

#### Área: Operación (siempre presente)

Items básicos:
- `Dashboard` (📊): Visibility consolidada
- `Dinero` (💰): Cobros, pagos, flujo
- `Ventas` (🛒): Catálogo y pedidos *(si módulo "catalogo")*
- `Inventario` (📦): Stock y rotación *(si módulo "stock")*
- `Facturas` (📋): Documentos fiscales *(si módulo "facturas")*
- `Crédito` (📊): Ventas a plazo *(si módulo "credito")*
- `Cuotas` (🔄): Ingresos recurrentes *(si módulo "cuotas")*
- `Fianzas` (🏦): Dinero retenido *(si módulo "fianzas")*

**Expandido por defecto**: Sí (es lo que se usa todos los días)

---

#### Área: Documentos (si fiscal o formal)

Items:
- `Documentos Legales` (📑): Contratos, permisos
- `Cumplimiento` (✅): Obligaciones fiscales/legales

**Expandido por defecto**: No

---

#### Área: Marketing (si tiene canales públicos)

Items:
- `Landing Page` (🌐): Página principal
- `SEO` (📈): Posicionamiento
- `Analytics` (📊): Tráfico y conversión

**Expandido por defecto**: No

---

#### Área: Reputación (si tiene portal o muchos clientes)

Items:
- `Reseñas` (⭐): Opiniones de clientes *(si portal)*
- `NPS & Feedback` (💬): Satisfacción *(si clientes)*

**Expandido por defecto**: No

---

#### Área: Procesos (si hay múltiples workflows)

Items:
- `Flujos de Trabajo` (🔄): Definición y ejecución
- `SLA & Alertas` (🚨): Cumplimiento de plazos
- `Log de Cambios` (📝): Trazabilidad

**Expandido por defecto**: No

---

#### Área: Empresa (siempre presente)

Items:
- `Equipo` (👥): Gestión de usuarios
- `Roles & Permisos` (🔐): Control de acceso
- `Configuración` (⚙️): Preferencias

**Expandido por defecto**: No

---

### Capa 1: Generación (presenter/navigation-integrador.ts)

Orquesta:
1. **Generar especificación** desde el perfil
2. **Renderizar** en formato UI
3. **Filtrar por rol** (opcional)

```typescript
const spec = generateNavigationSpec(input);      // ← Qué mostrar
const nav = renderizarNavigation(spec);          // ← Cómo presentarlo
const navRol = aplicarPermisosRol(nav, "gerente"); // ← Según usuario
```

---

### Capa 2: Presentación (UI/Sidebar)

Consume `NavigationPresentation`:
- Renderiza áreas colapsables
- Expande "Operación" por defecto
- Colapsa "Empresa" por defecto
- Aplica estilos según estado activo

---

## Ejemplos

### Tienda de Ropa

**Módulos activos**: dinero, stock, facturas, catalogo

**Sidebar**:
```
🏠 Inicio

⚙️ Operación ▼ (expandido)
  📊 Dashboard
  💰 Dinero
  🛒 Ventas
  📦 Inventario
  📋 Facturas

📄 Documentos ▶ (colapsado)
  📑 Documentos Legales
  ✅ Cumplimiento

👥 Empresa ▶ (colapsado)
  👥 Equipo
  🔐 Roles & Permisos
  ⚙️ Configuración
```

---

### SaaS (Suscripciones)

**Módulos activos**: dinero, cuotas, portal, catalogo, marketing (web)

**Sidebar**:
```
🏠 Inicio

⚙️ Operación ▼ (expandido)
  📊 Dashboard
  💰 Dinero
  🛒 Ventas
  🔄 Cuotas
  
📢 Marketing ▶ (colapsado)
  🌐 Landing Page
  📈 SEO
  📊 Analytics

⭐ Reputación ▶ (colapsado)
  ⭐ Reseñas
  💬 NPS & Feedback

👥 Empresa ▶ (colapsado)
  👥 Equipo
  🔐 Roles & Permisos
  ⚙️ Configuración
```

---

### Asesoría Fiscal

**Módulos activos**: dinero, facturas, documentos (sin stock)

**Sidebar**:
```
🏠 Inicio

⚙️ Operación ▼ (expandido)
  📊 Dashboard
  💰 Dinero
  📋 Facturas

📄 Documentos ▶ (colapsado)
  📑 Documentos Legales
  ✅ Cumplimiento

⚙️ Procesos ▶ (colapsado)
  🔄 Flujos de Trabajo
  🚨 SLA & Alertas
  📝 Log de Cambios

👥 Empresa ▶ (colapsado)
  👥 Equipo
  🔐 Roles & Permisos
  ⚙️ Configuración
```

---

## Filtrado por Rol

La navegación se adapta automáticamente según el rol del usuario.

**Predefiniciones**:
- **Admin**: Acceso a todo
- **Gerente**: Dashboard, dinero, ventas, documentos compliance, analytics, SLA
- **Vendedor**: Ventas, dinero, clientes
- **Almacenero**: Inventario, dinero (básico)
- **Marketing**: Marketing, reputación, analytics
- **Cliente**: Solo reseñas (acceso limitado)

```typescript
const nav = generarNavigacionPara(input);
const navRol = aplicarPermisosRol(nav, "vendedor");
// → Muestra solo: Inicio, Operación (Dinero, Ventas), Empresa (limitado)
```

---

## Integración en Presenter

El presenter debe:

1. **Recibir GeneratorInput + UserRole**
2. **Llamar a generarNavigacionPara()** para deducir nav
3. **Aplicar permisos por rol** con aplicarPermisosRol()
4. **Pasar a la UI** como `NavigationPresentation`

```typescript
// En el presenter, al renderizar un caso:
const nav = generarNavigacionPara(input, userRole);
const navFiltrada = aplicarPermisosRol(nav, userRole);

// → navFiltrada.areas → Renderizar en sidebar
```

---

## Próximos Pasos

- [ ] Tests de generación de áreas
- [ ] Tests de filtrado por rol
- [ ] Componente Sidebar que consume NavigationPresentation
- [ ] Sincronización de permisos con políticas
- [ ] Personalización de orden de áreas por usuario

