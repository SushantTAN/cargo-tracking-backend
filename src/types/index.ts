import { RoleName } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: RoleName;
  jti?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      userPermissions?: string[];
    }
  }
}

export {};
