import type { Checker } from 'accessibility-checker-engine/ace';
import type { Guideline } from 'accessibility-checker-engine/v4/api/IGuideline';
import type { Report } from 'accessibility-checker-engine/v4/api/IReport';
import type { Issue } from 'accessibility-checker-engine/v4/api/IRule';

/** The general format of the issues already used by the storybook addon-a11y */
interface StorybookIssues {
  id: string;
  impact: string;
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    any: Array<{
      impact: 'critical' | 'serious' | 'manual';
      message: string;
    }>;
    all: any[];
    none: any[];
    target: string[];
  }>;
}

/** General format of the configuration already used by the storybook addon-a11y */
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

/**
 * A wrapper for the accessibility-checker-engine to adjust configuration and output to match the
 * existing addon-a11y.
 */
export class CheckerWrapper {
  // Instance of the checker
  private checker: Checker | undefined;

  // Guidelines provided by this instance of the checker
  private guidelines: Guideline[] | undefined;

  // Mapping of rules to toolkit level (used to map to 'impact')
  private ruleTKLevel: { [ruleId: string]: string } = {};

  public static async getWrapper(config?: CheckerConfig) {
    const retVal = new CheckerWrapper();
    await retVal.initialize();
    return retVal;
  }

  /**
   * Instantiate this wrapper using the given config
   *
   * @param config
   */
  private constructor(private config?: CheckerConfig) {}

  private async initialize() {
    await import('accessibility-checker-engine/ace-storybook.js');
    const CheckerPackage = (window as any).ibma_ace_engine;
    const { Checker } = CheckerPackage;
    this.checker = new Checker();
    this.guidelines = this.checker!.getGuidelines().filter(
      (guideline: Guideline) =>
        ((!this.config?.guidelines || this.config.guidelines.length === 0) &&
          guideline.id === 'IBM_Accessibility') ||
        (this.config?.guidelines &&
          this.config.guidelines.length > 0 &&
          this.config?.guidelines?.includes(guideline.id))
    );
    this.guidelines!.forEach((guideline) => {
      guideline.checkpoints.forEach((checkpoint) => {
        checkpoint.rules?.forEach((rule) => {
          this.ruleTKLevel[rule.id] = rule.toolkitLevel;
        });
      });
    });
  }

  /** Enable / disable rules in the guidelines based on the configuration */
  private configureEngine() {
    // Turn off rules here
    this.guidelines!.forEach((guideline) => {
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
      this.checker!.addGuideline(guideline);
    });
  }

