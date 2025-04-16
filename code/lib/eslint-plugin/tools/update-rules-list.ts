import rules from './utils/rules'

import { emojiKey, writeRulesListInReadme, updateRulesDocs } from './utils/docs'
import { extendsCategories } from './utils/updates'

/*
This script updates the rules table in `README.md`from rule's meta data.
*/

export type TRulesList = readonly [
  ruleName: string,
  ruleLink: string,
  docsDescription: string,
  fixable: string,
  categories: string,
]
export type TRuleListWithoutName = TRulesList extends readonly [string, ...infer TRulesWithoutName]
  ? TRulesWithoutName
  : never

const createRuleLink = (ruleName: string) =>
  `[\`storybook/${ruleName}\`](./docs/rules/${ruleName}.md)`

const rulesList: TRulesList[] = Object.entries(rules)
  .sort(([_, { name: ruleNameA }], [__, { name: ruleNameB }]) => {
    return ruleNameA.localeCompare(ruleNameB)
  })
  .map(([_, rule]) => {
    const ruleCategories: string[] = rule.meta.docs?.categories ?? []
    const extendedCategories: string[] = []

    Object.entries(extendsCategories).map(([category, extendedCategory]) => {
      if (
        extendedCategory &&
        !ruleCategories.includes(category) &&
        ruleCategories.includes(extendedCategory)
      ) {
        ruleCategories.push(category)
      }
    })

    return [
      rule.name,
      createRuleLink(rule.name),
      rule.meta.docs?.description || '',
      rule.meta.fixable ? emojiKey.fixable : '',
      rule.meta.docs?.excludeFromConfig
        ? 'N/A'
        : ruleCategories
          ? `<ul>${ruleCategories.map((c) => `<li>${c}</li><li>flat/${c}</li>`).join('')}</ul>`
          : '',
    ]
  })

async function run() {
  await writeRulesListInReadme(rulesList)

  await updateRulesDocs(rulesList)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
