import type { ApiResponse, SubscriptionStatusData } from '../../types/api.types';
import apiClient from './client';

export const subscriptionsApi = {
  getStatus: () =>
    apiClient.get<ApiResponse<SubscriptionStatusData>>('/subscriptions/status'),

  verifyReceipt: (receiptData: string) =>
    apiClient.post<ApiResponse<SubscriptionStatusData>>('/subscriptions/verify-receipt', {
      receipt_data: receiptData,
    }),
};
