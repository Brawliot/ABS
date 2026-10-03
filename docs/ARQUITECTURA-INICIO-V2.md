# 🏗️ Arquitectura de Inicio V2 - Layout de 3 Columnas

**Versión:** 2.0  
**Estado:** 📋 Propuesta  
**Fecha:** 2026-10-03

---

## 📐 Layout General

```
┌─────────────────────────────────────────────────────────────┐
│                        HEADER                               │
├─────────────────────────────────────────────────────────────┤
│  [← Inicio]      [🔔 📊 ⚙️ 👤]      [👤 Juan García]       │
│   (link a /inicio)  (centrados)      (ficha rol/usuario)    │
├──────────────────┬──────────────────┬──────────────────────┤
│                  │                  │                      │
│   COLUMNA 1      │   COLUMNA 2      │   COLUMNA 3          │
│   (Navegación)   │   (Hoy)          │   (Ficha)            │
│                  │                  │                      │
│  [📦 Pedidos]    │  📅 Hoy          │  👤 Juan García     │
│  [📥 Compras]    │                  │  Rol: Gerente       │
│  [📊 Inventario] │  • Ventas: $...  │  Permisos:          │
│  [👥 Clientes]   │  • Pendientes: N │  • pedidos.crear    │
│  [📋 Facturas]   │  • Stock crítico │  • inventario.ver   │
│                  │                  │  • facturas.crear   │
│                  │  [Otros datos]   │                      │
│                  │                  │  [Cambiar rol ▼]    │
│                  │                  │                      │
└──────────────────┴──────────────────┴──────────────────────┘
```

---

## 🎯 Componentes

### **HEADER**

#### Izquierda: Logo/Título
```html
<a href="/inicio" class="header-title">← Inicio</a>
```
- Link directo a `/inicio`
- Vuelve al dashboard

#### Centro: Iconos (centrados)
```html
<div class="header-icons">
  <button class="icon-btn" title="Notificaciones">🔔</button>
  <button class="icon-btn" title="Reportes">📊</button>
  <button class="icon-btn" title="Configuración">⚙️</button>
  <button class="icon-btn" title="Perfil">👤</button>
</div>
```
- Notificaciones, Reportes, Configuración, Perfil
- Centrados en viewport

#### Derecha: Ficha Usuario
```html
<div class="user-card">
  <span class="user-name">Juan García</span>
  <span class="user-role">Gerente</span>
</div>
```
- Nombre y rol actual
- Clickeable para perfil

---

### **BODY - 3 COLUMNAS**

#### Columna 1: Navegación (Ancho fijo: 250px)
```
📦 Pedidos
  ├─ Ver todos
  ├─ Crear nuevo
  └─ Mis pendientes

📥 Compras
  ├─ Por recibir
  └─ Histórico

📊 Inventario
  ├─ Stock actual
  └─ Crítico

👥 Clientes
  ├─ Activos
  └─ Deudores

📋 Facturas
  ├─ Pendientes
  └─ Pagadas
```

**Características:**
- Menu vertical
- Procesos filtrados por rol
- Links activos según sección
- Responsive: se colapsa en móvil

---

#### Columna 2: Contenido Central (Flexible)
**Integración de `/hoy` aquí**

```
📅 Dashboard de Hoy
├─ Resumen del día
├─ Métricas en tiempo real
├─ Tareas pendientes
├─ Eventos próximos
└─ Alertas/Excepciones
```

**¿Qué trae de `/hoy`?**
- Ventas del día: $2,450
- Pedidos pendientes: 8
- Stock crítico: 3 productos
- Facturas por cobrar: $5,000
- Próximas entregas: 5
- Clientes deudores: 2

**¿Qué cambia?**
- `/hoy` como **página independiente**: ❌ ELIMINAR
- `/hoy` como **columna central de /inicio**: ✅ INTEGRAR

---

#### Columna 3: Ficha (Ancho fijo: 300px)
```
┌─────────────────┐
│ 👤 Juan García  │
├─────────────────┤
│ Rol: Gerente    │
│ Empresa: ACME   │
│ Desde: Ago 2024 │
├─────────────────┤
│ Permisos:       │
│ ✓ pedidos.*     │
│ ✓ inventario.*  │
│ ✓ facturas.*    │
│ ✓ reportes.ver  │
├─────────────────┤
│ [Cambiar rol ▼] │
│ [Configuración] │
│ [Cerrar sesión] │
└─────────────────┘
```

**Contenido dinámico según rol:**
- Datos del usuario
- Rol actual
- Permisos listados
- Cambio de rol (si tiene múltiples)
- Acciones (Configuración, Logout)

---

## 🔄 Flujo de Interacción

