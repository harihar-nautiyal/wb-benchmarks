#!/bin/bash

# Root client deps
npm install ws socket.io-client msgpackr protobufjs mongodb

# Node Folders
for dir in nmn sn wpn; do
  cd $dir
  npm install
  cd ..
done

# Bun Folders (Bun auto-installs on run, but lets cache)
for dir in sb wmb bh be; do
  cd $dir
  bun install
  cd ..
done

# Deno caches on run
