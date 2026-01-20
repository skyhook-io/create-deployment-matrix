const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { glob } = require('glob');
const { getSkyhookConfigPath } = require('./config-detector');

/**
 * Convert camelCase to snake_case
 * @param {string} str - camelCase string
 * @returns {string} - snake_case string
 */
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Normalize object keys from camelCase to snake_case
 * @param {Object} obj - Object with camelCase keys
 * @returns {Object} - Object with snake_case keys
 */
function normalizeKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }

  const normalized = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = camelToSnake(key);
    normalized[snakeKey] = value;
  }
  return normalized;
}

/**
 * Normalize a service object - converts camelCase to snake_case
 * @param {Object} service - Service configuration object
 * @returns {Object} - Normalized service object
 */
function normalizeService(service) {
  const normalized = normalizeKeys(service);

  // Map deploymentRepo to repo for compatibility
  if (normalized.deployment_repo && !normalized.repo) {
    normalized.repo = normalized.deployment_repo;
  }

  // Map deploymentRepoPath to deployment_folder_path
  if (normalized.deployment_repo_path && !normalized.deployment_folder_path) {
    normalized.deployment_folder_path = normalized.deployment_repo_path;
  }

  return normalized;
}

/**
 * Normalize an environment object - converts camelCase to snake_case
 * @param {Object} env - Environment configuration object
 * @returns {Object} - Normalized environment object
 */
function normalizeEnvironment(env) {
  return normalizeKeys(env);
}

/**
 * Parse a skyhook.yaml configuration file
 * @param {string} filePath - Path to skyhook.yaml
 * @returns {Object} - Parsed configuration object
 */
function parseSkyhookFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Skyhook configuration file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  try {
    return yaml.load(content);
  } catch (error) {
    throw new Error(`Failed to parse skyhook.yaml: ${error.message}`);
  }
}

/**
 * Parse environment files from a directory
 * @param {string} envDir - Path to environments directory
 * @returns {Promise<Array>} - Array of environment objects
 */
async function parseEnvironmentFiles(envDir) {
  if (!fs.existsSync(envDir)) {
    throw new Error(`Environments directory not found: ${envDir}`);
  }

  const files = await glob('*.yaml', { cwd: envDir });
  const environments = [];

  for (const file of files) {
    const filePath = path.join(envDir, file);
    const content = fs.readFileSync(filePath, 'utf8');

    try {
      const envConfig = yaml.load(content);
      const envName = path.basename(file, '.yaml');

      environments.push({
        name: envName,
        ...envConfig
      });
    } catch (error) {
      throw new Error(`Failed to parse environment file ${file}: ${error.message}`);
    }
  }

  return environments;
}

/**
 * Validate skyhook configuration structure
 * @param {Object} config - Parsed configuration object
 * @returns {Object} - Validation result { valid: boolean, errors: string[] }
 */
function validateSkyhookConfig(config) {
  const errors = [];

  if (!config) {
    errors.push('Configuration is empty or invalid');
    return { valid: false, errors };
  }

  // Validate services
  if (!config.services || !Array.isArray(config.services)) {
    errors.push('services must be an array');
  } else {
    config.services.forEach((service, index) => {
      if (!service.name) {
        errors.push(`services[${index}]: name is required`);
      }
      if (!service.path) {
        errors.push(`services[${index}]: path is required`);
      }
    });
  }

  // Validate environments if present (self-contained mode)
  if (config.environments) {
    if (!Array.isArray(config.environments)) {
      errors.push('environments must be an array');
    } else {
      config.environments.forEach((env, index) => {
        if (!env.name) {
          errors.push(`environments[${index}]: name is required`);
        }
        if (env.name && env.name.length > 30) {
          errors.push(`environments[${index}]: name must be 30 characters or less`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate environment configuration structure
 * @param {Object} env - Environment configuration object
 * @returns {Object} - Validation result { valid: boolean, errors: string[] }
 */
function validateEnvironment(env) {
  const errors = [];
  const requiredFields = ['name'];

  requiredFields.forEach(field => {
    if (!env[field]) {
      errors.push(`${field} is required`);
    }
  });

  if (env.name && env.name.length > 30) {
    errors.push('name must be 30 characters or less');
  }

  if (env.deploy_tool && !['kubectl', 'argocd'].includes(env.deploy_tool)) {
    errors.push(`deploy_tool must be 'kubectl' or 'argocd', got: ${env.deploy_tool}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Parse complete Skyhook configuration from repo and optional infra repo
 * @param {string} repoPath - Path to repository root
 * @param {Object} options - Options object
 * @param {string} options.infraRepoPath - Path to infra repo (optional)
 * @param {string} options.environmentsPath - Path to environments dir within infra repo (default: 'skyhook/environments')
 * @returns {Promise<Object>} - Parsed configuration { services: Array, environments: Array }
 */
async function parseSkyhookConfig(repoPath, options = {}) {
  const skyhookPath = getSkyhookConfigPath(repoPath);
  if (!skyhookPath) {
    throw new Error(`Skyhook configuration file not found. Expected '.skyhook/skyhook.yaml' or 'skyhook.yaml' in: ${repoPath}`);
  }
  const config = parseSkyhookFile(skyhookPath);

  // Validate the config
  const validation = validateSkyhookConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid skyhook.yaml:\n${validation.errors.join('\n')}`);
  }

  const rawServices = config.services || [];
  let rawEnvironments = [];

  // Check for self-contained environments first
  if (config.environments && config.environments.length > 0) {
    rawEnvironments = config.environments;
  }
  // Then check for external infra repo environments
  else if (options.infraRepoPath) {
    const envPath = options.environmentsPath || 'skyhook/environments';
    const envDir = path.join(options.infraRepoPath, envPath);
    rawEnvironments = await parseEnvironmentFiles(envDir);
  }

  // Normalize field names from camelCase to snake_case
  const services = rawServices.map(normalizeService);
  const environments = rawEnvironments.map(normalizeEnvironment);

  // Validate each environment
  environments.forEach((env, index) => {
    const envValidation = validateEnvironment(env);
    if (!envValidation.valid) {
      throw new Error(`Invalid environment at index ${index} (${env.name || 'unnamed'}):\n${envValidation.errors.join('\n')}`);
    }
  });

  return { services, environments };
}

module.exports = {
  parseSkyhookFile,
  parseEnvironmentFiles,
  validateSkyhookConfig,
  validateEnvironment,
  parseSkyhookConfig
};
