import { readFileSync } from 'node:fs';

import { logger } from 'storybook/internal/node-logger';
import type { CoreConfig } from 'storybook/internal/types';

import type { ParserOptions } from '@babel/core';
import { parse } from '@babel/parser';
import type { Plugin, ResolvedConfig } from 'vite';

import { getAutomockCode } from '../../../mocking-utils/automock';
import { extractMockCalls } from '../../../mocking-utils/extract';
import {
  type MockCall,
  getCleanId,
  invalidateAllRelatedModules,
  normalizePathForComparison,
} from './utils';

export interface MockPluginOptions {
  /** The absolute path to the preview.tsx file where mocks are defined. */
  previewConfigPath: string;
  /** The absolute path to the Storybook config directory. */
  coreOptions?: CoreConfig;
  /** Configuration directory */
  configDir: string;
}

/**
 * Vite plugin for Storybook module mocking manifest generation.
 *
 * Scans the preview config for sb.mock() calls, processes them, and emits a manifest for runtime
 * use.
 *
 * Responsibilities:
 *
 * - Extract mock calls from preview config
 * - Resolve and emit mock/automock chunks
 * - Generate a manifest mapping original modules to their mocks
 *
 * @see MockPluginOptions
 */
export function viteMockPlugin(options: MockPluginOptions): Plugin[] {
  // --- Plugin State ---
  let viteConfig: ResolvedConfig;
  let mockCalls: MockCall[] = [];

  const parseFn = (code: string) => {
    const parserOptions: ParserOptions = {
      sourceType: 'module',
      // Enable plugins to handle modern JavaScript features, including TSX.
      plugins: ['typescript', 'jsx', 'classProperties', 'objectRestSpread'],
      errorRecovery: true,
    };
    return parse(code, parserOptions).program;
  };

  // --- Plugin Definition ---
  return [
    {
      name: 'storybook:mock-loader',

      configResolved(config) {
        viteConfig = config;
      },

      buildStart() {
        mockCalls = extractMockCalls(options, parseFn as any, viteConfig.root);
      },

      configureServer(server) {
        async function invalidateAffectedFiles(file: string) {
          if (file === options.previewConfigPath || file.includes('__mocks__')) {
            // Store the old mocks before updating
            const oldMockCalls = mockCalls;
            // Re-extract mocks to get the latest list
            mockCalls = extractMockCalls(options, parseFn as any, viteConfig.root);

            // Invalidate the preview file
            const previewMod = server.moduleGraph.getModuleById(options.previewConfigPath);
            if (previewMod) {
              server.moduleGraph.invalidateModule(previewMod);
            }

            // Invalidate all current mocks (including optimized/node_modules variants)
            for (const call of mockCalls) {
              invalidateAllRelatedModules(server, call.absolutePath, call.path);
            }

            // Invalidate all removed mocks (present in old, missing in new)
            const newAbsPaths = new Set(mockCalls.map((c) => c.absolutePath));
            for (const oldCall of oldMockCalls) {
              if (!newAbsPaths.has(oldCall.absolutePath)) {
                invalidateAllRelatedModules(server, oldCall.absolutePath, oldCall.path);
              }
            }

            // Force a full browser reload so all affected files are refetched
            server.ws.send({ type: 'full-reload' });

            return [];
          }
        }

        server.watcher.on('change', invalidateAffectedFiles);
        server.watcher.on('add', invalidateAffectedFiles);
        server.watcher.on('unlink', invalidateAffectedFiles);
      },

      async load(id) {
        for (const call of mockCalls) {
          if (call.absolutePath !== id) {
            continue;
          }

          try {
            if (call.redirectPath) {
              return readFileSync(call.redirectPath, 'utf-8');
            } else {
              return null;
            }
          } catch (e) {
            return null;
          }
        }
        return null;
      },
      transform: {
        order: 'pre',
        handler(code, id) {
          for (const call of mockCalls) {
            const preserveSymlinks = viteConfig.resolve.preserveSymlinks;

            const idNorm = normalizePathForComparison(id, preserveSymlinks);
            const callNorm = normalizePathForComparison(call.absolutePath, preserveSymlinks);

            if (callNorm !== idNorm && viteConfig.command !== 'serve') {
              continue;
            }

            const cleanId = getCleanId(idNorm);

            if (viteConfig.command === 'serve' && call.path !== cleanId && callNorm !== idNorm) {
              continue;
            }

            try {
              if (!call.redirectPath) {
                const automockedCode = getAutomockCode(code, call.spy, parseFn as any);

                return {
                  code: automockedCode.toString(),
                  map: automockedCode.generateMap(),
                };
              } else {
                return readFileSync(call.redirectPath, 'utf-8');
              }
            } catch (e) {
              logger.error(`Error automocking ${id}: ${e}`);
              return null;
            }
          }
          return null;
        },
      },
    },
  ];
}
