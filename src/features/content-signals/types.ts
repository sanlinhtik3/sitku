export type ContentSignalStatus = "good" | "watch" | "needs_data";

export type ContentSignalId =
  | "readiness"
  | "hook"
  | "flow"
  | "clarity"
  | "retention"
  | "evidence"
  | "platform_fit"
  | "viral_potential";

export interface ContentProfile {
  platform: "facebook" | "instagram" | "tiktok" | "youtube" | "general";
  format: "post" | "script" | "article" | "note";
  language: "my" | "en" | "mixed" | "auto";
  objective: "engagement" | "education" | "conversion" | "general";
}

export interface ContentSignalEvidence {
  paragraph: number;
  text: string;
}

export interface ContentSignalScore {
  id: ContentSignalId;
  label: string;
  value: number | null;
  confidence: "low" | "medium" | "high";
  status: ContentSignalStatus;
  summary: string;
  evidence?: ContentSignalEvidence[];
}

export interface ContentRecommendation {
  id: string;
  title: string;
  detail: string;
  paragraph?: number;
}

export interface ContentCalibration {
  linkedResults: number;
  minimumResults: number;
  confidence: "none" | "low" | "medium" | "high";
  status: "needs_data" | "calibrating" | "ready";
  summary: string;
}

export interface ContentSignalReport {
  schemaVersion: 1;
  contentHash: string;
  analyzedAt: number;
  profile: ContentProfile;
  meta: {
    words: number;
    characters: number;
    segments: number;
    paragraphs: number;
    headings: number;
    links: number;
    citations: number;
  };
  scores: ContentSignalScore[];
  recommendations: ContentRecommendation[];
  calibration?: ContentCalibration;
  aiReview?: ContentDeepReview;
}

export interface VerifiedContentOutcome {
  id: string;
  notePath: string;
  contentHash: string;
  postId: string;
  platform: ContentProfile["platform"];
  format: ContentProfile["format"];
  verifiedAt: string;
}

export interface ContentReviewRepository {
  listVerifiedOutcomes(notePath: string): Promise<VerifiedContentOutcome[]>;
  linkVerifiedOutcome(input: Omit<VerifiedContentOutcome, "id" | "verifiedAt">): Promise<VerifiedContentOutcome>;
  getCalibration(profile: Pick<ContentProfile, "platform" | "format">): Promise<ContentCalibration>;
}

export interface ContentDeepReview {
  summary: string;
  verdict: string;
  strongest: string;
  weakest: string;
  strengths: string[];
  weaknesses: string[];
  scores: ContentSignalScore[];
  recommendations: ContentRecommendation[];
  reviewedAt: number;
}

export interface ContentAnalysisInput {
  content: string;
  contentHash: string;
  profile: ContentProfile;
}

export const DEFAULT_CONTENT_PROFILE: ContentProfile = {
  platform: "facebook",
  format: "post",
  language: "auto",
  objective: "engagement",
};
