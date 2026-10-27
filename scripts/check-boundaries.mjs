import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = ['apps', 'packages'].flatMap((group) =>
  readdirSync(join(root, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join(root, group, entry.name);
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
      return {
        directory,
        manifest,
        dependencies: new Set(
          Object.keys({
            ...manifest.dependencies,
            ...manifest.devDependencies,
            ...manifest.peerDependencies,
          }),
        ),
      };
    }),
);

const inside = (path, directory) => {
  const part = relative(directory, path);
  return part === '' || (!part.startsWith(`..${sep}`) && part !== '..' && !isAbsolute(part));
};
const problems = [];
const graph = new Map(
  packages.map((pkg) => [
    pkg.manifest.name,
    [...pkg.dependencies].filter((name) => name.startsWith('@repo/')),
  ]),
);

for (const pkg of packages) {
  const configPath = ts.findConfigFile(pkg.directory, ts.sys.fileExists, 'tsconfig.json');
  const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile).config : {};
  const options = ts.parseJsonConfigFileContent(config, ts.sys, pkg.directory).options;
  const files = ts.sys.readDirectory(
    pkg.directory,
    ['.ts', '.tsx', '.mjs'],
    ['node_modules', 'dist', '.next', 'test', 'drizzle'],
    ['src/**/*', '*.mjs'],
  );
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const report = (node, message) =>
      problems.push(
        `${relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${message}`,
      );
    function inspect(node) {
      let literal;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        literal = node.moduleSpecifier;
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(source) === 'require')
      )
        literal = node.arguments[0];
      if (literal && ts.isStringLiteralLike(literal)) {
        const specifier = literal.text;
        const bare =
          !specifier.startsWith('.') &&
          !specifier.startsWith('/') &&
          !specifier.startsWith('@/') &&
          !specifier.startsWith('#');
        if (bare && !specifier.startsWith('node:') && !ts.sys.fileExists(specifier)) {
          const name = specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0];
          if (!pkg.dependencies.has(name)) report(node, `Undeclared dependency ${name}`);
          if (name?.startsWith('@repo/')) {
            const target = packages.find((candidate) => candidate.manifest.name === name);
            if (!target) report(node, `Unknown workspace package ${name}`);
            else {
              if (inside(target.directory, join(root, 'apps')))
                report(node, 'Applications cannot be imported by other projects');
              const subpath = specifier === name ? '.' : `.${specifier.slice(name.length)}`;
              if (!Object.hasOwn(target.manifest.exports ?? {}, subpath))
                report(node, `Non-public package import ${specifier}`);
            }
          }
        }
        const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule
          ?.resolvedFileName;
        const target = resolved && realpathSync(resolved);
        const location = relative(pkg.directory, file).split(sep).join('/');
        if (target && !inside(target, pkg.directory) && !bare)
          report(node, 'Relative or aliased import crosses a workspace package boundary');
        if (location.includes('/domain/')) {
          const domainRoot = file.slice(
            0,
            file.indexOf(`${sep}domain${sep}`) + `${sep}domain`.length,
          );
          if (bare || !target || !inside(target, domainRoot))
            report(node, 'Domain code may depend only on its own domain');
        }
        if (
          location.includes('/application/') &&
          (bare || /\/(infrastructure|presentation)\//.test(target?.split(sep).join('/') ?? ''))
        )
          report(node, 'Use cases must depend inward on domain ports, not frameworks or adapters');
        if (pkg.manifest.name === '@repo/web' && location.startsWith('src/features/')) {
          const featureRoot = join(pkg.directory, 'src/features', location.split('/')[2]);
          if (target && inside(target, join(pkg.directory, 'src/app')))
            report(node, 'Features cannot import the application layer');
          if (
            target &&
            inside(target, join(pkg.directory, 'src/features')) &&
            !inside(target, featureRoot)
          )
            report(node, 'Compose different features at the application layer');
        }
        if (
          pkg.manifest.name === '@repo/web' &&
          location.startsWith('src/lib/') &&
          target &&
          inside(target, join(pkg.directory, 'src/features'))
        )
          report(node, 'Shared libraries cannot import features');
        if (
          pkg.manifest.name === '@repo/web' &&
          !location.includes('/server/') &&
          !location.startsWith('src/app/api/') &&
          target &&
          inside(target, join(pkg.directory, 'src/lib/server'))
        )
          report(node, 'Server-only modules cannot enter browser features');
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
}

function checkCycle(name, path = []) {
  if (path.includes(name)) {
    problems.push(`Workspace dependency cycle: ${[...path, name].join(' -> ')}`);
    return;
  }
  for (const dependency of graph.get(name) ?? []) checkCycle(dependency, [...path, name]);
}
for (const name of graph.keys()) checkCycle(name);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Package and layer boundaries verified across ${packages.length} workspace projects.`,
  );
