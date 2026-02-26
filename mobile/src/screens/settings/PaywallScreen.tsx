import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { FontFamily, FontSize, Spacing, BorderRadius } from '../../constants/theme';
import { PRODUCTS } from '../../constants/config';
import { useSubscriptionStore } from '../../store/slices/subscriptionSlice';
import type { AppStackParamList } from '../../types/navigation.types';

type BillingPeriod = 'monthly' | 'annual';

const PLANS = {
  pro: {
    name: 'Pro',
    icon: 'diamond-outline' as const,
    monthly: '$6.99',
    annual: '$55.99',
    annualMonthly: '$4.67',
    features: ['20 GB storage', '100 searches/month', '90-day retention'],
    monthlyProductId: PRODUCTS.PRO_MONTHLY,
    annualProductId: PRODUCTS.PRO_ANNUAL,
  },
  pro_max: {
    name: 'Pro Max',
    icon: 'rocket-outline' as const,
    monthly: '$14.99',
    annual: '$119.99',
    annualMonthly: '$10.00',
    features: ['50 GB storage', '500 searches/month', '90-day retention'],
    monthlyProductId: PRODUCTS.PRO_MAX_MONTHLY,
    annualProductId: PRODUCTS.PRO_MAX_ANNUAL,
  },
};

export default function PaywallScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { currentPlan, isPurchasing, purchase, restorePurchases, products } =
    useSubscriptionStore();
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');

  const handlePurchase = async (plan: 'pro' | 'pro_max') => {
    const planConfig = PLANS[plan];
    const productId = billingPeriod === 'annual' ? planConfig.annualProductId : planConfig.monthlyProductId;

    // Check if product is available from App Store
    const product = products.find((p) => p.id === productId);
    if (!product) {
      Alert.alert('Unavailable', 'This subscription is not available right now. Please try again later.');
      return;
    }

    const success = await purchase(productId);
    if (success) {
      Alert.alert('Welcome!', `You're now on the ${planConfig.name} plan.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  const handleRestore = async () => {
    await restorePurchases();
    Alert.alert('Restore Complete', 'Your purchases have been restored.');
  };

  // Get real prices from App Store if available, fallback to hardcoded
  const getPrice = (plan: 'pro' | 'pro_max', period: BillingPeriod): string => {
    const planConfig = PLANS[plan];
    const productId = period === 'annual' ? planConfig.annualProductId : planConfig.monthlyProductId;
    const product = products.find((p) => p.id === productId);
    if (product) return product.displayPrice;
    return period === 'annual' ? planConfig.annual : planConfig.monthly;
  };

  const PlanCard = ({ plan, planKey }: { plan: (typeof PLANS)[keyof typeof PLANS]; planKey: 'pro' | 'pro_max' }) => {
    const isCurrent = currentPlan === planKey;
    const price = getPrice(planKey, billingPeriod);
    const perMonth = billingPeriod === 'annual' ? plan.annualMonthly : undefined;
    const isHighlighted = planKey === 'pro';

    return (
      <View
        style={[
          styles.planCard,
          {
            backgroundColor: colors.surface,
            borderColor: isHighlighted ? colors.amber : colors.border,
            borderWidth: isHighlighted ? 2 : 1,
          },
        ]}
      >
        {isHighlighted && (
          <View style={[styles.popularBadge, { backgroundColor: colors.amber }]}>
            <Text style={styles.popularText}>Most Popular</Text>
          </View>
        )}

        <View style={styles.planHeader}>
          <Ionicons name={plan.icon} size={24} color={isHighlighted ? colors.amber : colors.textMid} />
          <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.text }]}>{price}</Text>
          <Text style={[styles.pricePeriod, { color: colors.textMid }]}>
            /{billingPeriod === 'annual' ? 'year' : 'month'}
          </Text>
        </View>
        {billingPeriod === 'annual' && perMonth && (
          <Text style={[styles.perMonth, { color: colors.textMid }]}>{perMonth}/month</Text>
        )}

        <View style={styles.features}>
          {plan.features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.amber} />
              <Text style={[styles.featureText, { color: colors.text }]}>{feature}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => handlePurchase(planKey)}
          disabled={isCurrent || isPurchasing}
          style={[
            styles.subscribeBtn,
            {
              backgroundColor: isCurrent ? colors.surfaceRaised : colors.amber,
              opacity: isCurrent ? 0.5 : 1,
            },
          ]}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={[styles.subscribeBtnText, { color: isCurrent ? colors.textMid : '#fff' }]}>
              {isCurrent ? 'Current Plan' : 'Subscribe'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
    >
      <Text style={[styles.title, { color: colors.text }]}>Upgrade Your Plan</Text>
      <Text style={[styles.subtitle, { color: colors.textMid }]}>
        Unlock more storage, more searches, and longer retention.
      </Text>

      {/* Billing period toggle */}
      <View style={[styles.toggleContainer, { backgroundColor: colors.surfaceRaised }]}>
        <TouchableOpacity
          onPress={() => setBillingPeriod('monthly')}
          style={[
            styles.toggleBtn,
            billingPeriod === 'monthly' && { backgroundColor: colors.surface },
          ]}
        >
          <Text
            style={[
              styles.toggleText,
              { color: billingPeriod === 'monthly' ? colors.text : colors.textMid },
            ]}
          >
            Monthly
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setBillingPeriod('annual')}
          style={[
            styles.toggleBtn,
            billingPeriod === 'annual' && { backgroundColor: colors.surface },
          ]}
        >
          <Text
            style={[
              styles.toggleText,
              { color: billingPeriod === 'annual' ? colors.text : colors.textMid },
            ]}
          >
            Annual
          </Text>
          <View style={[styles.saveBadge, { backgroundColor: colors.amber + '22' }]}>
            <Text style={[styles.saveText, { color: colors.amber }]}>Save 20%</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Free plan comparison */}
      <View style={[styles.freeCompare, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <Text style={[styles.freeTitle, { color: colors.textMid }]}>Free Plan</Text>
        <Text style={[styles.freeDetail, { color: colors.textDim }]}>
          5 GB storage  ·  20 searches/month  ·  15-day retention
        </Text>
      </View>

      {/* Plan cards */}
      <PlanCard plan={PLANS.pro} planKey="pro" />
      <PlanCard plan={PLANS.pro_max} planKey="pro_max" />

      {/* Restore purchases */}
      <TouchableOpacity onPress={handleRestore} style={styles.restoreBtn}>
        <Text style={[styles.restoreText, { color: colors.textMid }]}>Restore Purchases</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.xl },
  title: { fontFamily: FontFamily.bold, fontSize: FontSize.xxl, textAlign: 'center', marginTop: Spacing.lg },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: BorderRadius.lg,
    padding: 4,
    marginBottom: Spacing.xl,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  toggleText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm },
  saveBadge: { borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  saveText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.xs },
  freeCompare: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  freeTitle: { fontFamily: FontFamily.semiBold, fontSize: FontSize.sm },
  freeDetail: { fontFamily: FontFamily.regular, fontSize: FontSize.xs, marginTop: 2 },
  planCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderBottomLeftRadius: BorderRadius.md,
  },
  popularText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.xs, color: '#fff' },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  planName: { fontFamily: FontFamily.bold, fontSize: FontSize.xl },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  price: { fontFamily: FontFamily.bold, fontSize: FontSize.xxxl },
  pricePeriod: { fontFamily: FontFamily.regular, fontSize: FontSize.md, marginLeft: 4 },
  perMonth: { fontFamily: FontFamily.regular, fontSize: FontSize.sm, marginTop: 2 },
  features: { marginTop: Spacing.lg, gap: Spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  featureText: { fontFamily: FontFamily.regular, fontSize: FontSize.md },
  subscribeBtn: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  subscribeBtnText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.md },
  restoreBtn: { alignItems: 'center', marginTop: Spacing.md, padding: Spacing.md },
  restoreText: { fontFamily: FontFamily.medium, fontSize: FontSize.sm, textDecorationLine: 'underline' },
});
