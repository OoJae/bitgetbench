// Portfolio accounting for a single-symbol USDT-M linear futures sim. Tracks realized
// cash and one open position; equity is cash plus mark-to-market unrealized PnL. All
// sizing and fees flow through here so the engine stays thin. No randomness.

import type { FeeConfig, SlippageConfig, Trade } from "./types.js";
import { fillPrice, takerFeeUsd } from "./fills.js";

interface OpenPosition {
  side: "long" | "short";
  /** Base quantity, always positive; sign is carried by `side`. */
  qty: number;
  entry: number;
  leverage: number;
  /** Margin committed at open, in USDT. */
  margin: number;
  /** Taker fee paid at open, carried so the closed trade reports total fees. */
  entryFee: number;
  entryTs: number;
}

export class Portfolio {
  private cashUsd: number;
  private open: OpenPosition | null = null;
  private readonly fees: FeeConfig;
  private readonly slippage: SlippageConfig;
  readonly trades: Trade[] = [];

  constructor(startEquity: number, fees: FeeConfig, slippage: SlippageConfig) {
    this.cashUsd = startEquity;
    this.fees = fees;
    this.slippage = slippage;
  }

  get cash(): number {
    return this.cashUsd;
  }

  get position(): Readonly<OpenPosition> | null {
    return this.open;
  }

  hasPosition(): boolean {
    return this.open !== null;
  }

  /** Unrealized PnL at a mark price. */
  unrealizedPnl(price: number): number {
    if (!this.open) return 0;
    const { side, qty, entry } = this.open;
    return side === "long" ? qty * (price - entry) : qty * (entry - price);
  }

  /** Account equity at a mark price: realized cash plus unrealized PnL. */
  equity(price: number): number {
    return this.cashUsd + this.unrealizedPnl(price);
  }

  /**
   * Open a position. Precondition: currently flat (the engine closes first when flipping).
   * Sizes margin as sizePct of current equity (which equals cash when flat).
   */
  openPosition(
    side: "long" | "short",
    referencePrice: number,
    sizePct: number,
    leverage: number,
    ts: number,
  ): void {
    if (this.open) throw new Error("openPosition called while a position is already open");
    const margin = Math.max(0, sizePct) * this.cashUsd;
    if (margin <= 0 || leverage <= 0) return;
    const notional = margin * leverage;
    const direction = side === "long" ? "buy" : "sell";
    const price = fillPrice(referencePrice, direction, this.slippage);
    const fee = takerFeeUsd(notional, this.fees);
    const qty = notional / price;
    this.cashUsd -= fee;
    this.open = { side, qty, entry: price, leverage, margin, entryFee: fee, entryTs: ts };
  }

  /** Close the open position at a reference price, charging the exit taker fee. */
  closePosition(referencePrice: number, ts: number): Trade | null {
    if (!this.open) return null;
    const pos = this.open;
    const direction = pos.side === "long" ? "sell" : "buy";
    const exit = fillPrice(referencePrice, direction, this.slippage);
    const grossPnl =
      pos.side === "long" ? pos.qty * (exit - pos.entry) : pos.qty * (pos.entry - exit);
    const exitFee = takerFeeUsd(pos.qty * exit, this.fees);
    this.cashUsd += grossPnl - exitFee;
    const totalFee = pos.entryFee + exitFee;
    // Net of both entry and exit fees; the entry fee already left cash at open.
    const pnlUsd = grossPnl - totalFee;
    const trade: Trade = {
      entryTs: pos.entryTs,
      exitTs: ts,
      side: pos.side,
      entry: pos.entry,
      exit,
      qty: pos.qty,
      pnlUsd,
      feeUsd: totalFee,
      returnPct: pos.margin > 0 ? pnlUsd / pos.margin : 0,
    };
    this.open = null;
    this.trades.push(trade);
    return trade;
  }

  /**
   * Settle an open position at run end for the trade log only: records a synthetic closed
   * trade marked at `markPrice` with no exit fee, and does NOT touch cash (equity already
   * reflects the unrealized PnL). Keeps metrics defined without distorting the equity curve.
   */
  settleOpenPosition(markPrice: number, ts: number): void {
    if (!this.open) return;
    const pos = this.open;
    const grossPnl =
      pos.side === "long" ? pos.qty * (markPrice - pos.entry) : pos.qty * (pos.entry - markPrice);
    const pnlUsd = grossPnl - pos.entryFee;
    this.trades.push({
      entryTs: pos.entryTs,
      exitTs: ts,
      side: pos.side,
      entry: pos.entry,
      exit: markPrice,
      qty: pos.qty,
      pnlUsd,
      feeUsd: pos.entryFee,
      returnPct: pos.margin > 0 ? pnlUsd / pos.margin : 0,
    });
    this.open = null;
  }
}
