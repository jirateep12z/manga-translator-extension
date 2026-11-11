// A stylesheet that imports Tailwind with source(none) generates utilities only
// from its @source paths, so a file with class names that is missing from that
// list loses its styles without any build error. These checks find such files
// by following each page's static imports.
import path from 'node:path';

const IMPORT_PATTERN =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^;]*?)\s+from\s+(['"])([^'"]+)\3|(?:^|\n)\s*import\s+(['"])([^'"]+)\5/g;
const SOURCE_DIRECTIVE_PATTERN = /@source\s+(not\s+)?(['"])([^'"]+)\2/g;
const RESTRICTED_SOURCES_PATTERN = /source\(\s*none\s*\)/;
// A file that renders or builds class names: JSX className, a cva() variant
// table, or a call to the Cn() class joiner (not its definition).
const CLASS_NAME_MARKER_PATTERN =
  /\bclassName\b|\bcva\(|(?<!function\s+)\bCn\(/;
const GLOB_CHARACTER_PATTERN = /[*?{}[\]]/;
const SOURCE_ALIAS_PREFIX = '@/';
const MODULE_EXTENSIONS = ['.ts', '.tsx'];

// True when every named binding in an import or export clause is type-only,
// such as `{ type A, type B }`; the bundler drops such statements.
function IsTypeOnlyClause(clause) {
  const named_bindings = clause.match(/\{([\s\S]*)\}/);

  if (!named_bindings) return false;

  const binding_names = named_bindings[1]
    .split(',')
    .map(binding_name => binding_name.trim())
    .filter(Boolean);

  return (
    binding_names.length > 0 &&
    binding_names.every(binding_name => binding_name.startsWith('type '))
  );
}

// The module specifiers of the import and re-export statements that load code
// at runtime, without query suffixes such as '?inline'.
export function ListValueImportSpecifiers(source_text) {
  const specifiers = [];

  for (const match of source_text.matchAll(IMPORT_PATTERN)) {
    const is_type_only = Boolean(match[1]) || IsTypeOnlyClause(match[2] ?? '');

    if (is_type_only) continue;

    const specifier = match[4] ?? match[6];

    specifiers.push(specifier.split('?')[0]);
  }

  return specifiers;
}

// The source file that a specifier names, or null for a package or a
// non-TypeScript file.
async function ResolveSourceFile(importer_path, specifier, src_dir, IsFile) {
  let base_path;

  if (specifier.startsWith(SOURCE_ALIAS_PREFIX)) {
    base_path = path.join(src_dir, specifier.slice(SOURCE_ALIAS_PREFIX.length));
  } else if (specifier.startsWith('.')) {
    base_path = path.resolve(path.dirname(importer_path), specifier);
  } else {
    return null;
  }

  const candidate_paths = [
    base_path,
    ...MODULE_EXTENSIONS.map(extension => base_path + extension),
    ...MODULE_EXTENSIONS.map(extension =>
      path.join(base_path, `index${extension}`)
    )
  ].filter(candidate_path =>
    MODULE_EXTENSIONS.includes(path.extname(candidate_path))
  );

  for (const candidate_path of candidate_paths) {
    if (await IsFile(candidate_path)) return candidate_path;
  }

  return null;
}

// Every source file reachable from the entries through runtime imports, each
// mapped to the file that first imported it (null for an entry).
export async function MapReachableFiles({
  entry_paths,
  src_dir,
  ReadText,
  IsFile
}) {
  const importer_by_file = new Map(
    entry_paths.map(entry_path => [entry_path, null])
  );
  let pending_paths = [...entry_paths];

  while (pending_paths.length > 0) {
    const imports_per_file = await Promise.all(
      pending_paths.map(async importer_path => ({
        importer_path,
        specifiers: ListValueImportSpecifiers(await ReadText(importer_path))
      }))
    );
    const next_paths = [];

    for (const { importer_path, specifiers } of imports_per_file) {
      const resolved_paths = await Promise.all(
        specifiers.map(specifier =>
          ResolveSourceFile(importer_path, specifier, src_dir, IsFile)
        )
      );

      for (const resolved_path of resolved_paths) {
        if (resolved_path === null || importer_by_file.has(resolved_path)) {
          continue;
        }

        importer_by_file.set(resolved_path, importer_path);
        next_paths.push(resolved_path);
      }
    }

    pending_paths = next_paths;
  }

  return importer_by_file;
}

// The absolute @source paths of a stylesheet, split into literal paths and
// glob patterns; excluded (`@source not`) paths are ignored.
export function ParseSourcePaths(css_text, css_path) {
  const literal_paths = [];
  const glob_paths = [];

  for (const match of css_text.matchAll(SOURCE_DIRECTIVE_PATTERN)) {
    const is_exclusion = Boolean(match[1]);

    if (is_exclusion) continue;

    const source_path = match[3];

    if (GLOB_CHARACTER_PATTERN.test(source_path)) {
      glob_paths.push(source_path);
    } else {
      literal_paths.push(path.resolve(path.dirname(css_path), source_path));
    }
  }

  return { literal_paths, glob_paths };
}

// True when the file is a listed path or lies inside a listed directory.
export function IsCoveredBySourcePaths(file_path, source_paths) {
  return source_paths.some(source_path => {
    const relative_path = path.relative(source_path, file_path);

    return (
      relative_path === '' ||
      (!relative_path.startsWith('..') && !path.isAbsolute(relative_path))
    );
  });
}

export async function FindTailwindSourceProblems({
  pages,
  root_dir,
  ReadText,
  IsFile
}) {
  const src_dir = path.join(root_dir, 'src');
  const ToDisplayPath = file_path =>
    path.relative(root_dir, file_path).replaceAll('\\', '/');
  const problems_per_page = await Promise.all(
    pages.map(async page => {
      const css_path = path.join(root_dir, page.css_path);
      const css_text = await ReadText(css_path);

      // Without source(none), Tailwind scans the whole project.
      if (!RESTRICTED_SOURCES_PATTERN.test(css_text)) return [];

      const { literal_paths, glob_paths } = ParseSourcePaths(
        css_text,
        css_path
      );

      if (glob_paths.length > 0) {
        return [
          `${page.css_path} uses glob @source paths (${glob_paths.join(', ')}); this check supports only file and directory paths.`
        ];
      }

      const importer_by_file = await MapReachableFiles({
        entry_paths: page.entry_paths.map(entry_path =>
          path.join(root_dir, entry_path)
        ),
        src_dir,
        ReadText,
        IsFile
      });
      const uncovered_files = await Promise.all(
        [...importer_by_file.keys()].map(async file_path => {
          if (IsCoveredBySourcePaths(file_path, literal_paths)) return null;

          const has_class_names = CLASS_NAME_MARKER_PATTERN.test(
            await ReadText(file_path)
          );

          return has_class_names ? file_path : null;
        })
      );

      return uncovered_files
        .filter(file_path => file_path !== null)
        .map(file_path => {
          const importer_path = importer_by_file.get(file_path);
          const imported_from =
            importer_path === null
              ? 'an entry point'
              : `imported by ${ToDisplayPath(importer_path)}`;

          return `${page.css_path} has no @source for ${ToDisplayPath(file_path)} (${imported_from}); the ${page.name} page would lose its styles.`;
        });
    })
  );

  return problems_per_page.flat();
}
