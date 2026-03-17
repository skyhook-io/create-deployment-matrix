const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const { DeploymentMatrix } = require('./DeploymentMatrix');
const { detectConfigFormats } = require('./config/config-detector');
const { parseSkyhookConfig } = require('./config/skyhook-parser');
const { buildMatrixFromSkyhook, mergeMatrices } = require('./matrix/matrix-builder');

async function run() {
  try {
    const overlay = core.getInput('overlay');
    const branch = core.getInput('branch') || 'main';
    const tag = core.getInput('tag');
    const githubToken = core.getInput('github-token');
    const repoPath = core.getInput('repo-path') || '.';

    // Validate inputs
    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path not found: ${repoPath}`);
    }

    if (!tag) {
      throw new Error('tag input is required');
    }

    if (!githubToken) {
      throw new Error('github-token input is required');
    }

    // Detect which config format(s) are present
    const configFormats = detectConfigFormats(repoPath);
    core.info(`Config detection: hasSkyhook=${configFormats.hasSkyhook}, hasKoala=${configFormats.hasKoala}`);

    if (!configFormats.hasSkyhook && !configFormats.hasKoala) {
      throw new Error('No configuration found. Expected .skyhook/skyhook.yaml or .koala-monorepo.json');
    }

    let koalaMatrix = null;
    let skyhookMatrix = null;

    // Process Koala config if present
    if (configFormats.hasKoala) {
      core.info('📋 Processing Koala configuration (.koala-monorepo.json)');
      koalaMatrix = await processKoalaConfig(repoPath, branch, tag, githubToken, overlay);
    }

    // Process Skyhook config if present
    // Get per-service counters from Koala output to continue from
    const serviceCounters = koalaMatrix ? getServiceCounters(koalaMatrix) : new Map();
    if (configFormats.hasSkyhook) {
      core.info('📋 Processing Skyhook configuration (.skyhook/skyhook.yaml)');
      skyhookMatrix = await processSkyhookConfig(configFormats.skyhookPath, tag, overlay, repoPath, serviceCounters);
    }

    // Determine final matrix
    let finalMatrix;
    if (koalaMatrix && skyhookMatrix) {
      core.info('🔀 Merging Koala and Skyhook configurations');
      finalMatrix = mergeMatrices(koalaMatrix, skyhookMatrix);
    } else if (skyhookMatrix) {
      finalMatrix = skyhookMatrix;
    } else {
      finalMatrix = koalaMatrix;
    }

    if (!finalMatrix || finalMatrix.isEmpty()) {
      throw new Error('Generated matrix is empty - no service/environment combinations found');
    }

    // Set output as JSON string for GitHub Actions to parse
    core.setOutput('matrix', finalMatrix.toJSON());

    core.info(`✅ Generated deployment matrix with ${finalMatrix.count} entries:`);
    core.info(JSON.stringify(finalMatrix.toObject(), null, 2));

  } catch (error) {
    core.setFailed(error.message);
  }
}

/**
 * Get per-service counters from existing service_tags in a matrix
 * Parses tags like "service_name_v1.0.0_01" to extract the counter per service
 * @param {DeploymentMatrix} matrix
 * @returns {Map<string, number>} - Map of service_name -> highest counter
 */
function getServiceCounters(matrix) {
  const counters = new Map();

  for (const entry of matrix.include) {
    if (entry.service_tag && entry.service_name) {
      // service_tag format: {service_name}_{tag}_{counter}
      // e.g., "cloud-provisioner_v1.0.0_01"
      const match = entry.service_tag.match(/_(\d+)$/);
      if (match) {
        const counter = parseInt(match[1], 10);
        const current = counters.get(entry.service_name) || 0;
        if (counter > current) {
          counters.set(entry.service_name, counter);
        }
      }
    }
  }

  core.info(`Service counters from Koala matrix: ${JSON.stringify(Object.fromEntries(counters))}`);
  return counters;
}

/**
 * Process Koala configuration using workflow-utils CLI
 */
async function processKoalaConfig(repoPath, branch, tag, githubToken, overlay) {
  core.info('🔍 Reading .koala-monorepo.json from repo root to identify services');
  core.info('📋 Extracting deployment configuration from .koala.toml files for different environments');

  // Build the command
  let cmd = `npx --yes workflow-utils get-services-env-config -dir . -outputFormat github-matrix -branch ${branch} -actionTag ${tag} -token ${githubToken}`;

  if (overlay) {
    core.info(`🎯 Filtering for environment: ${overlay}`);
    cmd += ` -envFilter ${overlay}`;
  } else {
    core.info('🌍 Including all environments');
  }

  core.info(`📦 Executing: ${cmd}`);

  // Execute the command
  let stdout = '';
  let stderr = '';

  const options = {
    cwd: repoPath,
    env: {
      ...process.env,
      GITHUB_TOKEN: githubToken
    },
    listeners: {
      stdout: (data) => {
        stdout += data.toString();
      },
      stderr: (data) => {
        stderr += data.toString();
      }
    }
  };

  await exec.exec('bash', ['-c', cmd], options);

  if (!stdout.trim()) {
    throw new Error('Failed to generate matrix from Koala config - empty result');
  }

  core.info('Raw output from workflow-utils:');
  core.info(stdout);

  // Parse the JSON into DeploymentMatrix
  let parsed = JSON.parse(stdout.trim());

  // Check if it's double-encoded (a string containing JSON)
  if (typeof parsed === 'string') {
    core.info('Detected double-encoded JSON, decoding...');
    parsed = JSON.parse(parsed);
  }

  return DeploymentMatrix.fromObject(parsed);
}

/**
 * Process Skyhook configuration
 * @param {string} skyhookPath - Path to skyhook.yaml
 * @param {string} tag - Image tag
 * @param {string} overlay - Environment filter
 * @param {string} repoPath - Path to the git repository
 * @param {Map<string, number>} serviceCounters - Per-service counters from Koala
 */
async function processSkyhookConfig(skyhookPath, tag, overlay, repoPath, serviceCounters) {
  const config = parseSkyhookConfig(skyhookPath);

  core.info(`Found ${config.services.length} services and ${config.environments.length} environments in Skyhook config`);

  // Get service repo from environment variable
  const serviceRepo = process.env.GITHUB_REPOSITORY || '';

  // Query existing git tags to find highest counters per service,
  // so we don't generate duplicate tags across runs on the same day.
  const existingCounters = await getExistingTagCounters(config.services, tag, repoPath);

  // Merge: take the highest counter from either source
  const mergedCounters = new Map(serviceCounters);
  for (const [name, counter] of existingCounters) {
    const current = mergedCounters.get(name) || 0;
    if (counter > current) {
      mergedCounters.set(name, counter);
    }
  }

  const matrix = buildMatrixFromSkyhook(config.services, config.environments, {
    tag,
    serviceRepo,
    envFilter: overlay,
    serviceCounters: mergedCounters
  });

  return matrix;
}

/**
 * Query existing git tags to find the highest counter per service for the given tag base.
 * Looks for tags matching {service_name}_{tag}_NN and returns the highest NN per service.
 * @param {Array} services - Array of service configurations
 * @param {string} tag - Base image tag (e.g., "main_2026-03-12")
 * @param {string} repoPath - Path to the git repository
 * @returns {Promise<Map<string, number>>} - Map of service_name -> highest counter
 */
async function getExistingTagCounters(services, tag, repoPath) {
  const counters = new Map();

  let stdout = '';
  let stderr = '';
  try {
    await exec.exec('git', ['ls-remote', '--tags', 'origin'], {
      cwd: repoPath,
      listeners: {
        stdout: (data) => { stdout += data.toString(); },
        stderr: (data) => { stderr += data.toString(); }
      },
      silent: true
    });
  } catch (err) {
    core.warning(`Cannot access remote tags for counter detection: ${err.message}${stderr ? '\n' + stderr.trim() : ''}`);
    return counters;
  }

  for (const service of services) {
    // Match tags like: refs/tags/{service_name}_{tag}_NN
    const pattern = new RegExp(`refs/tags/${escapeRegExp(service.name)}_${escapeRegExp(tag)}_(\\d{2})$`, 'm');
    let highest = -1;

    for (const line of stdout.split('\n')) {
      if (line.includes('^{}')) continue; // skip annotated tag markers
      const match = line.match(pattern);
      if (match) {
        const counter = parseInt(match[1], 10);
        if (counter > highest) {
          highest = counter;
        }
      }
    }

    if (highest >= 0) {
      counters.set(service.name, highest);
      core.info(`🔢 Existing tag counter for ${service.name}: ${highest}`);
    }
  }

  core.info(`Existing tag counters from git: ${JSON.stringify(Object.fromEntries(counters))}`);
  return counters;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

run();
