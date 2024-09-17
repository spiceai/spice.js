#!/bin/node

const fs = require('fs');
const packageJson = require('../package.json');
const version = packageJson.version;

const fileContents = `export const VERSION = '${version}';\n`;

fs.writeFileSync('src/version.ts', fileContents);