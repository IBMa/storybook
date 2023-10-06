import { Checker } from 'accessibility-checker-engine/ace-node';
import type { Guideline } from 'accessibility-checker-engine/v4/api/IGuideline';

export interface CheckerConfig {
  // Modifications to rules
  rules?: Array<{
    // Rule id to modify
    id: string;
    // Is this rule enabled?
    enabled?: boolean;
    // What CSS selectors should the rules actually keep
    selector?: string;
    // Change violations to needs review
    reviewOnFail?: boolean;
  }>;
  // Disable any rules not listed here
  disableOtherRules?: boolean;
  guidelines?: string[];
}

export class CheckerWrapper {
  private checker: Checker;

  private guidelines: Guideline[];

  constructor(private config?: CheckerConfig) {
    this.checker = new Checker();
    this.guidelines = this.checker
      .getGuidelines()
      .filter(
        (guideline) =>
          ((!this.config?.guidelines || this.config.guidelines.length === 0) &&
            guideline.id === 'IBM_Accessibility') ||
          (this.config?.guidelines &&
            this.config.guidelines.length > 0 &&
            this.config?.guidelines?.includes(guideline.id))
      );
  }

  private configureEngine() {
    // Turn off rules here
    this.guidelines.forEach((guideline) => {
      guideline.checkpoints.forEach((checkpoint) => {
        (checkpoint.rules || []).forEach((ruleIter) => {
          const rule = ruleIter;
          const ruleConfig = this.config?.rules?.find((cfgRule) => cfgRule.id === rule.id);
          if (ruleConfig) {
            rule.enabled = ruleConfig.enabled !== false;
          } else if (this.config?.disableOtherRules === true) {
            rule.enabled = false;
          }
        });
      });
      // Refresh the guideline in the engine
      this.checker.addGuideline(guideline);
    });
  }

  public async run(htmlElement: Element) {
    this.configureEngine();

    const report = await this.checker.check(
      htmlElement,
      this.guidelines.map((guideline) => guideline.id)
    );
    // Post process to remove issues related to filtered rules
    if (this.config && this.config.rules) {
      const selRules = this.config.rules.filter((rule) => rule.selector);
      if (selRules.length > 0) {
        report.results = report.results.filter((issue) => {
          const ruleConfig = selRules.find((rule) => rule.id === issue.ruleId);
          return (
            !ruleConfig ||
            !ruleConfig.selector ||
            issue.node.nodeType !== 1 ||
            (issue.node as HTMLElement).matches(ruleConfig.selector)
          );
        });
      }
    }
    return this.convertResult(report);
  }

  private convertResult(report: any) {
    try {
      const { results } = report;
      return {
        testEngine: {
          name: 'accessibility-checker-engine',
          version: 'x.y.z',
        },
        testRunner: {
          name: 'accessibility-checker',
        },
        timestamp: new Date().toISOString(),
        url: document.location.href,
        toolOptions: {},
        inapplicable: [],
        passes: results
          .filter((issue: any) => issue.value[1] === 'PASS')
          .map((issue: any) => this.convertIssue(report, issue)),
        incomplete: results
          .filter(
            (issue: any) =>
              issue.value[0] === 'VIOLATION' &&
              (issue.value[1] === 'POTENTIAL' || issue.value[1] === 'MANUAL')
          )
          .map((issue: any) => this.convertIssue(report, issue)),
        violations: results
          .filter((issue: any) => issue.value[0] === 'VIOLATION' && issue.value[1] === 'FAIL')
          .map((issue: any) => this.convertIssue(report, issue)),
      };
    } catch (err) {
      // console.error(err);
      return {};
    }
  }

  private convertIssue(report: any, issue: any) {
    return {
      id: issue.ruleId,
      impact: '',
      tags: [],
      description: `${issue.message} [${issue.path.dom}]`,
      help: report.nls[issue.ruleId][0],
      helpUrl: this.getHelpUrl(issue),
      nodes: [],
    };
  }

  private getHelpUrl(issue: any): string {
    if (issue.help) return issue.help;
    const helpUrl = this.checker.engine.getHelp(issue.ruleId, issue.reasonId);
    const minIssue = {
      message: issue.message,
      snippet: issue.snippet,
      value: issue.value,
      reasonId: issue.reasonId,
      ruleId: issue.ruleId,
      msgArgs: issue.messageArgs,
    };
    return `${helpUrl}#${encodeURIComponent(JSON.stringify(minIssue))}`;
  }
}
