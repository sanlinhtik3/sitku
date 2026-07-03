import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { base = "USD", symbols = ["EUR", "THB", "JPY", "GBP", "SGD", "MYR", "CNY", "KRW", "INR", "AUD", "CAD", "CHF"] } = await req.json();
    
    // Filter out MMK since Frankfurter doesn't support it
    const supportedSymbols = symbols.filter((s: string) => s !== "MMK");
    
    console.log(`Fetching exchange rates for base: ${base}, symbols: ${supportedSymbols.join(",")}`);

    // Frankfurter API - Free, no API key required
    // Note: MMK (Myanmar Kyat) is not supported by this API - we'll add it manually
    const symbolsStr = supportedSymbols.join(",");
    
    // If base is MMK, we need to handle it differently
    const actualBase = base === "MMK" ? "USD" : base;
    
    const response = await fetch(
      `https://api.frankfurter.app/latest?from=${actualBase}&to=${symbolsStr}`
    );

    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.statusText}`);
    }

    const data = await response.json();
    
    console.log(`Successfully fetched rates:`, data);

    // Add MMK rate manually (approximate rate based on USD)
    // MMK is not supported by Frankfurter, so we calculate it
    const mmkPerUsd = 2100; // Approximate USD to MMK rate
    
    if (actualBase === "USD") {
      data.rates.MMK = mmkPerUsd;
    } else {
      // For other base currencies, we need to calculate via USD
      // If base is THB: 1 THB = X USD, 1 USD = 2100 MMK => 1 THB = X * 2100 MMK
      const usdRate = data.rates.USD || (1 / 33.5); // THB to USD approx
      data.rates.MMK = mmkPerUsd / (1 / usdRate);
    }
    
    // If original base was MMK, we need to invert all rates
    if (base === "MMK") {
      const mmkRates: Record<string, number> = { MMK: 1 };
      for (const [currency, rate] of Object.entries(data.rates)) {
        // Convert: if 1 USD = rate THB, and 1 USD = 2100 MMK
        // Then 1 MMK = rate/2100 THB
        mmkRates[currency] = (rate as number) / mmkPerUsd;
      }
      mmkRates.USD = 1 / mmkPerUsd;
      data.rates = mmkRates;
      data.base = "MMK";
    }

    return new Response(JSON.stringify({
      success: true,
      base: data.base,
      date: data.date,
      rates: data.rates,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching exchange rates:", error);
    
    // Return fallback rates if API fails
    const fallbackRates = {
      success: true,
      base: "USD",
      date: new Date().toISOString().split("T")[0],
      rates: {
        EUR: 0.92,
        THB: 33.5,
        JPY: 150,
        GBP: 0.79,
        SGD: 1.34,
        MYR: 4.47,
        CNY: 7.24,
        KRW: 1350,
        INR: 83.5,
        AUD: 1.53,
        CAD: 1.36,
        CHF: 0.88,
        MMK: 2100,
      },
      fallback: true,
    };
    
    return new Response(JSON.stringify(fallbackRates), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
