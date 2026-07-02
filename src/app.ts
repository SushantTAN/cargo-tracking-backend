import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { env } from './config/env';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import permissionRoutes from './routes/permission.routes';
import cargoRoutes from './routes/cargo.routes';
import customerRoutes from './routes/customer.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { generalLimiter, authLimiter } from './middleware/rate-limit.middleware';

const app: Application = express();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Global rate limiter on all API traffic
app.use('/api', generalLimiter);

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Cargo Tracking API is running',
    timestamp: new Date().toISOString(),
  });
});

// Apply stricter rate limits to auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register-customer', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/cargo', cargoRoutes);
app.use('/api/customer', customerRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
