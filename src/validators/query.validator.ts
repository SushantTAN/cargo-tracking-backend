import * as yup from 'yup';

// Comma-separated list of cargo statuses
export const cargoStatusListSchema = yup
  .string()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value.split(',') : []))
  .notRequired();

// Comma-separated list of user roles
export const userRoleListSchema = yup
  .string()
  .transform((value) => (typeof value === 'string' && value.length > 0 ? value.split(',') : []))
  .notRequired();

// Dashboard period filter
export const dashboardPeriodSchema = yup
  .string()
  .oneOf([
    'today', 'yesterday',
    'this_week', 'last_week',
    'this_month', 'last_month',
    'last_7_days', 'last_30_days', 'last_90_days',
    'this_year', 'all_time',
  ])
  .default('all_time');

export const dateRangeSchema = yup.object({
  startDate: yup.string().notRequired(),
  endDate: yup.string().notRequired(),
});
