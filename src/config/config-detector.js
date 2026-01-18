const fs = require('fs');
const path = require('path');

const CONFIG_FORMATS = {
  SKYHOOK: 'skyhook',
  KOALA: 'koala'
};

/**
 * Get the path to the Skyhook config file
 * Supports both .skyhook/skyhook.yaml (preferred) and skyhook.yaml (legacy)
 * @param {string} repoPath - Path to the repository root
 * @returns {string|null} - Path to skyhook.yaml if found, null otherwise
 */
function getSkyhookConfigPath(repoPath) {
  // Prefer .skyhook/skyhook.yaml
  const skyhookDirPath = path.join(repoPath, '.skyhook', 'skyhook.yaml');
  if (fs.existsSync(skyhookDirPath)) {
    return skyhookDirPath;
  }

  // Fallback to root skyhook.yaml for backwards compatibility
  const skyhookRootPath = path.join(repoPath, 'skyhook.yaml');
  if (fs.existsSync(skyhookRootPath)) {
    return skyhookRootPath;
  }

  return null;
}

/**
 * Detect which configuration format is present in the repository
 * @param {string} repoPath - Path to the repository root
 * @returns {'skyhook' | 'koala' | null} - Detected config format or null if none found
 */
function detectConfigFormat(repoPath) {
  const skyhookPath = getSkyhookConfigPath(repoPath);
  const koalaPath = path.join(repoPath, '.koala-monorepo.json');

  const hasSkyhook = skyhookPath !== null;
  const hasKoala = fs.existsSync(koalaPath);

  if (hasSkyhook && hasKoala) {
    // Both exist - prefer Skyhook (newer format)
    return CONFIG_FORMATS.SKYHOOK;
  }

  if (hasSkyhook) {
    return CONFIG_FORMATS.SKYHOOK;
  }

  if (hasKoala) {
    return CONFIG_FORMATS.KOALA;
  }

  return null;
}

/**
 * Get configuration file paths for a given format
 * @param {string} repoPath - Path to the repository root
 * @param {'skyhook' | 'koala'} format - Configuration format
 * @returns {Object} - Object containing paths to config files
 */
function getConfigPaths(repoPath, format) {
  if (format === CONFIG_FORMATS.SKYHOOK) {
    const skyhookPath = getSkyhookConfigPath(repoPath);
    return {
      primary: skyhookPath || path.join(repoPath, '.skyhook', 'skyhook.yaml'),
      environmentsDir: null // Will be set from infra repo path if provided
    };
  }

  if (format === CONFIG_FORMATS.KOALA) {
    return {
      primary: path.join(repoPath, '.koala-monorepo.json')
    };
  }

  return null;
}

/**
 * Resolve the configuration format based on explicit input or auto-detection
 * @param {string} repoPath - Path to the repository root
 * @param {string} configFormatInput - User-provided config format ('auto', 'skyhook', 'koala')
 * @returns {'skyhook' | 'koala'} - Resolved config format
 * @throws {Error} - If no valid configuration found
 */
function resolveConfigFormat(repoPath, configFormatInput) {
  if (configFormatInput && configFormatInput !== 'auto') {
    // User explicitly specified format
    const format = configFormatInput.toLowerCase();
    if (format === CONFIG_FORMATS.SKYHOOK || format === CONFIG_FORMATS.KOALA) {
      return format;
    }
    throw new Error(`Invalid config-format: ${configFormatInput}. Must be 'auto', 'skyhook', or 'koala'`);
  }

  // Auto-detect format
  const detected = detectConfigFormat(repoPath);
  if (!detected) {
    throw new Error(
      `No configuration found. Expected '.skyhook/skyhook.yaml', 'skyhook.yaml', or '.koala-monorepo.json' at repository root: ${repoPath}`
    );
  }

  return detected;
}

module.exports = {
  CONFIG_FORMATS,
  detectConfigFormat,
  getConfigPaths,
  getSkyhookConfigPath,
  resolveConfigFormat
};
