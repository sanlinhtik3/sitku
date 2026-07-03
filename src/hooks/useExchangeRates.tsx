import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatLocalDate } from "@/lib/dateUtils";

interface ExchangeRatesResponse {
  success: boolean;
  base: string;
  date: string;
  rates: Record<string, number>;
  fallback?: boolean;
}

// Supported currencies with symbols
export const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  THB: "฿",
  JPY: "¥",
  GBP: "£",
  SGD: "S$",
  MYR: "RM",
  CNY: "¥",
  KRW: "₩",
  INR: "₹",
  AUD: "A$",
  CAD: "C$",
  CHF: "Fr",
  MMK: "Ks",
};

export function useExchangeRates(baseCurrency: string = "USD") {
  const { data, isLoading, error, refetch } = useQuery<ExchangeRatesResponse>({
    queryKey: ["exchange-rates", baseCurrency],
    queryFn: async () => {
      // Local-first: if no real Supabase URL is configured (local-runtime /
      // desktop / preview), don't even attempt the edge-function fetch — go
      // straight to the embedded fallback rates. Avoids a noisy console error
      // on every mount in offline mode.
      const hasBackend = Boolean(import.meta.env.VITE_SUPABASE_URL);
      if (!hasBackend) {
        return {
          success: true,
          base: baseCurrency,
          date: formatLocalDate(),
          rates: getFallbackRates(baseCurrency),
          fallback: true,
        };
      }
      try {
        const { data, error } = await supabase.functions.invoke("get-exchange-rates", {
          body: {
            base: baseCurrency,
            symbols: ["USD", "EUR", "THB", "JPY", "GBP", "SGD", "MYR", "MMK"]
          }
        });

        if (error) throw error;
        return data as ExchangeRatesResponse;
      } catch {
        // Fallback rates are expected when the backend is unreachable — not an
        // error worth logging. The hook surfaces `isFallback` for the UI.
        return {
          success: true,
          base: baseCurrency,
          date: formatLocalDate(),
          rates: getFallbackRates(baseCurrency),
          fallback: true,
        };
      }
    },
    staleTime: 10 * 60 * 1000, // 10 minutes cache
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
  });

  // Convert amount from one currency to another
  const convert = useCallback((amount: number, from: string, to: string): number => {
    if (from === to) return amount;
    if (!data?.rates) return amount;

    // If base is the same as 'from', just multiply by the rate
    if (data.base === from) {
      const rate = data.rates[to];
      if (rate) return amount * rate;
    }

    // If base is the same as 'to', divide by the inverse rate
    if (data.base === to) {
      const rate = data.rates[from];
      if (rate) return amount / rate;
    }

    // Cross conversion: from -> base -> to
    const fromRate = data.rates[from] || 1;
    const toRate = data.rates[to] || 1;
    
    // Convert to base first, then to target
    const amountInBase = amount / fromRate;
    return amountInBase * toRate;
  }, [data]);

  // Get exchange rate between two currencies
  const getRate = useCallback((from: string, to: string): number | null => {
    if (from === to) return 1;
    if (!data?.rates) return null;

    if (data.base === from) {
      return data.rates[to] || null;
    }

    if (data.base === to) {
      const rate = data.rates[from];
      return rate ? 1 / rate : null;
    }

    // Cross rate
    const fromRate = data.rates[from];
    const toRate = data.rates[to];
    if (fromRate && toRate) {
      return toRate / fromRate;
    }

    return null;
  }, [data]);

  return {
    rates: data?.rates || {},
    base: data?.base || baseCurrency,
    date: data?.date,
    isFallback: data?.fallback || false,
    isLoading,
    error,
    convert,
    getRate,
    refetch,
  };
}

// Fallback rates when API fails
function getFallbackRates(base: string): Record<string, number> {
  const usdRates: Record<string, number> = {
    USD: 1,
    EUR: 0.92,
    THB: 33.5,
    JPY: 150,
    GBP: 0.79,
    SGD: 1.34,
    MYR: 4.47,
    MMK: 2100,
  };

  if (base === "USD") {
    return usdRates;
  }

  // Convert to different base
  const baseToUsd = usdRates[base] || 1;
  const result: Record<string, number> = {};
  
  for (const [currency, rate] of Object.entries(usdRates)) {
    result[currency] = rate / baseToUsd;
  }
  
  return result;
}
