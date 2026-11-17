import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';

export interface AccessClaims {
  sub: string;
  sid: string;
  role: Role;
}

@Injectable()
export class TokenService {
  readonly accessTtlSec = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900);
  readonly refreshTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

  private get secret() {
    const s = process.env.JWT_ACCESS_SECRET;
    if (!s || s.length < 32) throw new Error('JWT_ACCESS_SECRET must be set (>= 32 chars)');
    return s;
  }

  signAccess(claims: AccessClaims) {
    return jwt.sign(claims, this.secret, { expiresIn: this.accessTtlSec, algorithm: 'HS256', issuer: 'pau-attendance' });
  }

  /** Returns claims, 'expired', or null when invalid. */
  verifyAccess(token: string): AccessClaims | 'expired' | null {
    try {
      return jwt.verify(token, this.secret, { algorithms: ['HS256'], issuer: 'pau-attendance' }) as unknown as AccessClaims;
    } catch (e: any) {
      if (e?.name === 'TokenExpiredError') return 'expired';
      return null;
    }
  }
}
