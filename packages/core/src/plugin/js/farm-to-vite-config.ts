import type { UserConfig as ViteUserConfig } from 'vite';
import type { UserConfig } from '../../config/types.js';
import { Logger } from '../../index.js';
import merge from '../../utils/merge.js';
import { EXTERNAL_KEYS, VITE_DEFAULT_ASSETS } from './constants.js';
import {
  deleteUndefinedPropertyDeeply,
  throwIncompatibleError
} from './utils.js';

export function farmUserConfigToViteConfig(config: UserConfig): ViteUserConfig {
  const vitePlugins = config.vitePlugins.filter(Boolean).map((plugin) => {
    if (typeof plugin === 'function') {
      return plugin().vitePlugin;
    } else {
      return plugin;
    }
  });

  let sourcemap = true;

  if (config.compilation?.sourcemap !== undefined) {
    sourcemap = Boolean(config.compilation?.sourcemap);
  }

  const viteConfig: ViteUserConfig = {
    root: config.root,
    base: config.compilation?.output?.publicPath ?? '/',
    publicDir: config.publicDir ?? 'public',
    mode: config.compilation?.mode,
    define: config.compilation?.define,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore ignore this error
    command: config.compilation?.mode === 'production' ? 'build' : 'serve',
    resolve: {
      alias: config.compilation?.resolve?.alias,
      extensions: config.compilation?.resolve?.extensions,
      mainFields: config.compilation?.resolve?.mainFields,
      conditions: config.compilation?.resolve?.conditions,
      preserveSymlinks: config.compilation?.resolve?.symlinks === false,
      dedupe: config.compilation?.resolve?.dedupe
    },
    plugins: vitePlugins,
    server: {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore ignore error
      hmr: config.server?.hmr,
      port: config.server?.port,
      host: config.server?.host,
      strictPort: config.server?.strictPort,
      https: config.server?.https,
      proxy: config.server?.proxy as any,
      open: config.server?.open,
      watch:
        typeof config.server?.hmr === 'object'
          ? config.server.hmr?.watchOptions ?? {}
          : {}
      // other options are not supported in farm
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore ignore this error
    isProduction: config.compilation?.mode === 'production',
    css: config.compilation?.css?._viteCssOptions ?? {},
    build: {
      outDir: config.compilation?.output?.path,
      sourcemap,
      minify:
        config.compilation?.minify !== undefined
          ? Boolean(config.compilation?.minify)
          : undefined,
      cssMinify:
        config.compilation?.minify !== undefined
          ? Boolean(config.compilation?.minify)
          : undefined,
      ssr: config.compilation?.output?.targetEnv === 'node',
      rollupOptions: {
        output: {
          assetFileNames: config.compilation?.output?.assetsFilename,
          entryFileNames: config.compilation?.output?.entryFilename,
          chunkFileNames: config.compilation?.output?.filename
        }
      }
      // other options are not supported in farm
    },
    // TODO make it configurable
    cacheDir: 'node_modules/.farm/cache',
    envDir: config.envDir,
    assetsInclude: [
      ...VITE_DEFAULT_ASSETS,
      ...(config.compilation?.assets?.include ?? [])
    ],
    experimental: {}
  };

  return viteConfig;
}

function getTargetField(
  target: any = {},
  key: string | symbol,
  allowedKeys: string[],
  contextInfo: {
    pluginName: string;
    keyName: string;
  },
  getter?: (target: any, key: string) => any
): any {
  if (typeof key !== 'string') {
    return target[key as unknown as keyof typeof target];
  }

  if (EXTERNAL_KEYS.includes(key)) {
    return (target as Record<string, any>)[key];
  }

  if (allowedKeys.includes(String(key))) {
    if (getter) {
      return getter(target, key);
    } else {
      return target[key];
    }
  }

  throw throwIncompatibleError(
    contextInfo.pluginName,
    contextInfo.keyName,
    allowedKeys,
    key
  );
}

function createProxyObj(
  pluginName: string,
  keyName: string,
  allowedKeys: string[],
  obj: any = {}
) {
  return new Proxy(obj || {}, {
    get(target, key) {
      return getTargetField(target, key, allowedKeys, {
        pluginName,
        keyName
      });
    }
  });
}

function mapResolve(pluginName: string, obj: any = {}) {
  const allowedResolveKeys = [
    'alias',
    'extensions',
    'mainFields',
    'conditions',
    'preserveSymlinks',
    // farm do not set any thing for dedupe, it should always be undefined
    'dedupe'
  ];

  return createProxyObj(
    pluginName,
    'viteConfig.resolve',
    allowedResolveKeys,
    obj
  );
}

function mapServer(pluginName: string, obj: any = {}) {
  const allowedServerKeys = [
    'hmr',
    'port',
    'host',
    'strictPort',
    'https',
    'proxy',
    'open',
    'origin',
    'watch'
  ];

  return createProxyObj(
    pluginName,
    'viteConfig.server',
    allowedServerKeys,
    obj
  );
}

function mapCss(pluginName: string, obj: any = {}) {
  const allowedCssKeys = [
    'devSourcemap',
    'transformer',
    'modules',
    'postcss',
    'preprocessorOptions'
  ];

  return createProxyObj(pluginName, 'viteConfig.css', allowedCssKeys, obj);
}

function mapBuild(pluginName: string, obj: any = {}) {
  const allowedBuildKeys = [
    'outDir',
    'sourcemap',
    'minify',
    'cssMinify',
    'ssr',
    'watch',
    'rollupOptions',
    'assetsDir'
  ];

  return createProxyObj(pluginName, 'viteConfig.build', allowedBuildKeys, obj);
}

export function proxyViteConfig(
  viteConfig: ViteUserConfig,
  pluginName: string,
  logger: Logger
): ViteUserConfig {
  return new Proxy(viteConfig, {
    get(target, key) {
      const allowedKeys = [
        'root',
        'base',
        'publicDir',
        'mode',
        'define',
        'command',
        'resolve',
        'plugins',
        'server',
        'isProduction',
        'css',
        'build',
        'logger',
        'cacheDir',
        'envDir',
        'assetsInclude',
        // these fields are always undefined in farm
        // they are only used for compatibility
        'legacy',
        'optimizeDeps',
        'ssr',
        'logLevel',
        'experimental',
        'test',
        'clearScreen',
        'customLogger',
        // compat @vanilla-extract/vite-plugin
        // these options are undefined now
        'configFile',
        'inlineConfig'
      ];

      return getTargetField(
        target,
        key,
        allowedKeys,
        {
          pluginName,
          keyName: 'viteConfig'
        },
        (target, key) => {
          const keyMapper: Record<
            string,
            (pluginName: string, obj: any) => any
          > = {
            resolve: mapResolve,
            server: mapServer,
            css: mapCss,
            build: mapBuild,
            optimizeDeps: (pluginName: string, obj: any = {}) => {
              return new Proxy(obj || {}, {
                get(_, optimizeDepsKey) {
                  logger.warnOnce(
                    `[vite-plugin] ${pluginName}: config "optimizeDeps" is not needed in farm, all of its options will be ignored. Current ignored option is: "${String(
                      optimizeDepsKey
                    )}"`
                  );

                  if (optimizeDepsKey === 'esbuildOptions') {
                    return {};
                  }
                  return undefined;
                }
              });
            },
            logger: () => {
              return logger;
            },
            assetsInclude: () => {
              return (filename: string) => {
                return (
                  (viteConfig.assetsInclude as string[])?.some((r) => {
                    return new RegExp(r).test(filename);
                  }) ?? false
                );
              };
            }
          };

          return keyMapper[key]
            ? keyMapper[key](pluginName, target[key])
            : target[key as keyof typeof target];
        }
      );
    }
  });
}

export function viteConfigToFarmConfig(
  config: ViteUserConfig,
  origFarmConfig: UserConfig,
  _pluginName: string
): UserConfig {
  const farmConfig: UserConfig = {
    compilation: {}
  };

  if (config.root) {
    farmConfig.root = config.root;
  }
  if (config?.css) {
    farmConfig.compilation.css ??= {};
    farmConfig.compilation.css._viteCssOptions = config.css;
  }

  if (config.base) {
    farmConfig.compilation.output ??= {};
    farmConfig.compilation.output.publicPath = config.base;
  }
  if (config.publicDir) {
    farmConfig.publicDir = config.publicDir;
  }
  if (config.mode === 'development' || config.mode === 'production') {
    farmConfig.compilation.mode = config.mode;
  }
  if (config.define) {
    farmConfig.compilation.define = config.define;
  }

  if (config.resolve) {
    farmConfig.compilation.resolve ??= {};

    if (config.resolve.alias) {
      if (!Array.isArray(config.resolve.alias)) {
        farmConfig.compilation.resolve.alias = config.resolve.alias as Record<
          string,
          any
        >;
      } else {
        if (!farmConfig.compilation.resolve.alias) {
          farmConfig.compilation.resolve.alias = {};
        }

        const farmRegexPrefix = '$__farm_regex:';

        for (const { find, replacement } of config.resolve.alias) {
          if (find instanceof RegExp) {
            const key = farmRegexPrefix + find.source;
            farmConfig.compilation.resolve.alias[key] = replacement;
          } else {
            farmConfig.compilation.resolve.alias[find] = replacement;
          }
        }
      }
    }

    farmConfig.compilation.resolve.extensions = config.resolve.extensions;
    farmConfig.compilation.resolve.mainFields = config.resolve.mainFields;
    farmConfig.compilation.resolve.conditions = config.resolve.conditions;
    farmConfig.compilation.resolve.symlinks =
      config.resolve.preserveSymlinks != true;
  }

  if (config.server) {
    farmConfig.server ??= {};
    farmConfig.server.hmr = config.server.hmr;
    farmConfig.server.port = config.server.port;

    if (config.server.watch) {
      if (
        farmConfig.server?.hmr === true ||
        farmConfig.server?.hmr === undefined
      ) {
        farmConfig.server.hmr = {
          ...(typeof origFarmConfig?.server?.hmr === 'object'
            ? origFarmConfig.server.hmr
            : {}),
          watchOptions: config.server.watch
        };
      }
    }

    if (typeof config.server.host === 'string') {
      farmConfig.server.host = config.server.host;
    }

    farmConfig.server.strictPort = config.server.strictPort;
    farmConfig.server.https =
      typeof config.server.https === 'boolean'
        ? undefined
        : config.server.https;
    farmConfig.server.proxy = config.server.proxy as any;
    farmConfig.server.open = Boolean(config.server.open);
  }

  if (config.build) {
    farmConfig.compilation.output ??= {};
    farmConfig.compilation.output.path = config.build.outDir;

    if (
      config.build?.sourcemap !== undefined &&
      origFarmConfig.compilation?.sourcemap === undefined
    ) {
      farmConfig.compilation.sourcemap = Boolean(config.build.sourcemap);
    }

    if (
      config.build.ssr !== undefined &&
      origFarmConfig.compilation?.lazyCompilation === undefined
    ) {
      farmConfig.compilation.lazyCompilation = !config.build.ssr;
    }

    if (config.build.rollupOptions?.output !== undefined) {
      if (!Array.isArray(config.build.rollupOptions.output)) {
        const keys = ['assetFileNames', 'entryFilename', 'filename'];

        for (const k of keys) {
          /* eslint-disable @typescript-eslint/ban-ts-comment */
          // @ts-ignore type is correct
          farmConfig.compilation.output[k] =
            // @ts-ignore type is correct
            config.build.rollupOptions.output[k];
        }
      }
    }
  }

  deleteUndefinedPropertyDeeply(farmConfig);

  return merge({}, origFarmConfig, farmConfig);
}
