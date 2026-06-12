// Config globale spedizione (singleton public.shipping_config).

export interface ShippingConfig {
  /// Costo spedizione netto di default (EUR), applicato sotto soglia.
  feeNet: number;
  /// Soglia (lordo vini) sopra cui la spedizione e' gratis.
  freeThresholdGross: number;
  updatedAt: string;
}

/// Valori di fallback se la riga di config non e' leggibile. Devono restare
/// allineati con i default storici dell'app (order_pricing.dart: 10 / 300).
export const SHIPPING_FALLBACK: ShippingConfig = {
  feeNet: 10,
  freeThresholdGross: 300,
  updatedAt: "",
};
