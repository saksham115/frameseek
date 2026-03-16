import type { ApiResponse, AuthData, UserData } from '../../types/api.types';
import apiClient from './client';

export const authApi = {
  googleSignIn: (idToken: string, name?: string) =>
    apiClient.post<ApiResponse<AuthData>>('/auth/google', { id_token: idToken, name }),

  refresh: (refreshToken: string) =>
    apiClient.post<ApiResponse<AuthData['tokens']>>('/auth/refresh', {
      refresh_token: refreshToken,
    }),

  getMe: () =>
    apiClient.get<ApiResponse<UserData>>('/auth/me'),

  acceptTos: () =>
    apiClient.post<ApiResponse<UserData>>('/auth/accept-tos', { accepted: true }),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refresh_token: refreshToken }),

  deleteAccount: (reason: string, feedback?: string) =>
    apiClient.delete('/auth/account', { data: { reason, feedback } }),
};
