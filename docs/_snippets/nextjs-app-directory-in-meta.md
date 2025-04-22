```js filename="NavigationBasedComponent.stories.js" renderer="react" language="js"
import NavigationBasedComponent from './NavigationBasedComponent';

export default {
  component: NavigationBasedComponent,
  parameters: {
    nextjs: {
      appDirectory: true, // 👈 Set this
    },
  },
};
```

```ts filename="NavigationBasedComponent.stories.ts" renderer="react" language="ts"
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import NavigationBasedComponent from './NavigationBasedComponent';

const meta = {
  component: NavigationBasedComponent,
  parameters: {
    nextjs: {
      appDirectory: true, // 👈 Set this
    },
  },
} satisfies Meta<typeof NavigationBasedComponent>;
export default meta;
```
