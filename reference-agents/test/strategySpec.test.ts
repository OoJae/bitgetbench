import { describe, expect, it } from "vitest";
import { validateSpec, specToAgent, specHash } from "../src/index.js";

describe("validateSpec", () => {
  it("normalizes a valid sma_cross spec with defaults", () => {
    const v = validateSpec({ kind: "sma_cross", params: { fast: 20, slow: 50 } });
    expect(v.kind).toBe("sma_cross");
    expect(v.params).toEqual({ fast: 20, slow: 50 });
    expect(v.sizePct).toBe(1);
    expect(v.leverage).toBe(1);
    expect(v.allowShort).toBe(false);
  });

  it("rejects unknown kinds", () => {
    expect(() => validateSpec({ kind: "ponzi" })).toThrow(/kind/);
    expect(() => validateSpec({})).toThrow(/kind/);
    expect(() => validateSpec(null)).toThrow(/object/);
  });

  it("enforces param bounds and relationships", () => {
    expect(() => validateSpec({ kind: "sma_cross", params: { fast: 50, slow: 20 } })).toThrow(
      /slow/,
    );
    expect(() => validateSpec({ kind: "sma_cross", params: { fast: 1.5, slow: 50 } })).toThrow(
      /integer/,
    );
    expect(() => validateSpec({ kind: "sma_cross", params: { fast: 20, slow: 9999 } })).toThrow(
      /\[1, 400\]/,
    );
    expect(() =>
      validateSpec({ kind: "sma_cross", params: { fast: 20, slow: 50 }, leverage: 999 }),
    ).toThrow(/leverage/);
    expect(() =>
      validateSpec({ kind: "sma_cross", params: { fast: 20, slow: 50 }, sizePct: 2 }),
    ).toThrow(/sizePct/);
  });

  it("fills rsi_reversion and breakout defaults", () => {
    expect(validateSpec({ kind: "rsi_reversion" }).params).toEqual({
      period: 14,
      oversold: 30,
      exitLevel: 50,
    });
    expect(validateSpec({ kind: "breakout" }).params).toEqual({ lookback: 20 });
    expect(validateSpec({ kind: "buy_and_hold" }).params).toEqual({});
  });
});

describe("specToAgent", () => {
  it("compiles each kind to a named BenchAgent", () => {
    expect(specToAgent({ kind: "sma_cross", params: { fast: 10, slow: 30 } }).name).toBe(
      "sma-10-30",
    );
    expect(specToAgent({ kind: "rsi_reversion" }).name).toBe("rsi-reversion-14");
    expect(specToAgent({ kind: "breakout", params: { lookback: 20 } }).name).toBe("breakout-20");
    expect(specToAgent({ kind: "buy_and_hold" }).name).toBe("buy-and-hold");
    expect(
      specToAgent({ kind: "sma_cross", params: { fast: 10, slow: 30 }, name: "mine" }).name,
    ).toBe("mine");
  });
});

describe("specHash", () => {
  it("is stable across key order and sensitive to params", () => {
    const a = specHash({ kind: "sma_cross", params: { fast: 20, slow: 50 }, sizePct: 0.5 });
    const b = specHash({ sizePct: 0.5, params: { slow: 50, fast: 20 }, kind: "sma_cross" });
    expect(a).toBe(b);
    expect(a).not.toBe(specHash({ kind: "sma_cross", params: { fast: 20, slow: 60 } }));
    expect(a).toHaveLength(32);
  });
});
