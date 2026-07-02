import * as yup from 'yup';

export const registerCustomerSchema = yup.object({
  name: yup.string().trim().min(2, 'Name must be at least 2 characters').max(100).required('Name is required'),
  email: yup.string().trim().email('Must be a valid email').required('Email is required'),
  password: yup
    .string()
    .min(8, 'Password must be at least 8 characters')
    .matches(/^(?=.*[A-Za-z])(?=.*\d)/, 'Password must contain at least one letter and one number')
    .required('Password is required'),
});

export const loginSchema = yup.object({
  email: yup.string().trim().email('Must be a valid email').required('Email is required'),
  password: yup.string().required('Password is required'),
});

export const refreshTokenSchema = yup.object({
  refreshToken: yup.string().required('Refresh token is required'),
});
