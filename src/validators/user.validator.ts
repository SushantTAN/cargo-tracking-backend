import * as yup from 'yup';

const contactIfStaffOrCustomer = (thisSchema: yup.AnySchema) =>
  thisSchema.when('role', (role: string[], schema) => {
    const r = Array.isArray(role) ? role[0] : role;
    if (r === 'STAFF' || r === 'CUSTOMER') {
      return schema.required('Contact is required for staff and customer users').min(3, 'Contact is too short').max(100);
    }
    return schema.notRequired().nullable();
  });

export const createUserSchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .required('Name is required'),
  email: yup
    .string()
    .trim()
    .email('Must be a valid email')
    .required('Email is required'),
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one number')
    .required('Password is required'),
  contact: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .test('contact-required', 'Contact is required for staff and customer users', function (value) {
      const role = this.parent.role;
      if ((role === 'STAFF' || role === 'CUSTOMER') && !value) return false;
      return true;
    })
    .notRequired()
    .nullable(),
  role: yup
    .string()
    .oneOf(['ADMIN', 'STAFF', 'CUSTOMER'], 'Invalid role')
    .required('Role is required'),
  isActive: yup.boolean().default(true),
  permissionIds: yup.array().of(yup.string().uuid()).notRequired(),
});

export const updateUserSchema = yup.object({
  name: yup.string().trim().min(2).max(100).notRequired(),
  email: yup.string().trim().email().notRequired(),
  contact: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? undefined : v))
    .test('contact-required', 'Contact is required for staff and customer users', function (value) {
      const role = this.parent.role;
      if ((role === 'STAFF' || role === 'CUSTOMER') && !value) return false;
      return true;
    })
    .notRequired()
    .nullable(),
  role: yup.string().oneOf(['ADMIN', 'STAFF', 'CUSTOMER']).notRequired(),
  isActive: yup.boolean().notRequired(),
});

export const updateUserPermissionsSchema = yup.object({
  permissionIds: yup
    .array()
    .of(yup.string().uuid('Each permission ID must be a valid UUID'))
    .required('Permission IDs array is required'),
});

export const updateUserStatusSchema = yup.object({
  isActive: yup.boolean().required('isActive is required'),
});

export const idParamSchema = yup.object({
  id: yup.string().uuid('Invalid ID format').required('ID is required'),
});
