const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules/.pnpm/node_modules")
];

// Next.js and Expo can resolve different React 19 patch or minor versions.
// Resolve React and its JSX runtimes through this app for native and Expo Web,
// including imports originating in hoisted Expo packages such as vector-icons.
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const requestedModule = moduleName === "react" || moduleName.startsWith("react/")
    ? require.resolve(moduleName, { paths: [projectRoot] })
    : moduleName;
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, requestedModule, platform)
    : context.resolveRequest(context, requestedModule, platform);
};

module.exports = config;
