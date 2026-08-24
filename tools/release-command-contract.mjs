#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const COMMAND_BREAKS = new Set([';', '&&', '||', '|']);

export function assertExpoPrebuildCommand(
  source,
  { label, platform = 'ios', requireClean = true, requireNoInstall = true },
) {
  const commands = findExpoPrebuildCommands(source);
  if (commands.length === 0) {
    throw new Error(`${label} must run pnpm exec expo prebuild.`);
  }

  for (const command of commands) {
    const actualPlatform = optionValue(command, '--platform');
    if (actualPlatform !== platform) {
      throw new Error(`${label} Expo prebuild must target --platform ${platform}.`);
    }
    if (requireClean && !command.includes('--clean')) {
      throw new Error(`${label} Expo prebuild must include --clean.`);
    }
    if (requireNoInstall && !command.includes('--no-install')) {
      throw new Error(`${label} Expo prebuild must include --no-install.`);
    }
  }
}

export function findExpoPrebuildCommands(source) {
  const logicalLines = source.replace(/\\\r?\n/gu, ' ').split(/\r?\n/gu);
  return logicalLines.flatMap((line) => {
    const tokens = tokenizeShellLine(line);
    const commandStart = tokens.findIndex(
      (token, index) =>
        token === 'pnpm' &&
        tokens[index + 1] === 'exec' &&
        tokens[index + 2] === 'expo' &&
        tokens[index + 3] === 'prebuild' &&
        isCommandPrefix(tokens.slice(0, index)),
    );
    if (commandStart < 0) return [];
    const commandEnd = tokens.findIndex(
      (token, index) => index > commandStart && COMMAND_BREAKS.has(token),
    );
    return [tokens.slice(commandStart, commandEnd < 0 ? undefined : commandEnd)];
  });
}

function isCommandPrefix(tokens) {
  if (tokens.length === 0) return true;
  const assignments = tokens[0] === 'env' ? tokens.slice(1) : tokens;
  return assignments.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=/u.test(token));
}

function optionValue(command, option) {
  const equalsForm = command.find((token) => token.startsWith(`${option}=`));
  if (equalsForm) return equalsForm.slice(option.length + 1);
  const optionIndex = command.indexOf(option);
  return optionIndex < 0 ? undefined : command[optionIndex + 1];
}

function tokenizeShellLine(line) {
  const tokens = [];
  let token = '';
  let quote;
  let escaped = false;
  const push = () => {
    if (!token) return;
    tokens.push(token);
    token = '';
  };

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '#' && token.length === 0) break;
    if (/\s/u.test(character)) {
      push();
      continue;
    }
    if (character === ';' || character === '|') {
      push();
      if (line[index + 1] === character) {
        tokens.push(`${character}${character}`);
        index += 1;
      } else {
        tokens.push(character);
      }
      continue;
    }
    if (character === '&' && line[index + 1] === '&') {
      push();
      tokens.push('&&');
      index += 1;
      continue;
    }
    token += character;
  }
  push();
  return tokens;
}

export function runReleaseCommandContractSelfTest() {
  const accepted = [
    'ICAO_APP_VARIANT=production pnpm exec expo prebuild --no-install --clean --platform ios',
    'env ICAO_APP_VARIANT=production pnpm exec expo prebuild --platform=ios --clean --no-install',
    'pnpm exec expo prebuild --clean --platform ios --no-install',
    `pnpm exec expo prebuild \\
      --no-install --platform ios --clean`,
  ];
  for (const source of accepted) {
    assertExpoPrebuildCommand(source, { label: 'self-test' });
  }

  for (const source of [
    'pnpm exec expo prebuild --platform ios --no-install',
    'pnpm exec expo prebuild --platform ios --clean',
    'pnpm exec expo prebuild --platform android --clean --no-install',
    '# pnpm exec expo prebuild --platform ios --clean --no-install',
    "echo 'pnpm exec expo prebuild --platform ios --clean --no-install'",
    'pnpm exec expo prebuild --platform ios && echo --clean --no-install',
  ]) {
    let rejected = false;
    try {
      assertExpoPrebuildCommand(source, { label: 'self-test' });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Release command self-test accepted: ${source}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] !== '--self-test') {
      throw new Error('Usage: release-command-contract.mjs --self-test');
    }
    runReleaseCommandContractSelfTest();
    console.log('Release command contract self-test passed');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
