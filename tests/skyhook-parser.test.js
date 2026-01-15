const fs = require('fs');
const path = require('path');
const {
  parseSkyhookFile,
  parseEnvironmentFiles,
  validateSkyhookConfig,
  validateEnvironment,
  parseSkyhookConfig
} = require('../src/config/skyhook-parser');

describe('skyhook-parser', () => {
  const testDir = '/tmp/skyhook-parser-test';
  const infraDir = '/tmp/skyhook-infra-test';

  beforeEach(() => {
    [testDir, infraDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
      fs.mkdirSync(dir, { recursive: true });
    });
  });

  afterAll(() => {
    [testDir, infraDir].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true });
      }
    });
  });

  describe('parseSkyhookFile', () => {
    test('parses valid skyhook.yaml', () => {
      const content = `
services:
  - name: api
    path: services/api
environments:
  - name: dev
    cluster_name: dev-cluster
`;
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), content);
      const result = parseSkyhookFile(path.join(testDir, 'skyhook.yaml'));

      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe('api');
      expect(result.environments).toHaveLength(1);
      expect(result.environments[0].name).toBe('dev');
    });

    test('throws error for non-existent file', () => {
      expect(() => parseSkyhookFile('/nonexistent/skyhook.yaml')).toThrow(/not found/);
    });

    test('throws error for invalid YAML', () => {
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), 'invalid: yaml: syntax: [');
      expect(() => parseSkyhookFile(path.join(testDir, 'skyhook.yaml'))).toThrow(/Failed to parse/);
    });
  });

  describe('parseEnvironmentFiles', () => {
    test('parses all yaml files in directory', async () => {
      const envDir = path.join(infraDir, 'environments');
      fs.mkdirSync(envDir, { recursive: true });

      fs.writeFileSync(path.join(envDir, 'dev.yaml'), 'cluster_name: dev-cluster\nlocation: us-east-1');
      fs.writeFileSync(path.join(envDir, 'prod.yaml'), 'cluster_name: prod-cluster\nlocation: us-west-2');

      const envs = await parseEnvironmentFiles(envDir);

      expect(envs).toHaveLength(2);
      expect(envs.map(e => e.name).sort()).toEqual(['dev', 'prod']);
      expect(envs.find(e => e.name === 'dev').cluster_name).toBe('dev-cluster');
    });

    test('throws error for non-existent directory', async () => {
      await expect(parseEnvironmentFiles('/nonexistent')).rejects.toThrow(/not found/);
    });

    test('returns empty array for empty directory', async () => {
      const emptyDir = path.join(infraDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });

      const envs = await parseEnvironmentFiles(emptyDir);
      expect(envs).toHaveLength(0);
    });
  });

  describe('validateSkyhookConfig', () => {
    test('validates valid config', () => {
      const config = {
        services: [{ name: 'api', path: 'services/api' }],
        environments: [{ name: 'dev' }]
      };
      const result = validateSkyhookConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('fails for missing services', () => {
      const config = { environments: [{ name: 'dev' }] };
      const result = validateSkyhookConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('services must be an array');
    });

    test('fails for service without name', () => {
      const config = { services: [{ path: 'services/api' }] };
      const result = validateSkyhookConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name is required'))).toBe(true);
    });

    test('fails for service without path', () => {
      const config = { services: [{ name: 'api' }] };
      const result = validateSkyhookConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('path is required'))).toBe(true);
    });

    test('fails for environment name > 30 chars', () => {
      const config = {
        services: [{ name: 'api', path: 'services/api' }],
        environments: [{ name: 'a'.repeat(31) }]
      };
      const result = validateSkyhookConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('30 characters'))).toBe(true);
    });

    test('fails for null config', () => {
      const result = validateSkyhookConfig(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEnvironment', () => {
    test('validates valid environment', () => {
      const env = { name: 'dev', cluster_name: 'dev-cluster', deploy_tool: 'kubectl' };
      const result = validateEnvironment(env);
      expect(result.valid).toBe(true);
    });

    test('fails for missing name', () => {
      const env = { cluster_name: 'dev-cluster' };
      const result = validateEnvironment(env);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
    });

    test('fails for invalid deploy_tool', () => {
      const env = { name: 'dev', deploy_tool: 'invalid' };
      const result = validateEnvironment(env);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('kubectl'))).toBe(true);
    });

    test('accepts kubectl deploy_tool', () => {
      const env = { name: 'dev', deploy_tool: 'kubectl' };
      const result = validateEnvironment(env);
      expect(result.valid).toBe(true);
    });

    test('accepts argocd deploy_tool', () => {
      const env = { name: 'dev', deploy_tool: 'argocd' };
      const result = validateEnvironment(env);
      expect(result.valid).toBe(true);
    });
  });

  describe('parseSkyhookConfig', () => {
    test('parses self-contained config', async () => {
      const content = `
services:
  - name: api
    path: services/api
environments:
  - name: dev
    cluster_name: dev-cluster
`;
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), content);

      const result = await parseSkyhookConfig(testDir);
      expect(result.services).toHaveLength(1);
      expect(result.environments).toHaveLength(1);
    });

    test('uses infra repo environments when not self-contained', async () => {
      const content = `
services:
  - name: api
    path: services/api
`;
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), content);

      const envDir = path.join(infraDir, 'skyhook/environments');
      fs.mkdirSync(envDir, { recursive: true });
      fs.writeFileSync(path.join(envDir, 'dev.yaml'), 'cluster_name: dev-cluster');

      const result = await parseSkyhookConfig(testDir, {
        infraRepoPath: infraDir,
        environmentsPath: 'skyhook/environments'
      });

      expect(result.services).toHaveLength(1);
      expect(result.environments).toHaveLength(1);
      expect(result.environments[0].name).toBe('dev');
    });

    test('throws for invalid config', async () => {
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), 'services: not-an-array');

      await expect(parseSkyhookConfig(testDir)).rejects.toThrow(/Invalid skyhook.yaml/);
    });

    test('prefers self-contained environments over infra repo', async () => {
      const content = `
services:
  - name: api
    path: services/api
environments:
  - name: self-contained-env
`;
      fs.writeFileSync(path.join(testDir, 'skyhook.yaml'), content);

      const envDir = path.join(infraDir, 'skyhook/environments');
      fs.mkdirSync(envDir, { recursive: true });
      fs.writeFileSync(path.join(envDir, 'infra-env.yaml'), 'cluster_name: infra-cluster');

      const result = await parseSkyhookConfig(testDir, {
        infraRepoPath: infraDir,
        environmentsPath: 'skyhook/environments'
      });

      expect(result.environments).toHaveLength(1);
      expect(result.environments[0].name).toBe('self-contained-env');
    });
  });
});
