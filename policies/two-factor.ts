import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export interface Secret2FA {
  readonly secret: string;
  readonly qrCode: string;
}

export class Motor2FA {
  async generarSecreto(usuarioId: string, email: string): Promise<Secret2FA> {
    const secret = speakeasy.generateSecret({
      name: `ABS (${email})`,
      issuer: 'ABS',
      length: 32,
    });

    if (!secret.otpauth_url) {
      throw new Error('No se pudo generar URL TOTP');
    }

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32 || '',
      qrCode,
    };
  }

  verificarToken(secret: string, token: string): boolean {
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 1,
    });

    return isValid || false;
  }
}