```
Usuario entra a /inicio
       ↓
┌─────────────────────────────┐
│ Columna 1: Navegación       │
│ Usuario hace click en       │
│ "📦 Pedidos"               │
└─────────────────────────────┘
       ↓
┌─────────────────────────────┐
│ Columna 2: Contenido        │
│ Se carga vista de Pedidos   │
│ (sin dejar /inicio)         │
│ Usa AJAX o iframe           │
└─────────────────────────────┘
       ↓
Columna 3 se actualiza con:
- Datos del proceso
- Acciones disponibles
- Detalles del usuario
```

---

## 📱 Responsive Design

### Desktop (≥1200px)
```
3 columnas: 250px | flexible | 300px
Layout visible completo
```

### Tablet (768px - 1199px)
```
Columna 1 (ancho reducido: 180px) | Columna 2 (flexible) | Columna 3 (oculta)
Ficha en dropdown o tab
```

### Mobile (<768px)
```
Header con botón hamburguesa
Contenido stacked:
  - Navegación (drawer/sidebar)
  - Contenido principal
  - Ficha (tab o modal)
```

---

## 🎨 CSS Structure

```css
/* Container principal */
.inicio-layout {
  display: grid;
  grid-template-columns: 250px 1fr 300px;
  gap: 1rem;
  height: 100vh;
}

/* Header */
.header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.header-title {
  font-size: 1.2rem;
  font-weight: bold;
}

.header-icons {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.user-card {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
}

/* Columnas */
.column-1-nav {
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
  padding: 1rem 0;
}

.column-2-content {
  overflow-y: auto;
  padding: 1rem;
}

.column-3-user {
  border-left: 1px solid #e0e0e0;
  overflow-y: auto;
  padding: 1rem;
}

/* Responsive */
@media (max-width: 1199px) {
  .inicio-layout {
    grid-template-columns: 180px 1fr;
  }
  .column-3-user {
    display: none;
  }
}

@media (max-width: 767px) {
  .inicio-layout {
    grid-template-columns: 1fr;
  }
  .column-1-nav {
    position: fixed;
    left: -250px;
    width: 250px;
    transition: left 0.3s;
  }
  .column-1-nav.open {
    left: 0;
  }
}
```

---

## 📄 Cambios de Archivos

### ❌ A Eliminar
- `/hoy` como página independiente (ruta y handler)
- `web/handlers/hoy-handler.ts` (o similar)
- Tests de `/hoy`

### ✅ A Modificar
- `web/inicio.ts` - Integrar contenido de `/hoy` en columna central
- `web/templates/inicio.html` - Nuevo layout de 3 columnas
- `presentation/types.ts` - Extender HubDashboardSpec con datos de hoy

### ✅ A Crear
- CSS module para layout (si no existe)
- JavaScript para interacción entre columnas
- Tests nuevos para layout

---

## 🔧 Implementación Propuesta

### Paso 1: Estructura HTML
```html
<div class="inicio-layout">
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <a href="/inicio" class="header-title">← Inicio</a>
    </div>
    <div class="header-center">
      <div class="header-icons">
        <!-- iconos -->
      </div>
    </div>
    <div class="header-right">
      <div class="user-card">
        <!-- datos usuario -->
      </div>
    </div>
  </header>

  <!-- Body -->
  <div class="inicio-body">
    <!-- Columna 1: Navegación -->
    <nav class="column-1-nav">
      <!-- Menú de navegación -->
    </nav>

    <!-- Columna 2: Contenido (Hoy integrado) -->
    <main class="column-2-content">
      <!-- Contenido de /hoy -->
    </main>

    <!-- Columna 3: Ficha Usuario -->
    <aside class="column-3-user">
      <!-- Datos del usuario y rol -->
    </aside>
  </div>
</div>
```

### Paso 2: Merge de `/hoy` en `/inicio`
- Leer datos que genera `/hoy`
- Integrar en `HubDashboardSpec`
- Renderizar en columna central

### Paso 3: Eliminar `/hoy`
- Remover ruta
- Remover handler
- Remover tests
- Remover template

### Paso 4: Responsive
- Media queries
- Drawer en móvil
- Tests responsive

---

## ✅ Checklist de Implementación

- [ ] Crear layout CSS de 3 columnas
- [ ] Modificar header (logo, iconos centrados, ficha usuario)
- [ ] Crear columna 1 (navegación)
- [ ] Integrar `/hoy` en columna 2
- [ ] Crear columna 3 (ficha usuario)
- [ ] Hacer responsive
- [ ] Eliminar `/hoy` como página
- [ ] Tests del nuevo layout
- [ ] Tests responsive
- [ ] Documentación de interacción

---

## 📊 Estimación

**Complejidad:** ⭐⭐ Media  
**Tiempo:** 2-3 días  
**Tests:** Sí (responsive + interacción)

---

**Versión documento:** 1.0  
**Listo para implementación:** ✅ SÍ
