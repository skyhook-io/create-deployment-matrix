const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');

const { getSkyhookConfigPath } = require('./config/config-detector');
const { parseSkyhookConfig } = require('./config/skyhook-parser');
const { buildMatrix, getMatrixStats, validateMatrixNotEmpty } = require('./matrix/matrix-builder');

/**
 * Run Koala mode using workflow-utils CLI
 */
async function runKoalaMode(options) {
  const { overlay, branch, tag, githubToken, repoPath } = options;

  core.info('Using Koala configuration format (.koala-monorepo.json + .koala.toml)');
  core.info('Reading .koala-monorepo.json from repo root to identify services');
  core.info('Extracting deployment configuration from .koala.toml files for different environments');

  let cmd = `npx --yes workflow-utils get-services-env-config -dir . -outputFormat github-matrix -branch ${branch} -actionTag ${tag} -token ${githubToken}`;

  if (overlay) {
    core.info(`Filtering for environment: ${overlay}`);
    cmd += ` -envFilter ${overlay}`;
  } else {
    core.info('Including all environments');
  }

  core.info(`Executing: ${cmd}`);

  let stdout = '';
  let stderr = '';

  const execOptions = {
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

  await exec.exec('bash', ['-c', cmd], execOptions);

  if (!stdout.trim()) {
    throw new Error('Failed to generate matrix - empty result');
  }

  core.info('Raw output from workflow-utils:');
  core.info(stdout);

  let matrixObject;
  try {
    const parsed = JSON.parse(stdout.trim());
    if (typeof parsed === 'string') {
      core.info('Detected double-encoded JSON, decoding...');
      matrixObject = JSON.parse(parsed);
    } else {
      matrixObject = parsed;
    }
  } catch (error) {
    throw new Error(`Failed to parse matrix JSON: ${error.message}\nOutput: ${stdout}`);
  }

  return matrixObject;
}

/**
 * Run Skyhook mode using native YAML parsing
 */
async function runSkyhookMode(options) {
  const { overlay, tag, repoPath, infraRepoPath, environmentsPath, deployToolFilter } = options;

  core.info('Using Skyhook configuration format (skyhook.yaml)');
  core.info(`Reading skyhook.yaml from: ${repoPath}`);

  const config = await parseSkyhookConfig(repoPath, {
    infraRepoPath,
    environmentsPath
  });

  core.info(`Found ${config.services.length} service(s)`);
  core.info(`Found ${config.environments.length} environment(s)`);

  if (config.environments.length === 0) {
    if (infraRepoPath) {
      throw new Error(`No environments found. Check that environment files exist at: ${path.join(infraRepoPath, environmentsPath)}`);
    } else {
      throw new Error('No environments found in skyhook.yaml. Either define environments in the file or provide infra-repo-path input.');
    }
  }

  if (overlay) {
    core.info(`Filtering for environment: ${overlay}`);
  } else {
    core.info('Including all environments');
  }

  if (deployToolFilter && deployToolFilter !== 'all') {
    core.info(`Filtering for deploy tool: ${deployToolFilter}`);
  }

  const matrix = buildMatrix(config.services, config.environments, {
    tag,
    envFilter: overlay,
    deployToolFilter
  });

  validateMatrixNotEmpty(matrix, { envFilter: overlay, deployToolFilter });

  return matrix;
}

async function run() {
  try {
    // Read inputs
    const overlay = core.getInput('overlay');
    const branch = core.getInput('branch') || 'main';
    const tag = core.getInput('tag');
    const githubToken = core.getInput('github-token');
    const repoPath = core.getInput('repo-path') || '.';
    const infraRepoPath = core.getInput('infra-repo-path');
    const environmentsPath = core.getInput('environments-path') || 'skyhook/environments';
    const deployToolFilter = core.getInput('deploy-tool-filter') || 'all';

    // Validate required inputs
    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path not found: ${repoPath}`);
    }

    if (!tag) {
      throw new Error('tag input is required');
    }

    if (!githubToken) {
      throw new Error('github-token input is required');
    }

    // Detect which config formats are present
    const hasSkyhook = getSkyhookConfigPath(repoPath) !== null;
    const hasKoala = fs.existsSync(path.join(repoPath, '.koala-monorepo.json'));

    if (!hasSkyhook && !hasKoala) {
      throw new Error(`No configuration found. Expected '.skyhook/skyhook.yaml', 'skyhook.yaml', or '.koala-monorepo.json' at repository root: ${repoPath}`);
    }

    const configFormats = [];
    if (hasSkyhook) configFormats.push('skyhook');
    if (hasKoala) configFormats.push('koala');

    core.info(`Detected configuration format(s): ${configFormats.join(', ')}`);
    core.setOutput('config-format', configFormats.join(','));

    let matrixEntries = [];

    // Process Skyhook config if present
    if (hasSkyhook) {
      const skyhookMatrix = await runSkyhookMode({
        overlay,
        tag,
        repoPath,
        infraRepoPath,
        environmentsPath,
        deployToolFilter
      });
      matrixEntries = matrixEntries.concat(skyhookMatrix.include || []);
      core.info(`Added ${skyhookMatrix.include?.length || 0} entries from Skyhook config`);
    }

    // Process Koala config if present
    if (hasKoala) {
      const koalaMatrix = await runKoalaMode({
        overlay,
        branch,
        tag,
        githubToken,
        repoPath
      });
      matrixEntries = matrixEntries.concat(koalaMatrix.include || []);
      core.info(`Added ${koalaMatrix.include?.length || 0} entries from Koala config`);
    }

    const matrixObject = { include: matrixEntries };

    // Validate combined matrix is not empty
    if (matrixEntries.length === 0) {
      throw new Error('Generated matrix is empty. No service/environment combinations found.');
    }

    // Set output as JSON string for GitHub Actions
    const matrixJson = JSON.stringify(matrixObject);
    core.setOutput('matrix', matrixJson);

    core.info('Generated deployment matrix:');
    core.info(JSON.stringify(matrixObject, null, 2));

    const stats = getMatrixStats(matrixObject);
    core.info(`Matrix contains ${stats.totalEntries} entries across ${stats.serviceCount} service(s) and ${stats.environmentCount} environment(s)`);

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
