import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';

if (ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY debe tener al menos 32 caracteres (256 bits)');
}

const KEY = Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf-8');

export class CryptoUtils {
  static encryptPII(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);

    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);

    return combined.toString('base64');
  }

  static decryptPII(encrypted: string): string {
    const buffer = Buffer.from(encrypted, 'base64');

    const iv = buffer.slice(0, 16);
    const authTag = buffer.slice(16, 32);
    const encryptedData = buffer.slice(32).toString('hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
