import { describe, expect, it, vi } from "vitest";
import { createLangChainOperatorModel } from "@/features/agent-runtime/langchainOperatorAdapter";

describe("LangChain E.V Operator adapter", () => {
  it("runs the existing provider through a validated local pipeline", async () => {
    const provider = vi.fn(async ({ request }: { request: string }) => ({
      text: "  Verified result.  ",
      provider: "Gemini Operator",
      model: "gemini-2.5-flash",
      evidence: [{ type: "runtime" as const, label: "Operator model", detail: "gemini-2.5-flash" }],
    }));
    const model = createLangChainOperatorModel(provider);

    const result = await model({ request: "  Review this architecture  ", signal: new AbortController().signal });

    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ request: "Review this architecture" }));
    expect(result.text).toBe("Verified result.");
    expect(result.evidence).toContainEqual({
      type: "runtime",
      label: "Agent runtime",
      detail: "LangChain Core (local adapter)",
    });
  });

  it("does not call the provider when the turn was already cancelled", async () => {
    const provider = vi.fn(async () => ({ text: "should not run", provider: "test" }));
    const model = createLangChainOperatorModel(provider);
    const controller = new AbortController();
    controller.abort(new DOMException("User interrupted", "AbortError"));

    await expect(model({ request: "long task", signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects empty provider output instead of recording false success", async () => {
    const model = createLangChainOperatorModel(async () => ({ text: "   ", provider: "test" }));

    await expect(model({ request: "analyze", signal: new AbortController().signal }))
      .rejects.toThrow("LANGCHAIN_OPERATOR_EMPTY_RESULT");
  });
});

