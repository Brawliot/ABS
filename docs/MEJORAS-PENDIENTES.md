# 🚀 Mejoras Pendientes para ABS

**Última actualización:** 2026-10-03  
**Estado:** Documentación de backlog

---

## 📋 Índice
1. [Módulos de Presencia Digital](#módulos-de-presencia-digital)
2. [Navegación Centralizada](#navegación-centralizada)
3. [Control de Roles](#control-de-roles)
4. [Integración de Datos](#integración-de-datos)
5. [Conectores Externos](#conectores-externos)

---

## Módulos de Presencia Digital

### 1. **WebPage** 🌐
**Estado:** ❌ No implementado  
**Prioridad:** 🔴 ALTA

**Descripción:**
- Generación automática de sitio web dinámico
- Páginas: Homepage, Catálogo, Contacto, Términos
- Conectada a datos internos (productos, servicios)
- Responsiva, SEO optimizada

**¿Quién lo necesita?**
- Negocios con `channels.includes('web')`
- Tiendas online, servicios con presencia digital
- Restaurantes, hoteles, consultorios

**Implementación necesaria:**
```
Archivo: generator/templates/webpage-templates.ts (200 líneas)
Archivo: generator/rules/modules.ts (30 líneas nuevas)
Archivo: generator/generate.ts (100 líneas nuevas)
Archivo: presentation/types.ts (extensión de UiSpec)

Complejidad: ⭐⭐ Media
Tiempo estimado: 3-5 días
```

**Templates a crear:**
- `homepage` - Landing page con hero, destacados, CTA
- `product_page` - Detalle de producto
- `catalog` - Listado con filtros
- `contact_page` - Formulario + mapa
- `about` - Información de negocio
- `blog` - Noticias/articulos

**Datos a conectar:**
- `Inventario.productos` → Catálogo web
- `Contactos.empresarial` → Info de contacto
- `Calendario.horario` → Horarios web
- `Identidad.brandName + logo` → Header/Footer

---

### 2. **GoogleBusiness** 📍
**Estado:** ❌ No implementado  
**Prioridad:** 🟠 MEDIA-ALTA

**Descripción:**
- Configuración automática de perfil Google Business
- Sincronización de: ubicación, horarios, teléfono, categorías
- Gestión de comentarios/reviews
- Integración con Google Maps

**¿Quién lo necesita?**
- Negocios con `channels.includes('presencial')`
- Peluquerías, clínicas, talleres, restaurantes
- Tiendas físicas

**Implementación necesaria:**
```
Archivo: generator/templates/google-business-templates.ts (100 líneas)
Archivo: generator/rules/modules.ts (15 líneas nuevas)
Archivo: generator/generate.ts (50 líneas nuevas)

Complejidad: ⭐⭐ Media
Tiempo estimado: 2-3 días
```

**Datos a configurar:**
- `Organizacion.ubicacion` → Google Maps
- `Calendario.horario` → Horarios de atención
- `Contacto.telefono` → Teléfono de negocio
- `Tamaño empresa` → Categorías Google Business
- `Procesos` → Categorías de negocio

---

### 3. **GoogleAnalytics** 📊
**Estado:** ❌ No implementado  
**Prioridad:** 🟠 MEDIA

**Descripción:**
- Generación de tracking code
- Dashboard de métricas automático
- Seguimiento de conversiones
- Reportes de comportamiento de usuarios

**¿Quién lo necesita?**
- Negocios con múltiples canales `channels.length > 1`
- Cualquier negocio que venda online
- Marketing/Dueño para análisis

**Implementación necesaria:**
```
Archivo: generator/templates/analytics-templates.ts (80 líneas)
Archivo: generator/rules/modules.ts (10 líneas nuevas)
Archivo: presentation/types.ts (AnalyticsSpec interface)

Complejidad: ⭐ Baja
Tiempo estimado: 1-2 días
```

**Métricas a rastrear:**
- Visitantes únicos
- Conversiones de venta
- Tiempo en sitio
- Bounce rate
- Eventos de interacción

---

### 4. **SEO Dashboard** 🔍
**Estado:** ❌ No implementado  
**Prioridad:** 🟡 MEDIA-BAJA

**Descripción:**
- Generación de metadatos (title, description, keywords)
- Sitemap.xml automático
- Robot.txt
- Schema.org markup
- Monitoreo de posicionamiento

**¿Quién lo necesita?**
- Negocios con presencia web
- Negocios competitivos en búsqueda local

**Implementación necesaria:**
```
Archivo: generator/templates/seo-templates.ts (120 líneas)
Complejidad: ⭐ Baja
Tiempo estimado: 2-3 días
```

---

## Navegación Centralizada

### 5. **Hub de Inicio (/inicio)** 🏠
**Estado:** ❌ No implementado  
**Prioridad:** 🔴 ALTA

**Descripción:**
- Pantalla inicial centralizada después de login
- Muestra procesos principales según rol del usuario
- Control de acceso por rol/permiso
- Navegación intuitiva tipo iOS/Android

**Estructura propuesta:**
```
/inicio (Hub Dashboard)
├─ Sección Rol: "Gerente" / "Operario" / etc.
├─ Procesos Principales (grid/tarjetas)
│  ├─ 📦 Pedidos (60% de acciones)
│  ├─ 📊 Inventario (30% de acciones)
│  └─ 👥 Clientes (10% de acciones)
├─ Acciones Rápidas
│  ├─ [Nuevo Pedido]
│  ├─ [Consultar Stock]
│  └─ [Ver Facturas]
└─ Widgets de Resumen
   ├─ Ventas hoy: $2,450
   ├─ Pedidos pendientes: 8
   └─ Stock crítico: 3 productos
```

**Implementación necesaria:**
```
Archivo: presentation/hub-dashboard.ts (300 líneas)
Archivo: presentation/navigation-hub.ts (250 líneas)
Archivo: web/handlers/inicio-handler.ts (200 líneas)
Archivo: presentation/types.ts (HubDashboardSpec interface)

Complejidad: ⭐⭐⭐ Alta
Tiempo estimado: 5-7 días
```

**Features:**
- Cálculo de procesos por rol
- Ordenamiento por frecuencia de uso
- Widgets de métricas en tiempo real
- Acceso rápido a últimas acciones
- Búsqueda de procesos

---

### 6. **Control de Roles en Hub** 👤
**Estado:** ❌ No implementado  
**Prioridad:** 🔴 ALTA

**Descripción:**
- Sistema de control de acceso basado en roles
- Visualización de procesos según rol
- Restricción de acciones por permiso
- UI adaptada al rol

**Roles típicos:**
- **Gerente:** Acceso total
- **Operario:** Solo procesos de operación
- **Logística:** Solo inventario y envíos
- **Atención al cliente:** Solo consultas
- **Contabilidad:** Solo facturación/cobros

**Control de Acceso:**
```
Usuario hace login → Sistema obtiene roles
                  ↓
         Genera Hub dinámico
         ├─ Filtrar procesos por rol
         ├─ Filtrar acciones por permiso
         └─ Renderizar UI personalizada
```

**Implementación necesaria:**
```
Archivo: web/handlers/rbac-hub-handler.ts (200 líneas)
Archivo: presentation/role-filter.ts (150 líneas)
Archivo: presentation/permission-checker.ts (100 líneas)

Complejidad: ⭐⭐ Media
Tiempo estimado: 3-4 días
```

**Validaciones:**
- ¿Rol tiene acceso a este proceso?
- ¿Usuario tiene permiso para esta acción?
- ¿Datos están dentro del scope del rol?

---

## Integración de Datos

### 7. **Sincronización WebPage ↔ BD Interna** 🔄
**Estado:** ❌ No implementado  
**Prioridad:** 🟠 MEDIA

**Descripción:**
- Productos en WebPage se actualizan desde Inventario
- Precios sincronizados automáticamente
- Stock visible en web
- Cambios en políticas se reflejan en web

**Flujo de datos:**
```
Inventario (TPV interno)
    ↓
Event: producto.actualizado
    ↓
Webhook → WebPage service
    ↓
Regenerar catálogo web
    ↓
Actualizar precio/stock en HTML
```

**Implementación necesaria:**
```
Archivo: integrations/inventory-to-web-sync.ts (200 líneas)
Archivo: presentation/product-cache.ts (150 líneas)

Complejidad: ⭐⭐ Media
Tiempo estimado: 3-4 días
```

---

## Conectores Externos

### ⚠️ NO se generan (son conectores externos)

Estos módulos vienen de integraciones externas, **NO de ABS generador:**

1. **Email Marketing** 📧
   - Conectar con: Mailchimp, Brevo, SendGrid
   - No generar: ABS solo envía config

2. **Social Media Manager** 📱
   - Conectar con: Meta Business, Twitter API
   - No generar: ABS solo maneja permisos

3. **Bots (WhatsApp, Chat)** 🤖
   - Conectar con: Twilio, Dialogflow
   - No generar: ABS solo proporciona datos

4. **Publicidad Digital** 💰
   - Conectar con: Google Ads, Facebook Ads
   - No generar: ABS solo gestiona presupuesto

---

## 📊 Resumen de Implementación

| Mejora | Prioridad | Complejidad | Días | Estado |
|--------|-----------|-------------|------|--------|
| WebPage | 🔴 ALTA | ⭐⭐ | 3-5 | ❌ TODO |
| GoogleBusiness | 🟠 MEDIA-ALTA | ⭐⭐ | 2-3 | ❌ TODO |
| Analytics | 🟠 MEDIA | ⭐ | 1-2 | ❌ TODO |
| SEO Dashboard | 🟡 MEDIA-BAJA | ⭐ | 2-3 | ❌ TODO |
| Hub Inicio | 🔴 ALTA | ⭐⭐⭐ | 5-7 | ❌ TODO |
| Control Roles | 🔴 ALTA | ⭐⭐ | 3-4 | ❌ TODO |
| Sincronización | 🟠 MEDIA | ⭐⭐ | 3-4 | ❌ TODO |

**Total tiempo estimado:** 4-6 semanas (trabajando en paralelo)

---

## 🎯 Roadmap Sugerido

### **Semana 1-2: Fondos**
- [ ] Implementar Hub Inicio (`/inicio`)
- [ ] Implementar Control de Roles en Hub
- [ ] Tests de acceso por rol

### **Semana 2-3: Presencia Digital**
- [ ] WebPage generation
- [ ] GoogleBusiness config
- [ ] Analytics tracking

### **Semana 3-4: Pulido**
- [ ] SEO Dashboard
- [ ] Sincronización WebPage ↔ BD
- [ ] Tests E2E

### **Semana 4-6: Conectores**
- [ ] Email Marketing integration
- [ ] Social Media integration
- [ ] Bot integration

---

## 📝 Notas

- **WebPage y GoogleBusiness** son críticas para go-to-market
- **Hub Inicio** es crítica para UX interna
- **Control de Roles** es crítica para seguridad
- Los conectores externos (Email, Social, Bots) pueden venir después

---

**Documento generado:** 2026-10-03  
**Versión:** 1.0
