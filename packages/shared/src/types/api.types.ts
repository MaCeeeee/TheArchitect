export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  tags?: string[];
}

export interface CreateElementRequest {
  type: string;
  name: string;
  description?: string;
  layer: string;
  togafDomain: string;
  position3D: { x: number; y: number; z: number };
  metadata?: Record<string, unknown>;
}

export interface CreateConnectionRequest {
  sourceId: string;
  targetId: string;
  type: string;
  label?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}
