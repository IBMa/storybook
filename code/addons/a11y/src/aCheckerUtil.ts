export function convertReport(checker: any, report: any) {
  try {
    // console.log("ACE Report:", report);
    const { results } = report;
    return {
      testEngine: {
        name: 'accessibility-checker-engine',
        version: 'x.y.z',
      },
      testRunner: {
        name: 'accessibility-checker',
      },
      // "testEnvironment": {
      //     "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
      //     "windowWidth": 2213,
      //     "windowHeight": 1030,
      //     "orientationAngle": 0,
      //     "orientationType": "landscape-primary"
      // },
      timestamp: new Date().toISOString(),
      url: document.location.href,
      toolOptions: {},
      inapplicable: [],
      passes: results
        .filter((issue: any) => issue.value[1] === 'PASS')
        .map((issue: any) => convertIssue(checker, report, issue)),
      incomplete: results
        .filter(
          (issue: any) =>
            issue.value[0] === 'VIOLATION' &&
            (issue.value[1] === 'POTENTIAL' || issue.value[1] === 'MANUAL')
        )
        .map((issue: any) => convertIssue(checker, report, issue)),
      violations: results
        .filter((issue: any) => issue.value[0] === 'VIOLATION' && issue.value[1] === 'FAIL')
        .map((issue: any) => convertIssue(checker, report, issue)),
    };
  } catch (err) {
    console.error(err);
    return {};
  }
}

function convertIssue(checker: any, report: any, issue: any) {
  return {
    id: issue.ruleId,
    impact: '',
    tags: [],
    description: issue.message,
    help: report.nls[issue.ruleId][0],
    helpUrl: getHelpUrl(checker, issue),
    nodes: [],
  };
}

function getHelpUrl(checker: any, issue: any): string {
  if (issue.help) return issue.help;
  const helpUrl = checker.engine.getHelp(issue.ruleId, issue.reasonId, 'latest');
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
/*
{
            "id": "color-contrast",
            "impact": "serious",
            "tags": [
                "cat.color",
                "wcag2aa",
                "wcag143",
                "TTv5",
                "TT13.c",
                "EN-301-549",
                "EN-9.1.4.3",
                "ACT"
            ],
            "description": "Ensures the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds",
            "help": "Elements must meet minimum color contrast ratio thresholds",
            "helpUrl": "https://dequeuniversity.com/rules/axe/4.8/color-contrast?application=axeAPI",
            "nodes": [
                {
                    "any": [
                        {
                            "id": "color-contrast",
                            "data": {
                                "fgColor": "#ffffff",
                                "bgColor": "#1ea7fd",
                                "contrastRatio": 2.62,
                                "fontSize": "10.5pt (14px)",
                                "fontWeight": "bold",
                                "messageKey": null,
                                "expectedContrastRatio": "4.5:1"
                            },
                            "relatedNodes": [
                                {
                                    "html": "<button type=\"button\" class=\"storybook-button storybook-button--medium storybook-button--primary\">Button</button>",
                                    "target": [
                                        ".storybook-button"
                                    ]
                                }
                            ],
                            "impact": "serious",
                            "message": "Element has insufficient color contrast of 2.62 (foreground color: #ffffff, background color: #1ea7fd, font size: 10.5pt (14px), font weight: bold). Expected contrast ratio of 4.5:1",
                            "_constructor-name_": "CheckResult"
                        }
                    ],
                    "all": [],
                    "none": [],
                    "impact": "serious",
                    "html": "<button type=\"button\" class=\"storybook-button storybook-button--medium storybook-button--primary\">Button</button>",
                    "target": [
                        ".storybook-button"
                    ],
                    "failureSummary": "Fix any of the following:\n  Element has insufficient color contrast of 2.62 (foreground color: #ffffff, background color: #1ea7fd, font size: 10.5pt (14px), font weight: bold). Expected contrast ratio of 4.5:1"
                }
            ]
        }
        */
