import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import {
  generateAccessToken,
  generateRefreshToken,
  generateTokenId,
  verifyToken,
  storeRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
} from '../utils/jwt';
import { JwtPayload } from '../types';

export const registerCustomer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw ApiError.conflict('A user with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'CUSTOMER',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshTokenId = generateTokenId();
    const refreshToken = generateRefreshToken(payload, refreshTokenId);
    await storeRefreshToken(user.id, refreshTokenId);

    res.status(201).json({
      success: true,
      message: 'Customer registered successfully',
      data: { user, accessToken, refreshToken },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        userPermissions: { include: { permission: true } },
      },
    });

    if (!user) throw ApiError.unauthorized('Invalid email or password');
    if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw ApiError.unauthorized('Invalid email or password');

    const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshTokenId = generateTokenId();
    const refreshToken = generateRefreshToken(payload, refreshTokenId);
    await storeRefreshToken(user.id, refreshTokenId);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          permissions: user.userPermissions.map((up) => up.permission.name),
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw ApiError.badRequest('Refresh token is required');

    let decoded: JwtPayload;
    try {
      decoded = verifyToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    if (!decoded.jti) throw ApiError.unauthorized('Invalid refresh token');

    const valid = await isRefreshTokenValid(decoded.userId, decoded.jti);
    if (!valid) throw ApiError.unauthorized('Refresh token has been revoked');

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { userPermissions: { include: { permission: true } } },
    });
    if (!user) throw ApiError.unauthorized('User no longer exists');
    if (!user.isActive) throw ApiError.forbidden('User account is deactivated');

    // Rotate: revoke the old refresh token and issue a new pair
    await revokeRefreshToken(decoded.userId, decoded.jti);

    const newPayload: JwtPayload = { userId: user.id, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(newPayload);
    const newRefreshTokenId = generateTokenId();
    const newRefreshToken = generateRefreshToken(newPayload, newRefreshTokenId);
    await storeRefreshToken(user.id, newRefreshTokenId);

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { refreshToken } = req.body;
    if (refreshToken) {
      try {
        const decoded = verifyToken(refreshToken);
        if (decoded.jti) await revokeRefreshToken(decoded.userId, decoded.jti);
      } catch {
        // ignore invalid refresh token on logout
      }
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        userPermissions: { include: { permission: true } },
      },
    });

    if (!user) throw ApiError.notFound('User not found');

    res.status(200).json({
      success: true,
      data: {
        ...user,
        permissions: user.userPermissions.map((up) => up.permission.name),
      },
    });
  } catch (error) {
    next(error);
  }
};
