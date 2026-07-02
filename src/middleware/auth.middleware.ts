import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import prisma from '../config/prisma';

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('No token provided');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw ApiError.unauthorized('No token provided');
    }

    const decoded = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        userPermissions: {
          include: { permission: true },
        },
      },
    });

    if (!user) {
      throw ApiError.unauthorized('User no longer exists');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('User account is deactivated');
    }

    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
    req.userPermissions = user.userPermissions.map((up) => up.permission.name);

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.unauthorized('Invalid or expired token'));
  }
};

export const requireRole = (...roles: Array<'ADMIN' | 'STAFF' | 'CUSTOMER'>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden('You do not have access to this resource'));
      return;
    }
    next();
  };
};

export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (req.user.role === 'ADMIN') {
      next();
      return;
    }

    const userPermissions = req.userPermissions || [];
    const hasPermission = requiredPermissions.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      next(
        ApiError.forbidden(
          `Missing required permission(s): ${requiredPermissions.join(', ')}`
        )
      );
      return;
    }
    next();
  };
};
