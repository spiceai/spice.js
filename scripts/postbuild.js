#!/usr/bin/env node

/**
 * Post-build script to copy proto file to the Node.js dist folder
 */

const fs = require('fs');
const path = require('path');

// Create proto directory in Node.js dist
const nodeProtoDir = path.join(__dirname, '../dist/node/proto');
fs.mkdirSync(nodeProtoDir, { recursive: true });

// Copy proto file
const protoSrc = path.join(__dirname, '../proto/Flight.proto');
const protoDest = path.join(nodeProtoDir, 'Flight.proto');
fs.copyFileSync(protoSrc, protoDest);

console.log('Proto file copied to dist/node/proto/');
