export type VerifyFn = () => boolean;

export interface TaskVerifier {
  onChange: VerifyFn[]; // Task completes when ANY function in this array returns true
}

export type StepVerifiers = Record<number, TaskVerifier>;
export type ChapterVerifiers = Record<string, StepVerifiers>;
export type VerifyRegistry = Record<string, ChapterVerifiers>;
