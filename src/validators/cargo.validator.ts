import * as yup from 'yup';

const cargoStatusValues = [
  'PENDING', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_AT_HUB',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
] as const;

export const createCargoSchema = yup.object({
  // Tracking number is auto-generated if not provided.
  // Empty strings are treated as `undefined` so the other rules
  // (min length, regex) are not evaluated when the field is blank.
  trackingNumber: yup
    .string()
    .transform((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v))
    .trim()
    .min(4, 'Tracking number must be at least 4 characters')
    .max(50, 'Tracking number must be at most 50 characters')
    .matches(/^[A-Za-z0-9-]+$/, 'Tracking number can only contain letters, numbers, and hyphens')
    .notRequired(),
  title: yup.string().trim().min(2).max(200).required('Title is required'),
  description: yup.string().trim().max(2000).notRequired(),
  weight: yup
    .number()
    .positive('Weight must be a positive number')
    .max(100000, 'Weight is unreasonably large')
    .notRequired()
    .nullable(),
  price: yup
    .number()
    .typeError('Price must be a number')
    .positive('Price must be a positive number')
    .max(100000000, 'Price is too large')
    .notRequired()
    .nullable(),
  senderName: yup.string().trim().min(2).max(100).required('Sender name is required'),
  senderEmail: yup
    .string()
    .trim()
    .email('Sender email must be a valid email')
    .transform((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v))
    .notRequired()
    .nullable(),
  senderContact: yup
    .string()
    .trim()
    .max(100)
    .transform((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v))
    .notRequired()
    .nullable(),
  receiverName: yup.string().trim().min(2).max(100).required('Receiver name is required'),
  receiverEmail: yup
    .string()
    .trim()
    .email('Must be a valid email')
    .transform((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v))
    .notRequired()
    .nullable(),
  receiverContact: yup
    .string()
    .trim()
    .max(100)
    .transform((v) => (v === '' ? undefined : v))
    .notRequired()
    .nullable(),
  origin: yup.string().trim().min(2).max(200).required('Origin is required'),
  destination: yup.string().trim().min(2).max(200).required('Destination is required'),
  entryDate: yup
    .date()
    .max(new Date(), 'Entry date cannot be in the future')
    .notRequired(),
  customerId: yup.string().uuid('Customer ID must be a valid UUID').notRequired().nullable(),
});

export const updateCargoSchema = yup.object({
  // Cargo can only be edited while status is PENDING - enforced in controller.
  title: yup.string().trim().min(2).max(200).notRequired(),
  description: yup.string().trim().max(2000).notRequired(),
  weight: yup
    .number()
    .positive('Weight must be a positive number')
    .max(100000)
    .notRequired()
    .nullable(),
  price: yup
    .number()
    .typeError('Price must be a number')
    .positive('Price must be a positive number')
    .max(100000000)
    .notRequired()
    .nullable(),
  senderName: yup.string().trim().min(2).max(100).notRequired(),
  senderEmail: yup
    .string()
    .trim()
    .email()
    .transform((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v))
    .notRequired()
    .nullable(),
  senderContact: yup
    .string()
    .trim()
    .max(100)
    .transform((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v))
    .notRequired()
    .nullable(),
  receiverName: yup.string().trim().min(2).max(100).notRequired(),
  receiverEmail: yup
    .string()
    .trim()
    .email()
    .transform((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v))
    .notRequired()
    .nullable(),
  receiverContact: yup.string().trim().max(100).notRequired().nullable(),
  origin: yup.string().trim().min(2).max(200).notRequired(),
  destination: yup.string().trim().min(2).max(200).notRequired(),
  entryDate: yup.date().max(new Date(), 'Entry date cannot be in the future').notRequired(),
  customerId: yup.string().uuid('Customer ID must be a valid UUID').notRequired().nullable(),
  currentStatus: yup.string().oneOf([...cargoStatusValues], 'Invalid status').notRequired(),
});

// lat/long are explicitly NOT required fields - user may use the "Use my location"
// button or skip location entirely
export const createStatusUpdateSchema = yup.object({
  status: yup
    .string()
    .oneOf([...cargoStatusValues], 'Invalid status')
    .required('Status is required'),
  note: yup.string().trim().max(2000).notRequired(),
  latitude: yup
    .number()
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90')
    .notRequired()
    .nullable(),
  longitude: yup
    .number()
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
    .notRequired()
    .nullable(),
  locationText: yup.string().trim().max(255).notRequired(),
});

export const cargoIdParamSchema = yup.object({
  id: yup.string().uuid('Invalid cargo ID').required(),
});

export const trackingNumberParamSchema = yup.object({
  trackingNumber: yup.string().trim().min(4).max(50).required('Tracking number is required'),
});
