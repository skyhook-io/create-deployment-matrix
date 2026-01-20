const { SkyhookConfig, SkyhookService, SkyhookEnvironment } = require('../src/config/SkyhookConfig');
const { parseSkyhookConfig, validateSkyhookConfig } = require('../src/config/skyhook-parser');
const { detectConfigFormats } = require('../src/config/config-detector');
const { buildMatrixFromSkyhook } = require('../src/matrix/matrix-builder');
const { DeploymentMatrix, DeploymentEntry } = require('../src/DeploymentMatrix');
const fs = require('fs');
const path = require('path');

// Test fixtures
const validSkyhookYaml = `
services:
  - name: vcs
    path: apps/vcs
    deploymentRepo: KoalaOps/deployment
    deploymentRepoPath: vcs
  - name: project-infra
    path: apps/project-infra
    deploymentRepo: KoalaOps/deployment
    deploymentRepoPath: project-infra

environments:
  - name: dev
    clusterName: nonprod-cluster-us-east1
    cloudProvider: gcp
    account: koalabackend
    location: us-east1-b
    namespace: dev
  - name: staging
    clusterName: nonprod-cluster-us-east1
    cloudProvider: gcp
    account: koalabackend
    location: us-east1-b
    namespace: staging
  - name: prod
    clusterName: prod-cluster-us-east1
    cloudProvider: gcp
    account: koalabackend
    location: us-east1-b
    namespace: prod
`;

describe('SkyhookConfig', () => {
  test('CONFIG_PATH is correct', () => {
    expect(SkyhookConfig.CONFIG_PATH).toBe('.skyhook/skyhook.yaml');
  });

  test('fromObject creates SkyhookConfig with services and environments', () => {
    const config = SkyhookConfig.fromObject({
      services: [{ name: 'test', path: 'apps/test' }],
      environments: [{ name: 'dev', clusterName: 'cluster1' }]
    });

    expect(config.services).toHaveLength(1);
    expect(config.environments).toHaveLength(1);
    expect(config.services[0]).toBeInstanceOf(SkyhookService);
    expect(config.environments[0]).toBeInstanceOf(SkyhookEnvironment);
  });
});

describe('validateSkyhookConfig', () => {
  test('valid config passes validation', () => {
    const config = {
      services: [{ name: 'test', path: 'apps/test' }],
      environments: [{ name: 'dev' }]
    };
    const result = validateSkyhookConfig(config);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('missing services array fails validation', () => {
    const result = validateSkyhookConfig({ environments: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('services must be an array');
  });

  test('service without name fails validation', () => {
    const config = {
      services: [{ path: 'apps/test' }],
      environments: []
    };
    const result = validateSkyhookConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('name is required'))).toBe(true);
  });

  test('service without path fails validation', () => {
    const config = {
      services: [{ name: 'test' }],
      environments: []
    };
    const result = validateSkyhookConfig(config);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('path is required'))).toBe(true);
  });
});

