// Fill simulation: turn a reference price (the next bar open) into an executed price
// after slippage, and compute the taker fee. Pure functions, no state, no randomness.

import type { Fill, FeeConfig, SlippageConfig } from "./types.js";

/** A fill is a buy or a sell. Slippage always moves the price against the taker. */
export type TradeDirection = "buy" | "sell";

/** Apply slippage adversely: a buy pays up, a sell receives less. */
export function fillPrice(
  referencePrice: number,
  direction: TradeDirection,
  slippage: SlippageConfig,
): number {
  const adj = slippage.bps / 10_000;
  return direction === "buy" ? referencePrice * (1 + adj) : referencePrice * (1 - adj);
}

/** Taker fee in USDT for a given notional. */
export function takerFeeUsd(notionalUsd: number, fees: FeeConfig): number {
  return notionalUsd * fees.takerFee;
}

/**
 * Convenience that builds a Fill for a known notional (used when opening, where the
 * caller targets a notional and derives quantity from the returned price).
 */
export function simulateFill(
  direction: TradeDirection,
  referencePrice: number,
  notionalUsd: number,
  fees: FeeConfig,
  slippage: SlippageConfig,
): Fill {
  return {
    price: fillPrice(referencePrice, direction, slippage),
    sizeUsd: notionalUsd,
    feeUsd: takerFeeUsd(notionalUsd, fees),
    slippageBps: slippage.bps,
  };
}
