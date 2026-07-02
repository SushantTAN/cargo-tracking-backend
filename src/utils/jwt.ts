import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { JwtPayload } from '../types';
import { redis } from '../config/redis';

export const generateAccessToken = (payload: JwtPayload): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const generateRefreshToken = (payload: JwtPayload, tokenId: string): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  };
  // Embed the token id so we can look it up in Redis / revoke it individually
  return jwt.sign({ ...payload, jti: tokenId }, env.JWT_SECRET, options);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
};

export const generateTokenId = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const REFRESH_PREFIX = 'refresh:';
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7d, aligned with JWT_REFRESH_EXPIRES_IN default

export const storeRefreshToken = async (userId: string, tokenId: string): Promise<void> => {
  await redis.set(`${REFRESH_PREFIX}${userId}:${tokenId}`, '1', REFRESH_TTL_SECONDS);
};

export const isRefreshTokenValid = async (userId: string, tokenId: string): Promise<boolean> => {
  const val = await redis.get(`${REFRESH_PREFIX}${userId}:${tokenId}`);
  return val === '1';
};

export const revokeRefreshToken = async (userId: string, tokenId: string): Promise<void> => {
  await redis.del(`${REFRESH_PREFIX}${userId}:${tokenId}`);
};
