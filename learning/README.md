# Learning

Aprendices bayesianos incrementales **por tipo** de objeto (no por instancia).

- Salidas / tasas: Dirichlet (Beta si binario); solo estadísticas suficientes.
- Permanencia: Gamma (shape/rate); solo estadísticas suficientes.
- Escriben solo en el perfil; nunca se consultan entre sí.
- `DriftDetector`: alerta ante cambio sostenido del perfil (no picos aislados).
- Privacidad multiempresa (`privacy.ts`): aislamiento de eventos/perfiles/specs;
  capa agregada solo con suficientes; publicación con umbral ≥ 5 empresas.
