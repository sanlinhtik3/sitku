import { describe, expect, it } from "vitest";
import {
  captureDeviceTransactionTime,
  isTransactionDateInRange,
  parseTransactionLocalDate,
  transactionDateKey,
  transactionMonthKey,
} from "../../src/lib/flowstate/financeDates";

describe("FlowState finance date policy", () => {
  it("keeps UI-selected local dates as local date keys instead of UTC ISO days", () => {
    const selectedLocalDate = new Date(2026, 6, 10);

    expect(transactionDateKey(selectedLocalDate.toISOString())).toBe("2026-07-10");
  });

  it("includes timestamp-shaped transaction dates in same-day local ranges", () => {
    expect(isTransactionDateInRange("2026-07-10T12:34:00", "2026-07-10", "2026-07-10")).toBe(true);
    expect(transactionMonthKey("2026-07-31T23:59:00")).toBe("2026-07");
  });

  it("captures shadow device time for new records without changing the visible date key", () => {
    const now = new Date(2026, 6, 10, 14, 5, 9);

    expect(captureDeviceTransactionTime("2026-07-09", now)).toMatchObject({
      transaction_date: "2026-07-09",
      occurred_at: "2026-07-09T14:05:09",
    });
  });

  it("parses transaction dates as local dates for UI display", () => {
    const parsed = parseTransactionLocalDate("2026-07-10T23:59:00");

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(6);
    expect(parsed.getDate()).toBe(10);
  });
});
