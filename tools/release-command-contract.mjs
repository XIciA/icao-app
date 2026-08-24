#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export function assertExpoPrebuildCommand(
  source,
  { label, platform = 'ios', requireClean = true, requireNoInstall = true },
) {
  const commands = findExpoPrebuildCommands(source);
  if (commands.length !== 1) {
    throw new Error(
      `${label} must contain exactly one executable pnpm exec expo prebuild command; found ${commands.length}.`,
    );
  }

  for (const command of commands) {
    const platforms = optionValues(command, '--platform');
    if (platforms.length !== 1 || platforms[0] !== platform) {
      throw new Error(`${label} Expo prebuild must target exactly one --platform ${platform}.`);
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
  return tokenizeShellCommands(source).flatMap((tokens) => {
    const commandStart = tokens.findIndex(
      (token, index) =>
        token === 'pnpm' &&
        tokens[index + 1] === 'exec' &&
        tokens[index + 2] === 'expo' &&
        tokens[index + 3] === 'prebuild' &&
        isCommandPrefix(tokens.slice(0, index)),
    );
    return commandStart < 0 ? [] : [tokens.slice(commandStart)];
  });
}

function isCommandPrefix(tokens) {
  if (tokens.length === 0) return true;
  const assignments = tokens[0] === 'env' ? tokens.slice(1) : tokens;
  return assignments.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=/u.test(token));
}

function optionValues(command, option) {
  const values = [];
  for (let index = 0; index < command.length; index += 1) {
    const token = command[index];
    if (token === option) {
      values.push(command[index + 1]);
      index += 1;
    } else if (token.startsWith(`${option}=`)) {
      values.push(token.slice(option.length + 1));
    }
  }
  return values;
}

function tokenizeShellCommands(source) {
  const commands = [];
  let tokens = [];
  let token = '';
  let quote;
  let escaped = false;
  let comment = false;
  let pendingHeredocs = [];

  const pushToken = () => {
    if (!token) return;
    tokens.push(token);
    token = '';
  };
  const pushCommand = () => {
    pushToken();
    if (tokens.length > 0) commands.push(tokens);
    pendingHeredocs.push(...heredocDelimiters(tokens));
    tokens = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      if (character !== '\n') token += character;
      escaped = false;
      continue;
    }
    if (comment) {
      if (character !== '\n') continue;
      comment = false;
      pushCommand();
      index = skipHeredocBodies(source, index, pendingHeredocs);
      pendingHeredocs = [];
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
    if (character === '#' && token.length === 0) {
      comment = true;
      continue;
    }
    if (character === '\n') {
      pushCommand();
      index = skipHeredocBodies(source, index, pendingHeredocs);
      pendingHeredocs = [];
      continue;
    }
    if (/\s/u.test(character)) {
      pushToken();
      continue;
    }
    if (character === ';' || character === '|') {
      pushCommand();
      if (source[index + 1] === character) index += 1;
      continue;
    }
    if (character === '&' && source[index + 1] === '&') {
      pushCommand();
      index += 1;
      continue;
    }
    token += character;
  }
  pushCommand();
  return commands;
}

function heredocDelimiters(tokens) {
  const delimiters = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('<<<')) continue;
    const separateDelimiter = token.match(/^\d*<<(-?)$/u);
    const attachedDelimiter = token.match(/^\d*<<(-?)(.+)$/u);
    if (separateDelimiter) {
      if (tokens[index + 1]) {
        delimiters.push({
          value: tokens[index + 1],
          stripTabs: separateDelimiter[1] === '-',
        });
        index += 1;
      }
    } else if (attachedDelimiter) {
      delimiters.push({
        value: attachedDelimiter[2],
        stripTabs: attachedDelimiter[1] === '-',
      });
    }
  }
  return delimiters;
}

function skipHeredocBodies(source, newlineIndex, heredocs) {
  let index = newlineIndex;
  for (const heredoc of heredocs) {
    while (index < source.length) {
      const lineStart = index + 1;
      const nextNewline = source.indexOf('\n', lineStart);
      const lineEnd = nextNewline < 0 ? source.length : nextNewline;
      const line = source.slice(lineStart, lineEnd).replace(/\r$/u, '');
      const comparable = heredoc.stripTabs ? line.replace(/^\t+/u, '') : line;
      index = lineEnd;
      if (comparable === heredoc.value) break;
    }
  }
  return index;
}

export function runReleaseCommandContractSelfTest() {
  const accepted = [
    'ICAO_APP_VARIANT=production pnpm exec expo prebuild --no-install --clean --platform ios',
    'env ICAO_APP_VARIANT=production pnpm exec expo prebuild --platform=ios --clean --no-install',
    'pnpm exec expo prebuild --clean --platform ios --no-install',
    `pnpm exec expo prebuild \\
      --no-install --platform ios --clean`,
    'true; pnpm exec expo prebuild --clean --no-install --platform ios',
    `cat <<'SCRIPT'
pnpm exec expo prebuild --platform android
SCRIPT
pnpm exec expo prebuild --platform ios --clean --no-install`,
  ];
  for (const source of accepted) {
    assertExpoPrebuildCommand(source, { label: 'self-test' });
  }

  const rejected = [
    'pnpm exec expo prebuild --platform ios --no-install',
    'pnpm exec expo prebuild --platform ios --clean',
    'pnpm exec expo prebuild --platform android --clean --no-install',
    '# pnpm exec expo prebuild --platform ios --clean --no-install',
    "echo 'pnpm exec expo prebuild --platform ios --clean --no-install'",
    'pnpm exec expo prebuild --platform ios && echo --clean --no-install',
    `cat <<'SCRIPT'
pnpm exec expo prebuild --platform ios --clean --no-install
SCRIPT`,
    `cat <<'SCRIPT'; echo waiting
pnpm exec expo prebuild --platform ios --clean --no-install
SCRIPT`,
    `message='not a command
pnpm exec expo prebuild --platform ios --clean --no-install
'`,
    `echo "not a command
pnpm exec expo prebuild --platform ios --clean --no-install
"`,
    'pnpm exec expo prebuild --platform ios --clean --no-install; pnpm exec expo prebuild --platform android --clean --no-install',
    'pnpm exec expo prebuild --platform ios --clean --no-install && pnpm exec expo prebuild --platform android --clean --no-install',
    'pnpm exec expo prebuild --platform ios --platform android --clean --no-install',
  ];
  for (const source of rejected) {
    let wasRejected = false;
    try {
      assertExpoPrebuildCommand(source, { label: 'self-test' });
    } catch {
      wasRejected = true;
    }
    if (!wasRejected) throw new Error(`Release command self-test accepted: ${source}`);
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
