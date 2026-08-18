export type MarkdownParityFeature =
  | "heading"
  | "line-break"
  | "list"
  | "table"
  | "callout"
  | "code"
  | "math"
  | "embed";

export interface MarkdownParityFixture {
  feature: MarkdownParityFeature;
  markdown: string;
  embeddedContent?: Record<string, string>;
}

export const markdownParityFixtures: MarkdownParityFixture[] = [
  {
    feature: "heading",
    markdown: "Project Alpha\n\n## Goals\nShip reliable notes.",
  },
  {
    feature: "line-break",
    markdown: "Daily Log\n\nfirst line\nsecond line\nthird line",
  },
  {
    feature: "list",
    markdown: "Tasks\n\n- Draft\n- Review\n\n1. Build\n2. Verify",
  },
  {
    feature: "table",
    markdown: "Metrics\n\n| Name | Value |\n| --- | ---: |\n| Notes | 8 |",
  },
  {
    feature: "callout",
    markdown: "Warnings\n\n> [!NOTE]\n> Keep the local copy.",
  },
  {
    feature: "code",
    markdown: "Implementation\n\n```typescript\nconst ready = true;\n```",
  },
  {
    feature: "math",
    markdown: "Formula\n\n$$\nE = mc^2\n$$",
  },
  {
    feature: "embed",
    markdown: "Research\n\n![[Source Note]]",
    embeddedContent: { "Source Note": "Source Title\n\nEmbedded knowledge." },
  },
];
