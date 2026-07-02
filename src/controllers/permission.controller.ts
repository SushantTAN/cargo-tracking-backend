import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { ApiError } from '../utils/ApiError';

export const getAllPermissions = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const permissions = await prisma.permission.findMany({
      orderBy: { name: 'asc' },
    });
    res.status(200).json({ success: true, data: permissions });
  } catch (error) {
    next(error);
  }
};

export const createPermission = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, description } = req.body;

    const existing = await prisma.permission.findUnique({ where: { name } });
    if (existing) {
      throw ApiError.conflict('A permission with this name already exists');
    }

    const permission = await prisma.permission.create({
      data: { name, description },
    });

    res.status(201).json({
      success: true,
      message: 'Permission created successfully',
      data: permission,
    });
  } catch (error) {
    next(error);
  }
};
