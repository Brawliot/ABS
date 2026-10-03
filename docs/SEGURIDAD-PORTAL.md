# Seguridad del Portal del Cliente

## Protecciones implementadas

**Token**: Se emiten tokens base64url de 256 bits con caducidad de 7 días.

**Base de datos**: Solo se almacena el SHA256 del token. El token nunca se devuelve tras emitir, solo en el enlace inicial.

**Autenticación**: Cada solicitud resuelve el token contra su hash. Token inválido, caducado o revocado devuelve 404.

**Autorización**: CADA ruta (`/portal/<t>`, `/expediente/<id>`, `/factura/<id>`, `/accion`) comprueba que el recurso (expediente o factura) pertenece al cliente del token.

**Datos del formulario ignorados**: Los POST se ejecutan con `roleId: "cliente"` y `parteId` del token, nunca del formulario.

**Revocación**: `revocar()` invalida todos los tokens de esa parte al instante. Emitir nuevos no invalida los anteriores.

**Headers HTTP**: `Cache-Control: no-store` y `Referrer-Policy: no-referrer` en todas las respuestas.

**Separación de tenants**: Un token solo funciona en su tenant. Tokens cruzados devuelven 404.

**Sin pistas**: Token inventado, caducado o revocado devuelven idéntico 404.
