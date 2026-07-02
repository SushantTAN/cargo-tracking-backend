import { Router } from 'express';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  updateUserPermissions,
  updateUserStatus,
} from '../controllers/user.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import {
  validateBody,
  validateParams,
} from '../middleware/validation.middleware';
import {
  createUserSchema,
  updateUserSchema,
  updateUserPermissionsSchema,
  updateUserStatusSchema,
  idParamSchema,
} from '../validators/user.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  requirePermission('users:create'),
  validateBody(createUserSchema),
  createUser
);
router.get('/', requirePermission('users:read'), getAllUsers);
router.get(
  '/:id',
  requirePermission('users:read'),
  validateParams(idParamSchema),
  getUserById
);
router.patch(
  '/:id',
  requirePermission('users:update'),
  validateParams(idParamSchema),
  validateBody(updateUserSchema),
  updateUser
);
router.patch(
  '/:id/permissions',
  requirePermission('permissions:manage'),
  validateParams(idParamSchema),
  validateBody(updateUserPermissionsSchema),
  updateUserPermissions
);
router.patch(
  '/:id/status',
  requirePermission('users:update'),
  validateParams(idParamSchema),
  validateBody(updateUserStatusSchema),
  updateUserStatus
);

export default router;
