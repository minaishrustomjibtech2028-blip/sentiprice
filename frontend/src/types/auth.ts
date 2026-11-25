/**
 * Shared auth/user types — must stay in sync with backend/app/schemas/auth.py
 * and backend/app/core/roles.py. There is no CUSTOMER role.
 */
export type Role = "ADMIN" | "ANALYST" | "BUSINESS_USER";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
