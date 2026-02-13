import type { ApiResponse, AuthData } from '../../types/api.types';
import apiClient from './client';

export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    apiClient.post<ApiResponse<AuthData>>('/auth/register', data),

  login: (data: { email: string; password: string }) =>
    apiClient.post<ApiResponse<AuthData>>('/auth/login', data),

  refresh: (refreshToken: string) =>
    apiClient.post<ApiResponse<AuthData['tokens']>>('/auth/refresh', {
      refresh_token: refreshToken,
    }),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refresh_token: refreshToken }),
};
