import type { Page } from "playwright";

export interface Manifest {
  id: string;
  series: string;
  part: number;
  totalParts: number;
  title: string;
  shortcut: string;
  voice: string;
  intro: {
    duration: number;
    title: string;
    subtitle: string;
    badge: string;
  };
  narration: { id: string; text: string; caption?: string }[];
  outro: {
    duration: number;
    takeaway: string;
    nextPart: { id: string; title: string };
  };
}

export interface ScenarioContext {
  page: Page;
  manifest: Manifest;
  durations: number[];
  scenePads: number[];
  playScene: (
    sceneIndex: number,
    actionFn?: () => Promise<void>
  ) => Promise<void>;
  showKeyBadge: (key: string, label: string) => Promise<void>;
  clearKeyBadge: () => Promise<void>;
  spotlight: (selector: string) => Promise<void>;
  clearSpotlight: () => Promise<void>;
  baseUrl: string;
}

export type ScenarioRunner = (ctx: ScenarioContext) => Promise<void>;
