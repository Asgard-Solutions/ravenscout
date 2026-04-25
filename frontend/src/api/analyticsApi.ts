/**
 * Raven Scout — analytics-usage / extra-credit-pack API client.
 *
 * Mirrors the backend endpoints introduced for the
 * non-expiring extra-pack feature:
 *   - GET  /api/user/analytics-usage
 *   - POST /api/analytics/consume        (server-side usage; rarely called from the client)
 *   - POST /api/purchases/extra-credits  (idempotent grant after a successful StoreKit/RC purchase)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export interface AnalyticsPack {
  id: string;
  credits: number;
  price_usd: number;
  label: string;
}

export interface AnalyticsUsage {
  plan: 'free' | 'trial' | 'core' | 'pro' | string;
  monthlyAnalyticsLimit: number;
  monthlyAnalyticsUsed: number;
  monthlyAnalyticsRemaining: number;
  extraAnalyticsCredits: number;
  totalRemaining: number;
  resetDate: string | null;
  packs: AnalyticsPack[];
}

export interface GrantExtraCreditsResult {
  ok: true;
  duplicate: boolean;
  credits_granted: number;
  extra_analytics_credits: number;
  pack_id: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem('session_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAnalyticsUsage(): Promise<AnalyticsUsage> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/user/analytics-usage`, { headers });
  if (!res.ok) {
    throw new Error(`fetchAnalyticsUsage failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Server-side single-credit consume. Throws on 402 (out of credits)
 * with the same payload shape as the analyze-hunt endpoint so callers
 * can route to the limit modal uniformly.
 */
export async function consumeOneAnalysis(): Promise<{ charged: 'monthly' | 'extra'; usage: AnalyticsUsage }> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/analytics/consume`, { method: 'POST', headers });
  if (res.status === 402) {
    const err: any = new Error('out_of_credits');
    err.code = 'out_of_credits';
    err.payload = await res.json().catch(() => ({}));
    throw err;
  }
  if (!res.ok) throw new Error(`consumeOneAnalysis failed: ${res.status}`);
  return res.json();
}

/**
 * Grant an extra-credit pack after a successful StoreKit/RevenueCat
 * purchase. Idempotent on (source='in_app', transaction_id). Pass
 * the platform's transaction_id (or RC purchase token) so that
 * retries during network flakiness don't double-credit.
 */
export async function grantExtraCreditsPurchase(
  packId: string,
  transactionId: string,
): Promise<GrantExtraCreditsResult> {
  const headers = await authHeaders();
  const res = await fetch(`${BACKEND_URL}/api/purchases/extra-credits`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pack_id: packId, transaction_id: transactionId }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`grantExtraCreditsPurchase failed (${res.status}): ${errBody}`);
  }
  return res.json();
}
