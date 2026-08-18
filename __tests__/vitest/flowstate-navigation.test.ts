import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Personal CFO navigation", () => {
  it("keeps the shared dashboard under Overview and removes the duplicate CFO tab", () => {
    const source = readFileSync(resolve("src/components/dashboard/FlowStateDialog.tsx"), "utf8");

    expect(source).toContain('useState("overview")');
    expect(source).toContain('<Tabs value={activeTab}');
    expect(source).toContain('<TabsContent value="overview"');
    expect(source).not.toContain('["cfo", "CFO"');
    expect(source).not.toContain('value="cfo"');
  });
});
