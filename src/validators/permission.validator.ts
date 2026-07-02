import * as yup from 'yup';

export const createPermissionSchema = yup.object({
  name: yup
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .matches(
      /^[a-z]+:[a-z_]+$/,
      'Name must follow pattern resource:action (lowercase, e.g., cargo:create)'
    )
    .required('Name is required'),
  description: yup.string().trim().max(255).notRequired(),
});
