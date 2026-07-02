import { Router } from 'express';
import {
  getAllPermissions,
  createPermission,
} from '../controllers/permission.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { createPermissionSchema } from '../validators/permission.validator';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('permissions:manage'), getAllPermissions);
router.post(
  '/',
  requirePermission('permissions:manage'),
  validateBody(createPermissionSchema),
  createPermission
);

export default router;
