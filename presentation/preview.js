/**
 * Vista previa estática: carga un UiSpec embebido (sustituir por salida del Generador).
 * Abrir este archivo en el navegador tras pegar el JSON generado.
 */
const PLACEHOLDER = {
  note: "Sustituye window.__UI_SPEC__ con el JSON de generateUiSpec(...).",
};

document.getElementById("status").textContent =
  "Usa renderUiSpecHtml(spec) desde Node/tests o pega aquí un UiSpec.";
void PLACEHOLDER;
