/**
 * @fileoverview Pass a context object when invoking a play function
 * @author Yann Braga
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

import dedent from 'ts-dedent'

import rule from '../../../lib/rules/context-in-play-function'
import ruleTester from '../../utils/rule-tester'

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

ruleTester.run('context-in-play-function', rule, {
  valid: [
    dedent`
      export const SecondStory = {
        play: async (context) => {
          await FirstStory.play(context)
        }
      }
    `,
    dedent`
      export const SecondStory = {
        play: async ({ ...context }) => {
          await FirstStory.play({ ...context })
        }
      }
    `,
    dedent`
      export const SecondStory = {
        play: async ({ canvasElement, ...context }) => {
          await FirstStory.play({ canvasElement, ...context })
        }
      }
    `,
    dedent`
      export const SecondStory = Template.bind({})
      SecondStory.play = async (ctx) => {
        await FirstStory.play(ctx)
      }
    `,
    dedent`
      export const SecondStory = Template.bind({})
      SecondStory.play = async ({ canvasElement, ...ctx }) => {
        await FirstStory.play({ canvasElement, ...ctx })
      }
    `,
    dedent`
      export const SecondStory = {
        play: async (ctx) => {
          await FirstStory.play(ctx)
        }
      }
    `,
    dedent`
      export const SecondStory = {
        play: async ({ ...ctx }) => {
          await FirstStory.play({ ...ctx })
        }
      }
    `,
    dedent`
      export const SecondStory = {
        play: async ({ canvasElement, ...ctx }) => {
          await FirstStory.play({ canvasElement, ...ctx })
        }
      }
    `,
    dedent`
      export const SecondStory = {
        play: async ({ context, canvasElement }) => {
          await FirstStory.play(context)
        }
      }
    `,
  ],
  invalid: [
    {
      code: dedent`
        export const SecondStory = {
          play: async ({ canvasElement }) => {
            await FirstStory.play({ canvasElement })
          }
        }
      `,
      errors: [
        {
          messageId: 'passContextToPlayFunction',
        },
      ],
    },
    {
      code: dedent`
        export const SecondStory = {
          play: async () => {
            await FirstStory.play()
          }
        }
      `,
      errors: [
        {
          messageId: 'passContextToPlayFunction',
        },
      ],
    },
    {
      code: dedent`
        export const SecondStory = Template.bind({})
        SecondStory.play = async ({ canvasElement }) => {
          await FirstStory.play({ canvasElement })
        }
      `,
      errors: [
        {
          messageId: 'passContextToPlayFunction',
        },
      ],
    },
    {
      code: dedent`
        export const SecondStory = Template.bind({})
        SecondStory.play = async () => {
          await FirstStory.play()
        }
      `,
      errors: [
        {
          messageId: 'passContextToPlayFunction',
        },
      ],
    },
  ],
})
