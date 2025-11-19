const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs');
const path = require('path');

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

    core.info('🔍 Reading .koala-monorepo.json from repo root to identify services');
    core.info('📋 Extracting deployment configuration from .koala.toml files for different environments');

    // Build the command
    let cmd = `npx --yes workflow-utils get-services-env-config -dir . -outputFormat github-matrix -branch ${branch} -actionTag ${tag}`;

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
      throw new Error('Failed to generate matrix - empty result');
    }

    core.info('Raw output from workflow-utils:');
    core.info(stdout);

    // Parse the JSON
    let matrixObject;
    try {
      const parsed = JSON.parse(stdout.trim());

      // Check if it's double-encoded (a string containing JSON)
      if (typeof parsed === 'string') {
        core.info('Detected double-encoded JSON, decoding...');
        matrixObject = JSON.parse(parsed);
      } else {
        matrixObject = parsed;
      }
    } catch (error) {
      throw new Error(`Failed to parse matrix JSON: ${error.message}\nOutput: ${stdout}`);
    }

    // Set output as JSON string for GitHub Actions to parse
    const matrixJson = JSON.stringify(matrixObject);
    core.setOutput('matrix', matrixJson);

    core.info('✅ Generated deployment matrix:');
    core.info(JSON.stringify(matrixObject, null, 2));

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
