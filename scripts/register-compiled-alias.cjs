const Module = require("node:module");
const path = require("node:path");

const aliasRoot = process.env.IMAGINE_COMPILED_ALIAS_ROOT;

if (!aliasRoot) {
  throw new Error("IMAGINE_COMPILED_ALIAS_ROOT is required");
}

const absoluteAliasRoot = path.resolve(aliasRoot);
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveCompiledAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(absoluteAliasRoot, request.slice(2)),
      parent,
      isMain,
      options,
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
