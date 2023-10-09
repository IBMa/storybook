import { Checker } from 'accessibility-checker-engine/ace-node';
import type { Guideline } from 'accessibility-checker-engine/v4/api/IGuideline';
import type { Report } from 'accessibility-checker-engine/v4/api/IReport';
import type { Issue } from 'accessibility-checker-engine/v4/api/IRule';

interface StorybookIssues {
  id: string;
  impact: '';
  tags: [];
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    any: any[];
    all: any[];
    none: any[];
    target: string[];
  }>;
}

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

  private ruleTKLevel: { [ruleId: string]: string } = {};

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
    this.guidelines.forEach((guideline) => {
      guideline.checkpoints.forEach((checkpoint) => {
        checkpoint.rules?.forEach((rule) => {
          this.ruleTKLevel[rule.id] = rule.toolkitLevel;
        });
      });
    });
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
    if (this.config?.rules) {
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
    let skipCount = 1;
    let skipWalk = htmlElement;
    while (skipWalk.nodeName !== 'html' && skipWalk.parentElement) {
      skipWalk = skipWalk.parentElement;
      skipCount += 1;
    }
    return this.convertResult(report, skipCount);
  }

  private convertResult(report: Report, skipCount: number) {
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
        passes: this.convertCollection(
          report,
          results.filter((issue: any) => issue.value[1] === 'PASS'),
          skipCount
        ),
        incomplete: this.convertCollection(
          report,
          results.filter(
            (issue: any) =>
              issue.value[0] === 'VIOLATION' &&
              (issue.value[1] === 'POTENTIAL' || issue.value[1] === 'MANUAL')
          ),
          skipCount
        ),
        violations: this.convertCollection(
          report,
          results.filter(
            (issue: any) => issue.value[0] === 'VIOLATION' && issue.value[1] === 'FAIL'
          ),
          skipCount
        ),
      };
    } catch (err) {
      return {};
    }
  }

  private xpathToCSS(xpath: string) {
    return xpath
      .substring(1)
      .replace(/\//g, ' > ')
      .replace(/\[(\d+)\]/g, ':nth-of-type($1)');
  }

  private convertCollection(
    report: Report,
    issues: Issue[],
    skipCount: number
  ): Array<StorybookIssues> {
    const issueMap: {
      [ruleId: string]: Issue[];
    } = {};
    issues.forEach((issue) => {
      issueMap[issue.ruleId] = issueMap[issue.ruleId] || [];
      issueMap[issue.ruleId].push(issue);
    });
    const retVal: StorybookIssues[] = [];
    Object.keys(issueMap).forEach((key) => {
      const nextIssue = issueMap[key][0];
      retVal.push({
        id: key,
        impact: '',
        tags: [],
        description: '',
        help: report.nls ? report.nls[key][0] : '',
        helpUrl: this.getHelpUrl(nextIssue),
        nodes: issueMap[key]
          .map((issue) => this.convertIssue(issue, skipCount))
          .filter((issue) => !!issue),
      });
    });
    return retVal;
  }

  private convertIssue(issue: Issue, skipCount: number): any {
    const pathParts = issue.path.dom.substring(1).split('/');
    if (skipCount >= pathParts.length) return undefined;
    const selector = this.xpathToCSS(`/${pathParts.slice(skipCount).join('/')}`);
    let impact = 'serious';
    if (issue.ruleId in this.ruleTKLevel) {
      const tkLevel = this.ruleTKLevel[issue.ruleId];
      if (tkLevel === '1') impact = 'critical';
      if (tkLevel === '2') impact = 'serious';
      if (tkLevel === '3') impact = 'minor';
    }
    return {
      any: [
        {
          impact,
          message: issue.message,
        },
      ],
      all: [],
      none: [],
      target: [selector],
    };
  }

  private getHelpUrl(issue: any): string {
    if (issue.help) return issue.help;
    const helpUrl = this.checker.engine.getHelp(issue.ruleId, issue.reasonId).split('#')[0];
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
