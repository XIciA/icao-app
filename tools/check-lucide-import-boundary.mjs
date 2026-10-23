import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootSpecifier = 'lucide-react-native';
const iconPrefix = `${rootSpecifier}/icons/`;
const gatewaySpecifier = '@/components/ui/icons';
const approvedLightIcons = new Set(['Headphones', 'MessageSquareQuote', 'RadioTower', 'Mic2', 'BookOpenText', 'BookMarked', 'Radio', 'Bot', 'Flame', 'FolderOpen', 'MembershipMark', 'History', 'AnnotationMark', 'WordFavorites', 'GuideMark', 'Settings', 'FeedbackMark', 'LineChart', 'GraduationCap', 'Library', 'Compass', 'UserRound']);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(file);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}
function runtimeElements(node) {
  if (node.isTypeOnly) return [];
  const clause = node.importClause;
  if (clause?.isTypeOnly) return [];
  if (clause?.name) return null;
  const bindings = clause?.namedBindings ?? node.exportClause;
  if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) return bindings.elements.filter(element => !element.isTypeOnly);
  return null; // Namespace, wildcard, default or side-effect runtime access.
}

export function checkLucideBoundary(repoRoot) {
  const ui = path.join(repoRoot, 'src/components/ui');
  const gateway = path.join(ui, 'icons.ts');
  const nativeGateway = path.join(ui, 'icons.native.ts');
  const leaf = path.join(ui, 'lucide-icons.ts');
  const light = path.join(ui, 'light-icons.tsx');
  const gateways = new Set([gateway, ...(fs.existsSync(nativeGateway) ? [nativeGateway] : [])]);
  const sources = new Map(sourceFiles(path.join(repoRoot, 'src')).map(file => [file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)]));
  const violations = [], used = new Set(), official = new Map(), lightExports = new Set();
  const at = (source, node) => `${path.relative(repoRoot, source.fileName)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const lucideRoot = path.join(repoRoot, 'node_modules/lucide-react-native');
  const packageSource = fs.readFileSync(path.join(lucideRoot, 'dist/esm/lucide-react-native.mjs'), 'utf8');
  for (const line of packageSource.split('\n')) {
    const match = line.match(/^export \{ (.+) \} from '\.\/icons\/([^']+)\.mjs';$/);
    if (match) for (const part of match[1].split(', ')) { const alias = part.match(/\bas ([A-Za-z0-9_$]+)$/); if (alias) official.set(alias[1], match[2]); }
  }
  for (const [file, source] of sources) {
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        const elements = runtimeElements(node);
        const runtime = elements === null || elements.length > 0;
        if (specifier === rootSpecifier && runtime) violations.push(`${at(source, node)} imports or re-exports the Lucide runtime root`);
        if (specifier.startsWith(iconPrefix) && (file !== leaf && file !== gateway || !ts.isExportDeclaration(node))) violations.push(`${at(source, node)} bypasses the internal icon gateway`);
        if (runtime && specifier === gatewaySpecifier) {
          if (!elements || node.importClause?.name) violations.push(`${at(source, node)} must use named icon imports`);
          for (const element of elements ?? []) used.add((element.propertyName ?? element.name).text);
        }
        const internal = specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : specifier.replace(/^@\//, `${repoRoot}/src/`);
        if (runtime && [path.join(ui, 'lucide-icons'), path.join(ui, 'light-icons')].includes(internal) && !gateways.has(file)) violations.push(`${at(source, node)} bypasses the public icon gateway`);
      }
      if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
        const specifier = node.arguments[0].text;
        if ((ts.isIdentifier(node.expression) && node.expression.text === 'require' || node.expression.kind === ts.SyntaxKind.ImportKeyword) && (specifier === rootSpecifier || specifier.startsWith(iconPrefix))) violations.push(`${at(source, node)} dynamically loads Lucide`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const statement of sources.get(light)?.statements ?? []) {
    if (ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        const name = ts.isIdentifier(declaration.name) ? declaration.name.text : '';
        if (!approvedLightIcons.has(name) || !declaration.initializer || !ts.isCallExpression(declaration.initializer) || !ts.isIdentifier(declaration.initializer.expression) || declaration.initializer.expression.text !== 'createLightIcon') violations.push(`light-icons.tsx has an unapproved icon declaration ${name}`);
        else lightExports.add(name);
      }
    }
  }
  function exportsFor(file, isLeaf = false) {
    const result = new Map();
    const source = sources.get(file);
    if (!source) { violations.push(`Missing icon gateway ${path.relative(repoRoot, file)}`); return result; }
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
      const elements = runtimeElements(statement);
      if (elements?.length === 0) continue;
      const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
      if (!isLeaf && specifier === './lucide-icons') {
        const inner = exportsFor(leaf, true);
        if (!statement.exportClause) for (const [name, value] of inner) result.set(name, value);
        else if (elements) for (const element of elements) {
          const name = (element.propertyName ?? element.name).text;
          if (!inner.has(name)) violations.push(`${at(source, statement)} references missing gateway icon ${name}`);
          else result.set(element.name.text, inner.get(name));
        }
        else violations.push(`${at(source, statement)} must use named internal exports`);
      } else if (!isLeaf && specifier === './light-icons' && elements) {
        for (const element of elements) {
          const name = (element.propertyName ?? element.name).text;
          if (!approvedLightIcons.has(name) || !lightExports.has(name) || name !== element.name.text) violations.push(`${at(source, statement)} references unapproved or missing light icon ${name}`);
          else result.set(name, 'light');
        }
      } else if (specifier.startsWith(iconPrefix) && elements?.length === 1 && (elements[0].propertyName ?? elements[0].name).text === 'default') {
        const name = elements[0].name.text, icon = specifier.slice(iconPrefix.length);
        if (official.get(name) !== icon) violations.push(`${at(source, statement)} maps ${name} to ${icon}, but the locked Lucide package maps it to ${official.get(name) ?? 'nothing'}`);
        if (!fs.existsSync(path.join(lucideRoot, 'dist/esm/icons', `${icon}.mjs`))) violations.push(`${at(source, statement)} references missing runtime icon ${icon}`);
        result.set(name, icon);
      } else violations.push(`${at(source, statement)} must export one named official icon or a controlled internal gateway`);
    }
    return result;
  }
  for (const file of gateways) {
    const exports = exportsFor(file);
    for (const name of used) if (!exports.has(name)) violations.push(`${path.relative(repoRoot, file)} does not export imported runtime icon ${name}`);
    for (const name of exports.keys()) if (!used.has(name)) violations.push(`${path.relative(repoRoot, file)} exports unused runtime icon ${name}`);
  }
  return { violations, count: used.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkLucideBoundary(process.cwd());
  if (result.violations.length) { console.error(['Lucide import boundary check failed:', ...result.violations.map(message => `- ${message}`)].join('\n')); process.exitCode = 1; }
  else console.log(`Lucide import boundary OK (${result.count} runtime icons).`);
}
