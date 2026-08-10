import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import ts from 'typescript';

const repoRoot = process.cwd();
const sourceRoot = path.join(repoRoot, 'src');
const iconGatewayPath = path.join(sourceRoot, 'components', 'ui', 'icons.ts');
const iconGatewaySpecifier = '@/components/ui/icons';
const lucideRootSpecifier = 'lucide-react-native';
const lucideIconPrefix = 'lucide-react-native/icons/';

function collectProductionSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : collectProductionSourceFiles(entryPath);
    }
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      return [];
    }
    return [entryPath];
  });
}

function isRuntimeImport(importClause) {
  if (!importClause || importClause.isTypeOnly) {
    return false;
  }
  if (importClause.name) {
    return true;
  }
  if (!importClause.namedBindings || !ts.isNamedImports(importClause.namedBindings)) {
    return true;
  }
  return importClause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function collectImportedRuntimeNames(importClause) {
  if (!importClause || importClause.isTypeOnly || !importClause.namedBindings || !ts.isNamedImports(importClause.namedBindings)) {
    return [];
  }
  return importClause.namedBindings.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => (element.propertyName ?? element.name).text);
}

function sourceLocation(sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${path.relative(repoRoot, sourceFile.fileName)}:${line + 1}`;
}

const violations = [];
const importedRuntimeIcons = new Set();

for (const filePath of collectProductionSourceFiles(sourceRoot)) {
  const sourceFile = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier === lucideRootSpecifier && filePath !== iconGatewayPath && isRuntimeImport(node.importClause)) {
        violations.push(`${sourceLocation(sourceFile, node)} imports the Lucide runtime root`);
      }
      if (specifier.startsWith(lucideIconPrefix) && filePath !== iconGatewayPath) {
        violations.push(`${sourceLocation(sourceFile, node)} bypasses the internal icon gateway`);
      }
      if (specifier === iconGatewaySpecifier) {
        for (const name of collectImportedRuntimeNames(node.importClause)) {
          importedRuntimeIcons.add(name);
        }
      }
    }

    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
      const specifier = node.arguments[0].text;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      if ((isRequire || isDynamicImport) && (specifier === lucideRootSpecifier || specifier.startsWith(lucideIconPrefix))) {
        violations.push(`${sourceLocation(sourceFile, node)} dynamically loads Lucide outside the internal gateway`);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const gatewaySource = ts.createSourceFile(
  iconGatewayPath,
  fs.readFileSync(iconGatewayPath, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const gatewayRuntimeIcons = new Map();

for (const statement of gatewaySource.statements) {
  if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
    continue;
  }
  const specifier = statement.moduleSpecifier.text;
  if (!specifier.startsWith(lucideIconPrefix) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
    violations.push(`${sourceLocation(gatewaySource, statement)} must export one named icon from an official Lucide icons/* subpath`);
    continue;
  }
  for (const element of statement.exportClause.elements) {
    gatewayRuntimeIcons.set(element.name.text, specifier.slice(lucideIconPrefix.length));
  }
}

const lucidePackageRoot = path.join(repoRoot, 'node_modules', 'lucide-react-native');
const lucideRootModule = fs.readFileSync(path.join(lucidePackageRoot, 'dist', 'esm', 'lucide-react-native.mjs'), 'utf8');
const officialIconPaths = new Map();

for (const line of lucideRootModule.split('\n')) {
  const match = line.match(/^export \{ (.+) \} from '\.\/icons\/([^']+)\.mjs';$/);
  if (!match) {
    continue;
  }
  for (const exportPart of match[1].split(', ')) {
    const aliasMatch = exportPart.match(/\bas ([A-Za-z0-9_$]+)$/);
    if (aliasMatch) {
      officialIconPaths.set(aliasMatch[1], match[2]);
    }
  }
}

for (const [name, iconPath] of gatewayRuntimeIcons) {
  if (officialIconPaths.get(name) !== iconPath) {
    violations.push(`src/components/ui/icons.ts maps ${name} to ${iconPath}, but the locked Lucide package maps it to ${officialIconPaths.get(name) ?? 'nothing'}`);
  }
  if (!fs.existsSync(path.join(lucidePackageRoot, 'dist', 'esm', 'icons', `${iconPath}.mjs`))) {
    violations.push(`src/components/ui/icons.ts references missing runtime icon ${iconPath}`);
  }
  if (!importedRuntimeIcons.has(name)) {
    violations.push(`src/components/ui/icons.ts exports unused runtime icon ${name}`);
  }
}

for (const name of importedRuntimeIcons) {
  if (!gatewayRuntimeIcons.has(name)) {
    violations.push(`${iconGatewaySpecifier} does not export imported runtime icon ${name}`);
  }
}

if (violations.length > 0) {
  console.error(['Lucide import boundary check failed:', ...violations.map((violation) => `- ${violation}`)].join('\n'));
  process.exit(1);
}

console.log(`Lucide import boundary OK (${gatewayRuntimeIcons.size} runtime icons).`);
