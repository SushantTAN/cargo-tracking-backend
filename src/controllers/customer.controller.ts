import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { ApiError } from '../utils/ApiError';

export const getCustomerCargo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const cargos = await prisma.cargo.findMany({
      where: { customerId: req.user.userId },
      include: {
        statusUpdates: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: cargos });
  } catch (error) {
    next(error);
  }
};

export const getCustomerCargoById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { id } = req.params;

    const cargo = await prisma.cargo.findUnique({
      where: { id },
      include: {
        statusUpdates: {
          orderBy: { createdAt: 'desc' },
          include: { updatedBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!cargo) throw ApiError.notFound('Cargo not found');

    if (cargo.customerId !== req.user.userId) {
      throw ApiError.forbidden('You can only view your own cargo');
    }

    res.status(200).json({ success: true, data: cargo });
  } catch (error) {
    next(error);
  }
};

export const getCustomerProfile = async (
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
        createdAt: true,
        _count: {
          select: { customerCargo: true },
        },
      },
    });

    if (!user) throw ApiError.notFound('User not found');

    res.status(200).json({
      success: true,
      data: {
        ...user,
        totalCargo: user._count.customerCargo,
      },
    });
  } catch (error) {
    next(error);
  }
};
