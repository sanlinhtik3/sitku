import type {
  OperatorEvidence,
  OperatorModel,
  OperatorModelInput,
  OperatorModelResult,
} from "@/features/ev-voice/operator";

const RUNTIME_EVIDENCE: OperatorEvidence = {
  type: "runtime",
  label: "Agent runtime",
  detail: "LangChain Core (local adapter)",
};

interface OperatorPipeline {
  invoke(input: OperatorModelInput, options?: { signal?: AbortSignal; tags?: string[] }): Promise<OperatorModelResult>;
}

/**
 * Adds a lazy LangChain orchestration boundary around the existing provider.
 *
 * The provider still owns the model call. Sitku still owns permissions,
 * idempotency, persistence, and cancellation. Keeping those responsibilities
 * outside LangChain prevents an agent framework from bypassing local safety.
 */
export function createLangChainOperatorModel(provider: OperatorModel): OperatorModel {
  let pipelinePromise: Promise<OperatorPipeline> | null = null;

  const getPipeline = () => {
    pipelinePromise ||= import("@langchain/core/runnables").then(({ RunnableLambda, RunnableSequence }) => {
      const normalize = RunnableLambda.from((input: OperatorModelInput) => {
        const request = input.request.trim();
        if (!request) throw new Error("LANGCHAIN_OPERATOR_REQUEST_REQUIRED: Operator request is required.");
        if (input.signal.aborted) throw input.signal.reason || new DOMException("Operator interrupted", "AbortError");
        return { ...input, request };
      });

      const invokeProvider = RunnableLambda.from(async (input: OperatorModelInput) => provider(input));

      const validate = RunnableLambda.from((result: OperatorModelResult) => {
        const text = result.text.trim();
        if (!text) throw new Error("LANGCHAIN_OPERATOR_EMPTY_RESULT: Operator returned an empty result.");
        return {
          ...result,
          text,
          evidence: [...(result.evidence || []), RUNTIME_EVIDENCE],
        };
      });

      return RunnableSequence.from([normalize, invokeProvider, validate]) as unknown as OperatorPipeline;
    });
    return pipelinePromise;
  };

  return async (input) => {
    const pipeline = await getPipeline();
    return pipeline.invoke(input, {
      signal: input.signal,
      tags: ["sitku", "ev-operator", "local-first"],
    });
  };
}

