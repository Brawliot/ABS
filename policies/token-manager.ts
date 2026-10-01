import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod';

export interface TokenPayload {
  readonly sub: string;
  readonly iat: number;
  readonly exp: number;
}

export class TokenManager {
  crearAccessToken(usuarioId: string): { token: string; expiresIn: number } {
    const ahora = Math.floor(Date.now() / 1000);
    const expiresIn = 3600;

    const payload = {
      sub: usuarioId,
      iat: ahora,
      exp: ahora + expiresIn,
    };

    const token = jwt.sign(payload, JWT_SECRET);

    return { token, expiresIn };
  }

  crearRefreshToken(usuarioId: string): { token: string; expiresIn: number } {
    const ahora = Math.floor(Date.now() / 1000);
    const expiresIn = 7 * 24 * 3600;

    const payload = {
      sub: usuarioId,
      type: 'refresh',
      iat: ahora,
      exp: ahora + expiresIn,
    };

    const token = jwt.sign(payload, JWT_SECRET);

    return { token, expiresIn };
  }

  verificarToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }

  decodificar(token: string): any {
    try {
      return jwt.decode(token);
    } catch {
      return null;
    }
  }
}
