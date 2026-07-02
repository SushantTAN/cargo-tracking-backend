import { Router } from 'express';
import {
  getCustomerCargo,
  getCustomerCargoById,
  getCustomerProfile,
} from '../controllers/customer.controller';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { validateParams } from '../middleware/validation.middleware';
import { cargoIdParamSchema } from '../validators/cargo.validator';

const router = Router();

router.use(authenticate);
router.use(requireRole('CUSTOMER'));

router.get('/profile', getCustomerProfile);
router.get('/cargo', getCustomerCargo);
router.get(
  '/cargo/:id',
  validateParams(cargoIdParamSchema),
  getCustomerCargoById
);

export default router;
