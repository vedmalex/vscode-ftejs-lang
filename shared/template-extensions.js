// Shared template extension mapping and helpers for client and server

/**
 * All recognized template extensions in this extension.
 */
const templateExtensionsAll = ['.njs', '.nhtml', '.nts', '.nmd'];

/**
 * Extensions supported by fte.js Factory for code execution/preview.
 * Markdown templates are not typically executed via Factory.
 */
const templateExtensionsFactory = ['.njs', '.nhtml', '.nts'];

/**
 * Mapping from host/source file extensions to template extensions
 * used by "Convert to template" command.
 */
const hostToTemplateMap = {
  '.ts': '.nts',
  '.tsx': '.nts',
  '.js': '.njs',
  '.jsx': '.njs',
  '.md': '.nmd',
  '.html': '.nhtml',
  '.htm': '.nhtml',
};

/**
 * Returns file path variants for resolving templates by base path.
 * Includes all recognized template extensions plus the bare path.
 */
function getTemplatePathVariants(basePath) {
  return [basePath, ...templateExtensionsAll.map(ext => basePath + ext)];
}

module.exports = {
  templateExtensionsAll,
  templateExtensionsFactory,
  hostToTemplateMap,
  getTemplatePathVariants,
};
