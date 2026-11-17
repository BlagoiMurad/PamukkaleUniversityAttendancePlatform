import { Injectable } from '@nestjs/common';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { randomInt } from 'crypto';

// OWASP-recommended Argon2id parameters
const OPTIONS = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordService {
  hash(plain: string) {
    return hash(plain, OPTIONS);
  }

  async verify(hashValue: string | null | undefined, plain: string) {
    if (!hashValue) {
      // Equalise timing for unknown accounts
      await hash(plain, OPTIONS);
      return false;
    }
    try {
      return await verify(hashValue, plain);
    } catch {
      return false;
    }
  }

  /** Returns a reason code when the password is too weak, or null when acceptable. */
  check(password: string, context: { email?: string; name?: string } = {}): string | null {
    if (password.length < 10) return 'Password must be at least 10 characters';
    if (password.length > 200) return 'Password is too long';
    const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
    if (classes < 3) return 'Use at least three of: lowercase, uppercase, digits, symbols';
    const lower = password.toLowerCase();
    const local = context.email?.split('@')[0]?.toLowerCase();
    if (local && local.length >= 4 && lower.includes(local)) return 'Password must not contain your e-mail';
    return null;
  }

  /** Cryptographically random temporary password (spec 4.1). */
  generateTemporary(length = 14) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const symbols = '!@#$%*?';
    let out = '';
    for (let i = 0; i < length - 2; i++) out += alphabet[randomInt(alphabet.length)];
    out += symbols[randomInt(symbols.length)];
    out += String(randomInt(10));
    return out;
  }
}
