import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoUtils } from '../adapters/crypto-utils.js';
import { Motor2FA } from '../policies/two-factor.js';
import { Sqlite2FAStore } from '../adapters/sqlite-2fa-store.js';
import { SecretsVault } from '../policies/secrets-vault.js';
import { AuditLogger } from '../policies/audit-logger.js';
import { TokenManager } from '../policies/token-manager.js';
const speakeasy = require('speakeasy') as any;

describe('Seguridad Fase 2', () => {
  let motor2fa: Motor2FA;
  let store2fa: Sqlite2FAStore;
  let vault: SecretsVault;
  let auditLogger: AuditLogger;
  let tokenManager: TokenManager;

  beforeEach(() => {
    motor2fa = new Motor2FA();
    store2fa = new Sqlite2FAStore(':memory:');
    vault = new SecretsVault(':memory:');
    auditLogger = new AuditLogger(':memory:');
    tokenManager = new TokenManager();
  });

  it('encripta y desencripta PII', () => {
    const original = '12345678-9';
    const encrypted = CryptoUtils.encryptPII(original);

    expect(encrypted).not.toBe(original);
    expect(encrypted).toBeTruthy();

    const decrypted = CryptoUtils.decryptPII(encrypted);
    expect(decrypted).toBe(original);
  });

  it('encripta emails correctamente', () => {
    const email = 'usuario@example.com';
    const encrypted = CryptoUtils.encryptPII(email);
    const decrypted = CryptoUtils.decryptPII(encrypted);

    expect(decrypted).toBe(email);
  });

  it('genera y verifica 2FA token', async () => {
    const { secret } = await motor2fa.generarSecreto('user-1', 'user@example.com');

    const token = speakeasy.totp({
      secret: secret || '',
      encoding: 'base32',
    });

    const isValid = motor2fa.verificarToken(secret, token);
    expect(isValid).toBe(true);
  });

  it('rechaza token 2FA inválido', async () => {
    const { secret } = await motor2fa.generarSecreto('user-1', 'user@example.com');
    const invalidToken = '000000';

    const isValid = motor2fa.verificarToken(secret || '', invalidToken);
    expect(isValid).toBe(false);
  });

  it('genera QR code para 2FA', async () => {
    const { qrCode } = await motor2fa.generarSecreto('user-1', 'user@example.com');

    expect(qrCode).toBeTruthy();
    expect(qrCode).toContain('data:image/png');
  });

  it('habilita y verifica 2FA para usuario', async () => {
    const { secret } = await motor2fa.generarSecreto('user-1', 'user@example.com');

    store2fa.habilitarPara('user-1', secret);
    const habilitado = store2fa.estaHabilitado('user-1');

    expect(habilitado).toBe(true);
  });

  it('obtiene secreto encriptado de 2FA', async () => {
    const { secret } = await motor2fa.generarSecreto('user-1', 'user@example.com');

    store2fa.habilitarPara('user-1', secret);
    const secretRecuperado = store2fa.obtenerSecreto('user-1');

    expect(secretRecuperado).toBe(secret || '');
  });

  it('guarda y obtiene secreto encriptado en vault', () => {
    vault.guardarSecretiva('api_key_stripe', 'sk_live_xxx');
    const retrieved = vault.obtenerSecreto('api_key_stripe');

    expect(retrieved).toBe('sk_live_xxx');
  });

  it('lista secretos sin revelar valores', () => {
    vault.guardarSecretiva('api_key_stripe', 'sk_live_xxx', 'Clave Stripe');
    vault.guardarSecretiva('api_key_github', 'ghp_xxx', 'Clave GitHub');

    const secretos = vault.listarSecretos();

    expect(secretos.length).toBe(2);
    expect(secretos[0]!.clave).toBeDefined();
    expect(secretos[0]!.descripcion).toBeDefined();
  });

  it('rota secretos en vault', () => {
    vault.guardarSecretiva('old_key', 'valor_antiguo');
    vault.rotarSecretiva('old_key', 'valor_nuevo');

    const actual = vault.obtenerSecreto('old_key');
    expect(actual).toBe('valor_nuevo');
  });

  it('registra evento en audit log', () => {
    auditLogger.registrar({
      usuarioId: 'user-1',
      accion: 'login',
      recurso: 'auth',
      exito: true,
    });

    const hace1Hora = new Date();
    hace1Hora.setHours(hace1Hora.getHours() - 1);
    const ahoraMs = new Date();

    const eventos = auditLogger.obtenerEventos('user-1', hace1Hora, ahoraMs);

    expect(eventos.length).toBe(1);
    expect(eventos[0]!.accion).toBe('login');
    expect(eventos[0]!.exito).toBe(true);
  });

  it('registra cambios en audit log', () => {
    auditLogger.registrar({
      usuarioId: 'user-1',
      accion: 'cambiar_password',
      recurso: 'usuario_1',
      cambios: { from: 'viejo_hash', to: 'nuevo_hash' },
      exito: true,
    });

    const hace1Hora = new Date();
    hace1Hora.setHours(hace1Hora.getHours() - 1);
    const ahoraMs = new Date();

    const eventos = auditLogger.obtenerEventos('user-1', hace1Hora, ahoraMs);

    expect(eventos.length).toBe(1);
    expect(eventos[0]!.cambios).toBeDefined();
  });

  it('genera JWT access token', () => {
    const { token, expiresIn } = tokenManager.crearAccessToken('user-1');

    expect(token).toBeTruthy();
    expect(expiresIn).toBe(3600);

    const payload = tokenManager.verificarToken(token);
    expect(payload).toBeDefined();
    expect(payload?.sub).toBe('user-1');
  });

  it('genera JWT refresh token', () => {
    const { token, expiresIn } = tokenManager.crearRefreshToken('user-1');

    expect(token).toBeTruthy();
    expect(expiresIn).toBe(7 * 24 * 3600);

    const payload = tokenManager.verificarToken(token);
    expect(payload).toBeDefined();
    expect(payload?.sub).toBe('user-1');
  });

  it('rechaza token JWT expirado', () => {
    const tokenExpired = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAxfQ.INVALID';

    const payload = tokenManager.verificarToken(tokenExpired);
    expect(payload).toBeNull();
  });

  it('encripta contraseñas con bcrypt', async () => {
    const password = 'MySecurePassword123!';
    const hash = await CryptoUtils.hashPassword(password);

    expect(hash).toBeTruthy();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true);

    const isValid = await CryptoUtils.verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('rechaza contraseña incorrecta', async () => {
    const password = 'CorrectPassword';
    const wrongPassword = 'WrongPassword';
    const hash = await CryptoUtils.hashPassword(password);

    const isValid = await CryptoUtils.verifyPassword(wrongPassword, hash);
    expect(isValid).toBe(false);
  });
});
