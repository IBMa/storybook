import fs from 'fs'
import path from 'path'

import { createStorybookRule } from '../../lib/utils/create-storybook-rule'
import { StorybookRuleMeta } from '../../lib/types'

const ROOT = path.resolve(__dirname, '../../lib/rules')

export type TRule = ReturnType<typeof createStorybookRule> & {
  meta: StorybookRuleMeta
}

const rules = fs
  .readdirSync(ROOT)
  .filter((file) => path.extname(file) === '.ts')
  .map((file) => path.basename(file, '.ts'))
  .map((name) => {
    const rule = require(path.join(ROOT, name)) as TRule
    const meta: StorybookRuleMeta = { ...rule.meta }
    if (meta.docs && !meta.docs.categories) {
      meta.docs = { ...meta.docs }
      meta.docs.categories = []
    }

    return {
      ruleId: `storybook/${name}`,
      name,
      meta,
    }
  })

export type TRules = typeof rules

export default rules
