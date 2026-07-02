import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { CargoStatus } from '@prisma/client';

const generateTrackingNumber = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CT-${timestamp}-${random}`;
};

export const createCargo = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const {
      trackingNumber, title, description, weight, price,
      senderName, senderEmail, senderContact,
      receiverName, receiverEmail, receiverContact,
      origin, destination, entryDate, customerId,
    } = req.body;

    const finalTrackingNumber = trackingNumber || generateTrackingNumber();

    const existing = await prisma.cargo.findUnique({
      where: { trackingNumber: finalTrackingNumber },
    });
    if (existing) throw ApiError.conflict('A cargo with this tracking number already exists');

    if (customerId) {
      const customer = await prisma.user.findUnique({ where: { id: customerId } });
      if (!customer) throw ApiError.badRequest('Customer not found');
      if (customer.role !== 'CUSTOMER') throw ApiError.badRequest('Assigned user must have CUSTOMER role');
      if (!customer.isActive) throw ApiError.badRequest('Customer account is not active');
    }

    const cargo = await prisma.cargo.create({
      data: {
        trackingNumber: finalTrackingNumber,
        title,
        description: description ?? null,
        weight: weight ?? null,
        price: price ?? null,
        senderName,
        senderEmail: senderEmail ?? null,
        senderContact: senderContact ?? null,
        receiverName,
        receiverEmail: receiverEmail ?? null,
        receiverContact: receiverContact ?? null,
        origin,
        destination,
        entryDate: entryDate ? new Date(entryDate) : new Date(),
        customerId: customerId || null,
        createdById: req.user.userId,
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json({
      success: true, message: 'Cargo created successfully', data: cargo,
    });
  } catch (error) { next(error); }
};

const VALID_CARGO_STATUSES = [
  'PENDING', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_HUB',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
] as const;

export const getAllCargo = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const where: any = {};

    // Customers can only see their own cargo (enforced on top of any filter)
    if (req.user?.role === 'CUSTOMER') {
      where.customerId = req.user.userId;
    } else if (req.query.customerId) {
      // Admins/staff can filter by specific customer
      where.customerId = String(req.query.customerId);
    }

    // Filter by status list (comma-separated)
    if (req.query.status) {
      const statusList = String(req.query.status).split(',').filter(Boolean);
      const valid = statusList.filter((s) => VALID_CARGO_STATUSES.includes(s as any));
      if (valid.length > 0) where.currentStatus = { in: valid };
    }

    // Free-text search across tracking number, title, sender/receiver names
    if (req.query.search && typeof req.query.search === 'string') {
      const q = req.query.search.trim();
      if (q.length > 0) {
        where.OR = [
          { trackingNumber: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
          { senderName: { contains: q, mode: 'insensitive' } },
          { receiverName: { contains: q, mode: 'insensitive' } },
        ];
      }
    }

    // Date range filter on createdAt OR entryDate based on `dateField` query param
    const dateField = String(req.query.dateField || 'createdAt');
    const dateColumn = dateField === 'entryDate' ? 'entryDate' : 'createdAt';
    if (req.query.startDate || req.query.endDate) {
      where[dateColumn] = {};
      if (req.query.startDate) where[dateColumn].gte = new Date(String(req.query.startDate));
      if (req.query.endDate) where[dateColumn].lte = new Date(String(req.query.endDate));
    }

    const cargos = await prisma.cargo.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        statusUpdates: {
          orderBy: { createdAt: 'desc' }, take: 1,
          include: { updatedBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: cargos });
  } catch (error) { next(error); }
};

export const getCargoById = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const cargo = await prisma.cargo.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        statusUpdates: {
          orderBy: { createdAt: 'desc' },
          include: { updatedBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!cargo) throw ApiError.notFound('Cargo not found');
    if (req.user?.role === 'CUSTOMER' && cargo.customerId !== req.user.userId) {
      throw ApiError.forbidden('You can only view your own cargo');
    }

    res.status(200).json({ success: true, data: cargo });
  } catch (error) { next(error); }
};

export const trackCargo = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { trackingNumber } = req.params;
    const cargo = await prisma.cargo.findUnique({
      where: { trackingNumber },
      include: {
        statusUpdates: {
          orderBy: { createdAt: 'desc' },
          include: { updatedBy: { select: { id: true, name: true } } },
        },
      },
    });

    if (!cargo) throw ApiError.notFound('Cargo not found');

    res.status(200).json({
      success: true,
      data: {
        id: cargo.id,
        trackingNumber: cargo.trackingNumber,
        title: cargo.title,
        description: cargo.description,
        weight: cargo.weight,
        price: cargo.price,
        senderName: cargo.senderName,
        senderEmail: cargo.senderEmail,
        senderContact: cargo.senderContact,
        receiverName: cargo.receiverName,
        receiverEmail: cargo.receiverEmail,
        receiverContact: cargo.receiverContact,
        origin: cargo.origin,
        destination: cargo.destination,
        currentStatus: cargo.currentStatus,
        entryDate: cargo.entryDate,
        createdAt: cargo.createdAt,
        statusUpdates: cargo.statusUpdates.map((u) => ({
          id: u.id, status: u.status, note: u.note,
          locationText: u.locationText, latitude: u.latitude, longitude: u.longitude,
          createdAt: u.createdAt,
        })),
      },
    });
  } catch (error) { next(error); }
};

export const updateCargo = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const data = req.body;

    const existing = await prisma.cargo.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Cargo not found');

    // Cargo can only be edited while it's still in PENDING state.
    // After pickup / transit, the record is immutable from the cargo:update
    // route - the only allowed change is via POST /:id/status-updates.
    if (existing.currentStatus !== 'PENDING') {
      throw ApiError.badRequest(
        `Cargo can only be edited while in PENDING status. Current status: ${existing.currentStatus}.`
      );
    }

    if (data.customerId !== undefined) {
      if (data.customerId === null || data.customerId === '') {
        data.customerId = null;
      } else {
        const customer = await prisma.user.findUnique({ where: { id: data.customerId } });
        if (!customer) throw ApiError.badRequest('Customer not found');
        if (customer.role !== 'CUSTOMER') throw ApiError.badRequest('Assigned user must have CUSTOMER role');
      }
    }

    const updated = await prisma.cargo.update({
      where: { id }, data,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(200).json({
      success: true, message: 'Cargo updated successfully', data: updated,
    });
  } catch (error) { next(error); }
};

export const createStatusUpdate = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) throw ApiError.unauthorized();
    const { id } = req.params;
    const { status, note, latitude, longitude, locationText } = req.body;

    const cargo = await prisma.cargo.findUnique({ where: { id } });
    if (!cargo) throw ApiError.notFound('Cargo not found');

    const statusUpdate = await prisma.$transaction(async (tx) => {
      const update = await tx.cargoStatusUpdate.create({
        data: {
          cargoId: id,
          status: status as CargoStatus,
          note: note ?? null,
          latitude: latitude ?? null,
          longitude: longitude ?? null,
          locationText: locationText ?? null,
          updatedById: req.user!.userId,
        },
        include: { updatedBy: { select: { id: true, name: true } } },
      });

      await tx.cargo.update({
        where: { id }, data: { currentStatus: status as CargoStatus },
      });
      return update;
    });

    res.status(201).json({
      success: true, message: 'Status updated successfully', data: statusUpdate,
    });
  } catch (error) { next(error); }
};

export const getStatusUpdates = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const cargo = await prisma.cargo.findUnique({ where: { id } });
    if (!cargo) throw ApiError.notFound('Cargo not found');
    if (req.user?.role === 'CUSTOMER' && cargo.customerId !== req.user.userId) {
      throw ApiError.forbidden('You can only view your own cargo');
    }
    const updates = await prisma.cargoStatusUpdate.findMany({
      where: { cargoId: id }, orderBy: { createdAt: 'desc' },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    res.status(200).json({ success: true, data: updates });
  } catch (error) { next(error); }
};

// Dashboard stats with period filter
const PERIOD_RANGES: Record<string, { start: Date; end: Date } | null> = {
  // returns null for "all_time"
};

function getPeriodRange(period: string): { start: Date; end: Date } | null {
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'this_week': {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7; // Monday = 0
      const start = new Date(d); start.setDate(d.getDate() - day); start.setHours(0,0,0,0);
      return { start, end: endOfDay(now) };
    }
    case 'last_week': {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7;
      const start = new Date(d); start.setDate(d.getDate() - day - 7); start.setHours(0,0,0,0);
      const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23,59,59,999);
      return { start, end };
    }
    case 'this_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: endOfDay(now),
      };
    case 'last_month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case 'last_7_days': {
      const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0,0,0,0);
      return { start: s, end: endOfDay(now) };
    }
    case 'last_30_days': {
      const s = new Date(now); s.setDate(s.getDate() - 29); s.setHours(0,0,0,0);
      return { start: s, end: endOfDay(now) };
    }
    case 'last_90_days': {
      const s = new Date(now); s.setDate(s.getDate() - 89); s.setHours(0,0,0,0);
      return { start: s, end: endOfDay(now) };
    }
    case 'this_year':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: endOfDay(now),
      };
    case 'all_time':
    default:
      return null;
  }
}

// Dashboard stats: status counts + cargo created per day/week/month for the period
export const getDashboardStats = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const period = String(req.query.period || 'all_time');
    const range = getPeriodRange(period);

    // Customers only see their own stats
    const where: any = req.user?.role === 'CUSTOMER' ? { customerId: req.user.userId } : {};

    // If a period is set, restrict the dataset to that period so status counts
    // and time-series both reflect only the selected window.
    if (range) {
      where.createdAt = { gte: range.start, lte: range.end };
    }

    const cargo = await prisma.cargo.findMany({
      where,
      select: { id: true, currentStatus: true, createdAt: true, weight: true },
    });

    // Status distribution
    const statusCounts: Record<string, number> = {
      PENDING: 0, PICKED_UP: 0, IN_TRANSIT: 0, ARRIVED_AT_HUB: 0,
      OUT_FOR_DELIVERY: 0, DELIVERED: 0, CANCELLED: 0,
    };
    for (const c of cargo) statusCounts[c.currentStatus] = (statusCounts[c.currentStatus] || 0) + 1;

    // Time-series buckets - scale to the selected period
    const now = range ? range.end : new Date();
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };

    // Daily: number of days in range, capped at 60
    const dailyDays = range
      ? Math.min(60, Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / 86400000) + 1))
      : 30;
    const dailyMap = new Map<string, number>();
    for (let i = dailyDays - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      dailyMap.set(startOfDay(d).toISOString().slice(0, 10), 0);
    }

    // Weekly
    const weeklyMap = new Map<string, number>();
    const getWeek = (d: Date) => {
      const date = new Date(d);
      const day = (date.getDay() + 6) % 7; // Mon=0
      date.setDate(date.getDate() - day);
      return startOfDay(date).toISOString().slice(0, 10);
    };
    const weekCount = range
      ? Math.min(24, Math.max(1, Math.ceil((range.end.getTime() - range.start.getTime()) / (7 * 86400000))))
      : 12;
    for (let i = weekCount - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7);
      weeklyMap.set(getWeek(d), 0);
    }

    // Monthly
    const monthlyMap = new Map<string, number>();
    const monthCount = range ? 24 : 12;
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyMap.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, 0);
    }

    let totalWeight = 0;
    for (const c of cargo) {
      totalWeight += c.weight || 0;
      const dayKey = startOfDay(c.createdAt).toISOString().slice(0, 10);
      if (dailyMap.has(dayKey)) dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1);
      const weekKey = getWeek(c.createdAt);
      if (weeklyMap.has(weekKey)) weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + 1);
      const monthKey = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap.has(monthKey)) monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1);
    }

    res.status(200).json({
      success: true,
      data: {
        period,
        range,
        totalCargo: cargo.length,
        totalWeightKg: Math.round(totalWeight * 100) / 100,
        statusCounts,
        daily: Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count })),
        weekly: Array.from(weeklyMap.entries()).map(([week, count]) => ({ week, count })),
        monthly: Array.from(monthlyMap.entries()).map(([month, count]) => ({ month, count })),
      },
    });
  } catch (error) { next(error); }
};
