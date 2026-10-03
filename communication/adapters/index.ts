/**
 * Exporta todos los adaptadores de canales.
 */

export { AdaptadorCanal, type ResultadoEnvio } from "./base-adapter.js";
export { AdaptadorEmail } from "./email-adapter.js";
export { AdaptadorSMS } from "./sms-adapter.js";
export { AdaptadorWhatsApp } from "./whatsapp-adapter.js";
export { AdaptadorPush } from "./push-adapter.js";
export { AdaptadorSlack } from "./slack-adapter.js";
export { AdaptadorWebhook } from "./webhook-adapter.js";
export { AdaptadorTelnyx } from "./telnyx-adapter.js";
