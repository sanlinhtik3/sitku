import { describe, expect, it } from "vitest";

import {
  EV_NARRATIVE_CONVERSATION_INSTRUCTION,
  evNarrativeConversationProtocol,
} from "@/features/ev-voice/protocols";

describe("E.V narrative conversation protocol", () => {
  it("keeps actions and failures direct", () => {
    expect(evNarrativeConversationProtocol.plan("action_result")).toMatchObject({
      storytelling: "none",
      responseShape: "result_first",
    });
    expect(evNarrativeConversationProtocol.plan("error")).toMatchObject({
      storytelling: "none",
      responseShape: "result_first",
    });
  });

  it("uses a compact arc only when conversation benefits from it", () => {
    expect(evNarrativeConversationProtocol.plan("explain")).toMatchObject({
      storytelling: "micro",
      responseShape: "answer_first",
    });
    expect(evNarrativeConversationProtocol.plan("coach", true)).toMatchObject({
      storytelling: "guided",
      responseShape: "narrative_arc",
    });
  });

  it("keeps read-aloud output faithful to the source", () => {
    expect(evNarrativeConversationProtocol.plan("read")).toEqual({
      storytelling: "none",
      responseShape: "source_faithful",
      maxRoutineSentences: 0,
    });
  });

  it("makes evidence and permission stronger than narrative style", () => {
    expect(EV_NARRATIVE_CONVERSATION_INSTRUCTION).toContain("Safety, permissions");
    expect(EV_NARRATIVE_CONVERSATION_INSTRUCTION).toContain("Do not invent");
    expect(EV_NARRATIVE_CONVERSATION_INSTRUCTION).toContain("Lead with the answer");
  });
});
