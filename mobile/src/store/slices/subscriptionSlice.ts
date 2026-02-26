import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  getReceiptDataIOS,
  purchaseUpdatedListener,
  purchaseErrorListener,
  ErrorCode,
  type Purchase,
  type PurchaseError,
  type ProductSubscriptionIOS,
  type EventSubscription,
} from 'react-native-iap';
import { create } from 'zustand';
import { PRODUCTS } from '../../constants/config';
import { subscriptionsApi } from '../../services/api';
import type { PlanType, SubscriptionStatusData } from '../../types/api.types';

const PRODUCT_IDS = [
  PRODUCTS.PRO_MONTHLY,
  PRODUCTS.PRO_ANNUAL,
  PRODUCTS.PRO_MAX_MONTHLY,
  PRODUCTS.PRO_MAX_ANNUAL,
];

interface SubscriptionState {
  subscriptionStatus: SubscriptionStatusData | null;
  isLoading: boolean;
  error: string | null;

  products: ProductSubscriptionIOS[];
  isPurchasing: boolean;
  isConnected: boolean;

  currentPlan: PlanType;
  isProOrAbove: boolean;

  initialize: () => Promise<void>;
  fetchStatus: () => Promise<void>;
  fetchProducts: () => Promise<void>;
  purchase: (productId: string) => Promise<boolean>;
  restorePurchases: () => Promise<void>;
  cleanup: () => void;
  reset: () => void;
}

let purchaseListener: EventSubscription | null = null;
let errorListener: EventSubscription | null = null;

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscriptionStatus: null,
  isLoading: false,
  error: null,
  products: [],
  isPurchasing: false,
  isConnected: false,
  currentPlan: 'free',
  isProOrAbove: false,

  initialize: async () => {
    if (Platform.OS !== 'ios') return;

    try {
      await initConnection();
      set({ isConnected: true });

      // Clean up previous listeners
      purchaseListener?.remove();
      errorListener?.remove();

      // Listen for completed purchases
      purchaseListener = purchaseUpdatedListener(async (purchase: Purchase) => {
        try {
          // Get the full App Store receipt for server-side verification
          const receiptData = await getReceiptDataIOS();
          if (receiptData) {
            const response = await subscriptionsApi.verifyReceipt(receiptData);
            const status = response.data.data;
            set({
              subscriptionStatus: status,
              currentPlan: status.plan_type,
              isProOrAbove: status.plan_type !== 'free',
            });
          }
        } catch (err: any) {
          console.warn('Receipt verification failed:', err.message);
        }

        // Always finish the transaction
        await finishTransaction({ purchase, isConsumable: false });
        set({ isPurchasing: false });
      });

      errorListener = purchaseErrorListener((error: PurchaseError) => {
        if (error.code !== ErrorCode.UserCancelled) {
          set({ error: error.message });
        }
        set({ isPurchasing: false });
      });

      await Promise.all([get().fetchStatus(), get().fetchProducts()]);
    } catch (err: any) {
      console.warn('IAP init error:', err.message);
    }
  },

  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await subscriptionsApi.getStatus();
      const status = response.data.data;
      set({
        subscriptionStatus: status,
        currentPlan: status.plan_type,
        isProOrAbove: status.plan_type !== 'free',
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchProducts: async () => {
    try {
      if (Platform.OS !== 'ios') return;
      const result = await fetchProducts({ skus: PRODUCT_IDS, type: 'subs' });
      if (!result) return;
      // Filter to iOS subscription products
      const subs = result.filter(
        (p) => p.platform === 'ios'
      ) as ProductSubscriptionIOS[];
      set({ products: subs });
    } catch (err: any) {
      console.warn('Failed to fetch products:', err.message);
    }
  },

  purchase: async (productId: string) => {
    set({ isPurchasing: true, error: null });
    try {
      await requestPurchase({ type: 'subs', request: { ios: { sku: productId } } });
      // Result handled by purchaseUpdatedListener
      return true;
    } catch (err: any) {
      if (err.code !== ErrorCode.UserCancelled) {
        set({ error: err.message });
      }
      set({ isPurchasing: false });
      return false;
    }
  },

  restorePurchases: async () => {
    set({ isLoading: true, error: null });
    try {
      const purchases = await getAvailablePurchases();
      if (purchases.length > 0) {
        // Get the full receipt and verify server-side
        const receiptData = await getReceiptDataIOS();
        if (receiptData) {
          const response = await subscriptionsApi.verifyReceipt(receiptData);
          const status = response.data.data;
          set({
            subscriptionStatus: status,
            currentPlan: status.plan_type,
            isProOrAbove: status.plan_type !== 'free',
          });
        }
      }
      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  cleanup: () => {
    purchaseListener?.remove();
    errorListener?.remove();
    purchaseListener = null;
    errorListener = null;
    endConnection();
    set({ isConnected: false });
  },

  reset: () => {
    purchaseListener?.remove();
    errorListener?.remove();
    purchaseListener = null;
    errorListener = null;
    endConnection();
    set({
      subscriptionStatus: null,
      products: [],
      isConnected: false,
      currentPlan: 'free',
      isProOrAbove: false,
      error: null,
    });
  },
}));
