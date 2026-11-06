/* eslint-disable @typescript-eslint/no-require-imports */
// Mock server-only for standalone performance scripts in plain Node
const Module = require("module");
const orig = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "server-only") return {};
  return orig.apply(this, arguments);
};
