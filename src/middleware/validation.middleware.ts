import { Request, Response, NextFunction } from 'express';
import { ObjectSchema } from 'yup';
import { ApiError } from '../utils/ApiError';

export const validateBody = (schema: ObjectSchema<any>) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      req.body = validated;
      next();
    } catch (err: any) {
      if (err.inner && Array.isArray(err.inner)) {
        const errors: Record<string, string[]> = {};
        for (const e of err.inner) {
          const path = e.path || '_';
          if (!errors[path]) errors[path] = [];
          errors[path].push(e.message);
        }
        next(ApiError.badRequest('Validation failed', errors));
        return;
      }
      next(ApiError.badRequest(err.message || 'Validation failed'));
    }
  };
};

export const validateParams = (schema: ObjectSchema<any>) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = await schema.validate(req.params, {
        abortEarly: false,
      });
      req.params = validated;
      next();
    } catch (err: any) {
      if (err.inner && Array.isArray(err.inner)) {
        const errors: Record<string, string[]> = {};
        for (const e of err.inner) {
          const path = e.path || '_';
          if (!errors[path]) errors[path] = [];
          errors[path].push(e.message);
        }
        next(ApiError.badRequest('Validation failed', errors));
        return;
      }
      next(ApiError.badRequest(err.message || 'Validation failed'));
    }
  };
};
