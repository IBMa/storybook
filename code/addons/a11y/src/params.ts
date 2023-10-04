import type { ElementContext, Spec, RunOptions } from 'axe-core';

export interface Setup {
  element?: ElementContext;
  config: Spec;
  options: RunOptions;
}

export interface A11yParameters {
  engine?: "axe" | "accessibility-checker",
  element?: ElementContext;
  config?: Spec;
  options?: RunOptions;
  manual?: boolean;
}
