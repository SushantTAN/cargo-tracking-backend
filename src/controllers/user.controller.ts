import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { ApiError } from '../utils/ApiError';

export const createUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, email, password, contact, role, isActive, permissionIds } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw ApiError.conflict('A user with this email already exists');
    }

    // Contact is mandatory for STAFF and CUSTOMER (defense-in-depth on top of Yup).
    if ((role === 'STAFF' || role === 'CUSTOMER') && (!contact || String(contact).trim() === '')) {
      throw ApiError.badRequest('Contact is required for staff and customer users');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        contact: contact ? String(contact).trim() : null,
        role,
        isActive: isActive ?? true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (permissionIds && Array.isArray(permissionIds) && permissionIds.length > 0) {
      const permissions = await prisma.permission.findMany({
        where: { id: { in: permissionIds } },
      });
      if (permissions.length !== permissionIds.length) {
        throw ApiError.badRequest('One or more permission IDs are invalid');
      }
      await prisma.userPermission.createMany({
        data: permissionIds.map((permissionId: string) => ({
          userId: user.id,
          permissionId,
        })),
      });
    }

    const userWithPermissions = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        userPermissions: { include: { permission: true } },
      },
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        ...userWithPermissions,
        permissions: userWithPermissions?.userPermissions.map(
          (up) => up.permission.name
        ),
      },
    });
  } catch (error) {
    next(error);
  }
};

const VALID_ROLES = ['ADMIN', 'STAFF', 'CUSTOMER'] as const;

export const getAllUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const where: any = {};

    // Filter by role list (comma-separated)
    if (req.query.role) {
      const roleList = String(req.query.role).split(',').filter(Boolean);
      const valid = roleList.filter((r) => VALID_ROLES.includes(r as any));
      if (valid.length > 0) where.role = { in: valid };
    }

    // Filter by active status
    if (req.query.isActive === 'true') where.isActive = true;
    else if (req.query.isActive === 'false') where.isActive = false;

    // Free-text search across name and email
    if (req.query.search && typeof req.query.search === 'string') {
      const q = req.query.search.trim();
      if (q.length > 0) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ];
      }
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        contact: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        userPermissions: { include: { permission: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      data: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        contact: u.contact,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        permissions: u.userPermissions.map((up) => up.permission.name),
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        contact: true,
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

export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('User not found');

    if (data.email && data.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (emailTaken) throw ApiError.conflict('Email is already in use');
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { permissionIds } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('User not found');

    if (permissionIds.length > 0) {
      const permissions = await prisma.permission.findMany({
        where: { id: { in: permissionIds } },
      });
      if (permissions.length !== permissionIds.length) {
        throw ApiError.badRequest('One or more permission IDs are invalid');
      }
    }

    await prisma.$transaction([
      prisma.userPermission.deleteMany({ where: { userId: id } }),
      prisma.userPermission.createMany({
        data: permissionIds.map((permissionId: string) => ({
          userId: id,
          permissionId,
        })),
      }),
    ]);

    const userWithPermissions = await prisma.user.findUnique({
      where: { id },
      include: { userPermissions: { include: { permission: true } } },
    });

    res.status(200).json({
      success: true,
      message: 'User permissions updated successfully',
      data: {
        ...userWithPermissions,
        permissions: userWithPermissions?.userPermissions.map(
          (up) => up.permission.name
        ),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('User not found');

    if (req.user && req.user.userId === id && !isActive) {
      throw ApiError.badRequest('You cannot deactivate your own account');
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    res.status(200).json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};