  /**
   * Run the engine on the specified subtree
   *
   * @param htmlElement
   * @returns
   */
  public async run(htmlElement: Element) {
    // Configure the engine for this run
    this.configureEngine();

    // Get the regular report from the accessibility-checker-engine
    const report = await this.checker!.check(
      htmlElement,
      this.guidelines!.map((guideline) => guideline.id)
    );

    // Post process to remove issues related to filtered rules
    if (this.config?.rules) {
      const selRules = this.config.rules.filter((rule) => rule.selector);
      if (selRules.length > 0) {
        report.results = report.results.filter((issue: Issue) => {
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

    // Determine how many ancestors to remove from the DOM path (needed by the existing plugin)
    let skipCount = 1;
    let skipWalk = htmlElement;
    while (skipWalk.nodeName !== 'html' && skipWalk.parentElement) {
      skipWalk = skipWalk.parentElement;
      skipCount += 1;
    }

    // Convert our report to match the existing report format
    return this.convertResult(htmlElement, report, skipCount);
  }

  /**
   * Convert checker result to storybook report format
   *
   * @param htmlElement
   * @param report
   * @param skipCount
   * @returns
   */
  private convertResult(htmlElement: Element, report: Report, skipCount: number) {
    try {
      const { results } = report;
      return {
        testEngine: {
          name: 'accessibility-checker-engine',
          version: '3.1.62',
        },
        testRunner: {
          name: 'accessibility-checker',
        },
        timestamp: new Date().toISOString(),
        url: document.location.href,
        toolOptions: {},
        inapplicable: [],
        passes: this.convertCollection(
          htmlElement,
          report,
          results.filter((issue: any) => issue.value[1] === 'PASS'),
          skipCount
        ),
        incomplete: this.convertCollection(
          htmlElement,
          report,
          results.filter(
            (issue: any) =>
              issue.value[0] === 'VIOLATION' &&
              (issue.value[1] === 'POTENTIAL' || issue.value[1] === 'MANUAL')
          ),
          skipCount
        ),
        violations: this.convertCollection(
          htmlElement,
          report,
          results.filter(
            (issue: any) => issue.value[0] === 'VIOLATION' && issue.value[1] === 'FAIL'
          ),
          skipCount
        ),
      };
    } catch (err) {
      console.error(err);
      return {};
    }
  }

  /**
   * Convert an accessibility-checker-engine DOM path to a CSS selector
   *
   * @param xpath
   * @returns
   */
  private xpathToCSS(xpath: string) {
    return xpath
      .substring(1)
      .replace(/\//g, ' > ')
      .replace(/\[(\d+)\]/g, ':nth-of-type($1)');
  }

  private convertCollection(
    htmlElement: Element,
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
      const nextCollection = {
        id: key,
        impact: '',
        tags: [] as string[],
        description: '',
        help: report.nls ? report.nls[key][0] : '',
        helpUrl: this.getHelpUrl(nextIssue),
        nodes: issueMap[key]
          .map((issue) => this.convertIssue(htmlElement, issue, skipCount))
          .filter((issue) => !!issue),
      };
      if (nextCollection.nodes.length > 0) {
        retVal.push(nextCollection);
      }
    });
    return retVal;
  }

  private convertIssue(htmlElement: Element, issue: Issue, skipCount: number): any {
    const pathParts = issue.path.dom.substring(1).split('/');

    if (skipCount >= pathParts.length) {
      return undefined;
    }
    let selector = this.xpathToCSS(`/${pathParts.slice(skipCount).join('/')}`);
    selector = this.simplifySelector(htmlElement, selector);
    let impact = 'serious';
    if (issue.ruleId in this.ruleTKLevel) {
      const tkLevel = this.ruleTKLevel[issue.ruleId];

      if (tkLevel === '1') {
        impact = 'critical';
      }

      if (tkLevel === '2') {
        impact = 'serious';
      }

      if (tkLevel === '3') {
        impact = 'minor';
      }
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

  /**
   * Simplify the CSS selector
   *
   * The selector generated by xpathToCSS is very specific, but not necssarily the most human
   * friendly
   *
   * @param htmlElement
   * @param selector
   * @returns
   */
  private simplifySelector(htmlElement: Element, selector: string) {
    let selectorSections = selector.split(' > ');
    // First, swap out individual sections with parts that are more human readable
    for (let idx = 0; idx < selectorSections.length; idx += 1) {
      let parents = '';
      if (idx > 0) {
        parents = `${selectorSections.slice(0, idx).join(' > ')} > `;
      }
      const selectedElement = htmlElement.querySelector(parents + selectorSections[idx]);
      if (selectedElement) {
        if (
          selectedElement?.hasAttribute('id') &&
          htmlElement.querySelector(
            `${parents}#${CSS.escape(selectedElement.getAttribute('id')!)}`
          ) === selectedElement &&
          htmlElement.querySelectorAll(
            `${parents}#${CSS.escape(selectedElement.getAttribute('id')!)}`
          ).length === 1
        ) {
          selectorSections[idx] = `#${CSS.escape(selectedElement.getAttribute('id')!)}`;
        } else if (
          selectedElement?.hasAttribute('class') &&
          htmlElement.querySelector(
            `${parents}.${CSS.escape(selectedElement.getAttribute('class')!)}`
          ) === selectedElement &&
          htmlElement.querySelectorAll(
            `${parents}.${CSS.escape(selectedElement.getAttribute('class')!)}`
          ).length === 1
        ) {
          selectorSections[idx] = `.${CSS.escape(selectedElement.getAttribute('class')!)}`;
        } else if (
          htmlElement.querySelector(parents + selectedElement.nodeName) === selectedElement &&
          htmlElement.querySelectorAll(parents + selectedElement.nodeName).length === 1
        ) {
          selectorSections[idx] = selectedElement.nodeName.toLowerCase();
        }
      }
    }
    // Remove parent definitions that don't add clarity
    while (
      selectorSections.length > 1 &&
      htmlElement.querySelector(selectorSections.slice(1).join(' > ')) ===
        htmlElement.querySelector(selectorSections.join(' > ')) &&
      htmlElement.querySelectorAll(selectorSections.slice(1).join(' > ')).length === 1
    ) {
      selectorSections = selectorSections.slice(1);
    }
    if (
      htmlElement.querySelector(selectorSections.join(' ')) !==
        htmlElement.querySelector(selectorSections.join(' > ')) ||
      htmlElement.querySelectorAll(selectorSections.join(' ')).length > 1
    ) {
      return selectorSections.join(' > ');
    }
    return selectorSections.join(' ');
  }

  /**
   * Get a help url for this issue
   *
   * @param issue
   * @returns
   */
  private getHelpUrl(issue: any): string {
    if (issue.help) {
      return issue.help;
    }
    const helpUrl = this.checker.engine.getHelp(issue.ruleId, issue.reasonId);
    // const minIssue = {
    //   message: issue.message,
    //   snippet: issue.snippet,
    //   value: issue.value,
    //   reasonId: issue.reasonId,
    //   ruleId: issue.ruleId,
    //   msgArgs: issue.messageArgs,
    // };
    return `${helpUrl}`; // #${encodeURIComponent(JSON.stringify(minIssue))}`;
  }
}
