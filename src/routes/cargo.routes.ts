import { Router } from 'express';
import {
  createCargo, getAllCargo, getCargoById, trackCargo,
  updateCargo, createStatusUpdate, getStatusUpdates, getDashboardStats,
} from '../controllers/cargo.controller';
import { authenticate, requirePermission } from '../middleware/auth.middleware';
import { validateBody, validateParams } from '../middleware/validation.middleware';
import { trackingLimiter } from '../middleware/rate-limit.middleware';
import {
  createCargoSchema, updateCargoSchema, createStatusUpdateSchema,
  cargoIdParamSchema, trackingNumberParamSchema,
} from '../validators/cargo.validator';

const router = Router();

// Public tracking with rate limit
router.get(
  '/tracking/:trackingNumber',
  trackingLimiter,
  validateParams(trackingNumberParamSchema),
  trackCargo
);

// Dashboard stats - authenticated, read scope
router.get(
  '/stats/dashboard',
  authenticate,
  requirePermission('cargo:read'),
  getDashboardStats
);

router.use(authenticate);

router.post('/', requirePermission('cargo:create'), validateBody(createCargoSchema), createCargo);
router.get('/', requirePermission('cargo:read'), getAllCargo);
router.get('/:id', requirePermission('cargo:read'), validateParams(cargoIdParamSchema), getCargoById);
router.patch('/:id', requirePermission('cargo:update'), validateParams(cargoIdParamSchema), validateBody(updateCargoSchema), updateCargo);
router.post('/:id/status-updates', requirePermission('cargo:update'), validateParams(cargoIdParamSchema), validateBody(createStatusUpdateSchema), createStatusUpdate);
router.get('/:id/status-updates', requirePermission('cargo:read'), validateParams(cargoIdParamSchema), getStatusUpdates);

export default router;