describe('buildMatrixFromSkyhook', () => {
  const services = [
    { name: 'vcs', path: 'apps/vcs', deploymentRepo: 'KoalaOps/deployment', deploymentRepoPath: 'vcs' },
    { name: 'project-infra', path: 'apps/project-infra', deploymentRepo: 'KoalaOps/deployment', deploymentRepoPath: 'project-infra' }
  ];

  const environments = [
    { name: 'dev', clusterName: 'nonprod-cluster', cloudProvider: 'gcp', location: 'us-east1-b', namespace: 'dev', account: 'koalabackend' },
    { name: 'prod', clusterName: 'prod-cluster', cloudProvider: 'gcp', location: 'us-east1-b', namespace: 'prod', account: 'koalabackend' }
  ];

  test('creates matrix with service x environment combinations', () => {
    const matrix = buildMatrixFromSkyhook(services, environments, {
      tag: 'v1.0.0',
      serviceRepo: 'KoalaOps/orbit'
    });

    expect(matrix.count).toBe(4); // 2 services x 2 environments
  });

  test('per-service counter starts at 01 for each service', () => {
    const matrix = buildMatrixFromSkyhook(services, environments, {
      tag: 'v1.0.0',
      serviceRepo: 'KoalaOps/orbit'
    });

    const vcsEntries = matrix.include.filter(e => e.service_name === 'vcs');
    const infraEntries = matrix.include.filter(e => e.service_name === 'project-infra');

    expect(vcsEntries[0].service_tag).toBe('vcs_v1.0.0_01');
    expect(vcsEntries[1].service_tag).toBe('vcs_v1.0.0_02');
    expect(infraEntries[0].service_tag).toBe('project-infra_v1.0.0_01');
    expect(infraEntries[1].service_tag).toBe('project-infra_v1.0.0_02');
  });

  test('continues counter from serviceCounters map', () => {
    const serviceCounters = new Map();
    serviceCounters.set('vcs', 5); // vcs already has entries up to _05

    const matrix = buildMatrixFromSkyhook(services, environments, {
      tag: 'v1.0.0',
      serviceRepo: 'KoalaOps/orbit',
      serviceCounters
    });

    const vcsEntries = matrix.include.filter(e => e.service_name === 'vcs');
    expect(vcsEntries[0].service_tag).toBe('vcs_v1.0.0_06');
    expect(vcsEntries[1].service_tag).toBe('vcs_v1.0.0_07');

    // project-infra should start at _01 since it wasn't in the map
    const infraEntries = matrix.include.filter(e => e.service_name === 'project-infra');
    expect(infraEntries[0].service_tag).toBe('project-infra_v1.0.0_01');
  });

  test('applies environment filter', () => {
    const matrix = buildMatrixFromSkyhook(services, environments, {
      tag: 'v1.0.0',
      serviceRepo: 'KoalaOps/orbit',
      envFilter: 'dev'
    });

    expect(matrix.count).toBe(2); // 2 services x 1 environment (dev only)
    expect(matrix.include.every(e => e.overlay === 'dev')).toBe(true);
  });

  test('maps all fields correctly', () => {
    const matrix = buildMatrixFromSkyhook(services, environments, {
      tag: 'v1.0.0',
      serviceRepo: 'KoalaOps/orbit'
    });

    const entry = matrix.include[0];
    expect(entry.service_name).toBe('vcs');
    expect(entry.service_dir).toBe('apps/vcs');
    expect(entry.service_repo).toBe('KoalaOps/orbit');
    expect(entry.deployment_repo).toBe('KoalaOps/deployment');
    expect(entry.deployment_folder_path).toBe('vcs');
    expect(entry.cluster).toBe('nonprod-cluster');
    expect(entry.cluster_location).toBe('us-east1-b');
    expect(entry.cloud_provider).toBe('gcp');
    expect(entry.namespace).toBe('dev');
    expect(entry.account).toBe('koalabackend');
    expect(entry.auto_deploy).toBe('true');
  });
});

describe('DeploymentMatrix.merge', () => {
  test('merges two matrices and deduplicates by service_name + overlay', () => {
    const matrix1 = new DeploymentMatrix([
      new DeploymentEntry({ service_name: 'vcs', overlay: 'dev', service_tag: 'vcs_v1_01' }),
      new DeploymentEntry({ service_name: 'vcs', overlay: 'prod', service_tag: 'vcs_v1_02' })
    ]);

    const matrix2 = new DeploymentMatrix([
      new DeploymentEntry({ service_name: 'vcs', overlay: 'dev', service_tag: 'vcs_v2_01' }), // duplicate
      new DeploymentEntry({ service_name: 'infra', overlay: 'dev', service_tag: 'infra_v1_01' })
    ]);

    matrix1.merge(matrix2);

    expect(matrix1.count).toBe(3); // vcs:dev (from matrix2), vcs:prod, infra:dev

    // The duplicate should be from matrix2 (overwrites)
    const vcsDev = matrix1.include.find(e => e.service_name === 'vcs' && e.overlay === 'dev');
    expect(vcsDev.service_tag).toBe('vcs_v2_01');
  });
});
