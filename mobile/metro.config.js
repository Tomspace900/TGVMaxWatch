// Metro ne surveille que le dossier du projet par defaut. Les modules purs
// partages avec le collecteur — config, dates, duration, types, stats,
// watchlist — vivent a la racine du depot : sans ces deux reglages, ils sont
// introuvables depuis mobile/ et il faudrait les dupliquer.
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(repoRoot, 'node_modules'),
];

module.exports = config;
