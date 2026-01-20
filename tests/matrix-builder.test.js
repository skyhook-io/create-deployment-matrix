const {
  buildMatrix,
  filterByEnvironment,
  filterByDeployTool,
  getMatrixStats,
  validateMatrixNotEmpty
} = require('../src/matrix/matrix-builder');

describe('matrix-builder', () => {
  const services = [
    { name: 'api', path: 'services/api', buildTool: 'npm' },
    { name: 'web', path: 'services/web', buildTool: 'yarn' }
  ];

  const environments = [
    { name: 'dev', cluster_name: 'dev-cluster', deploy_tool: 'kubectl' },
    { name: 'staging', cluster_name: 'staging-cluster', deploy_tool: 'kubectl' },
    { name: 'prod', cluster_name: 'prod-cluster', deploy_tool: 'argocd' }
  ];

  describe('buildMatrix', () => {
    test('creates matrix with all service x environment combinations', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });

      expect(matrix.include).toHaveLength(6); // 2 services x 3 environments
    });

    test('includes tag in all entries', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });

      matrix.include.forEach(entry => {
        expect(entry.tag).toBe('v1.0.0');
      });
    });

    test('includes Koala-compatible field names', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });
      const apiEntry = matrix.include.find(e => e.service_name === 'api');

      // Koala-compatible fields
      expect(apiEntry.service_name).toBe('api');
      expect(apiEntry.service_dir).toBe('services/api');
      expect(apiEntry.service_tag).toBe('v1.0.0');
      expect(apiEntry.overlay).toBeDefined();
      expect(apiEntry.image).toBe('api');

      // Legacy fields for backwards compatibility
      expect(apiEntry.service).toBe('api');
      expect(apiEntry.service_path).toBe('services/api');
      expect(apiEntry.tag).toBe('v1.0.0');
      expect(apiEntry.build_tool).toBe('npm');
    });

    test('includes environment properties with Koala-compatible names', () => {
      const envsWithLocation = [
        { name: 'dev', cluster_name: 'dev-cluster', location: 'us-east-1', cloud_provider: 'aws', deploy_tool: 'kubectl' }
      ];
      const matrix = buildMatrix(services, envsWithLocation, { tag: 'v1.0.0' });
      const devEntry = matrix.include.find(e => e.overlay === 'dev');

      // Koala-compatible field names
      expect(devEntry.cluster).toBe('dev-cluster');
      expect(devEntry.cluster_location).toBe('us-east-1');
      expect(devEntry.cloud_provider).toBe('aws');

      // Legacy field names for backwards compatibility
      expect(devEntry.cluster_name).toBe('dev-cluster');
      expect(devEntry.location).toBe('us-east-1');
      expect(devEntry.deploy_tool).toBe('kubectl');
    });

    test('includes deployment repo fields when present', () => {
      const envsWithDeployment = [
        { name: 'dev', cluster_name: 'dev-cluster', deployment_repo: 'org/deploy-repo', deployment_folder_path: 'apps/api' }
      ];
      const matrix = buildMatrix(services, envsWithDeployment, { tag: 'v1.0.0' });
      const entry = matrix.include[0];

      expect(entry.deployment_repo).toBe('org/deploy-repo');
      expect(entry.deployment_folder_path).toBe('apps/api');
    });

    test('filters by environment when envFilter is provided', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0', envFilter: 'prod' });

      expect(matrix.include).toHaveLength(2); // 2 services x 1 environment
      matrix.include.forEach(entry => {
        expect(entry.environment).toBe('prod');
      });
    });

    test('filters by deploy tool when deployToolFilter is kubectl', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0', deployToolFilter: 'kubectl' });

      expect(matrix.include).toHaveLength(4); // 2 services x 2 kubectl environments
      matrix.include.forEach(entry => {
        expect(entry.deploy_tool).toBe('kubectl');
      });
    });

    test('filters by deploy tool when deployToolFilter is argocd', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0', deployToolFilter: 'argocd' });

      expect(matrix.include).toHaveLength(2); // 2 services x 1 argocd environment
      matrix.include.forEach(entry => {
        expect(entry.deploy_tool).toBe('argocd');
      });
    });

    test('includes environments without deploy_tool when filtering', () => {
      const envsWithMissing = [
        { name: 'dev', cluster_name: 'dev-cluster' }, // no deploy_tool
        { name: 'prod', cluster_name: 'prod-cluster', deploy_tool: 'argocd' }
      ];

      const matrix = buildMatrix(services, envsWithMissing, { tag: 'v1.0.0', deployToolFilter: 'kubectl' });

      // Should include 'dev' because it has no deploy_tool specified
      expect(matrix.include).toHaveLength(2);
      expect(matrix.include.every(e => e.environment === 'dev')).toBe(true);
    });

    test('returns empty matrix when filters match nothing', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0', envFilter: 'nonexistent' });

      expect(matrix.include).toHaveLength(0);
    });

    test('handles empty services array', () => {
      const matrix = buildMatrix([], environments, { tag: 'v1.0.0' });

      expect(matrix.include).toHaveLength(0);
    });

    test('handles empty environments array', () => {
      const matrix = buildMatrix(services, [], { tag: 'v1.0.0' });

      expect(matrix.include).toHaveLength(0);
    });

    test('combines environment and deploy tool filters', () => {
      const matrix = buildMatrix(services, environments, {
        tag: 'v1.0.0',
        envFilter: 'dev',
        deployToolFilter: 'kubectl'
      });

      expect(matrix.include).toHaveLength(2); // 2 services x 1 matching environment
    });
  });

  describe('filterByEnvironment', () => {
    test('returns filtered matrix', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });
      const filtered = filterByEnvironment(matrix, 'dev');

      expect(filtered.include).toHaveLength(2);
      filtered.include.forEach(entry => {
        expect(entry.environment).toBe('dev');
      });
    });

    test('returns original matrix when filter is empty', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });
      const filtered = filterByEnvironment(matrix, '');

      expect(filtered.include).toHaveLength(matrix.include.length);
    });

    test('returns original matrix when filter is null', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });
      const filtered = filterByEnvironment(matrix, null);

      expect(filtered.include).toHaveLength(matrix.include.length);
    });
  });

  describe('filterByDeployTool', () => {
    test('filters by kubectl', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });
      const filtered = filterByDeployTool(matrix, 'kubectl');

      expect(filtered.include).toHaveLength(4);
    });

    test('returns original matrix when filter is all', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });
      const filtered = filterByDeployTool(matrix, 'all');

      expect(filtered.include).toHaveLength(matrix.include.length);
    });

    test('returns original matrix when filter is empty', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });
      const filtered = filterByDeployTool(matrix, '');

      expect(filtered.include).toHaveLength(matrix.include.length);
    });
  });

  describe('getMatrixStats', () => {
    test('returns correct statistics', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });
      const stats = getMatrixStats(matrix);

      expect(stats.totalEntries).toBe(6);
      expect(stats.serviceCount).toBe(2);
      expect(stats.environmentCount).toBe(3);
      expect(stats.services).toContain('api');
      expect(stats.services).toContain('web');
      expect(stats.environments).toContain('dev');
      expect(stats.environments).toContain('prod');
    });

    test('handles empty matrix', () => {
      const stats = getMatrixStats({ include: [] });

      expect(stats.totalEntries).toBe(0);
      expect(stats.serviceCount).toBe(0);
      expect(stats.environmentCount).toBe(0);
    });
  });

  describe('validateMatrixNotEmpty', () => {
    test('returns true for non-empty matrix', () => {
      const matrix = buildMatrix(services, environments, { tag: 'v1.0.0' });

      expect(validateMatrixNotEmpty(matrix)).toBe(true);
    });

    test('throws for empty matrix', () => {
      expect(() => validateMatrixNotEmpty({ include: [] })).toThrow(/empty/);
    });

    test('includes filter info in error message', () => {
      expect(() => validateMatrixNotEmpty({ include: [] }, { envFilter: 'prod' }))
        .toThrow(/prod/);
    });

    test('includes deploy tool filter in error message', () => {
      expect(() => validateMatrixNotEmpty({ include: [] }, { deployToolFilter: 'kubectl' }))
        .toThrow(/kubectl/);
    });

    test('throws for undefined include', () => {
      expect(() => validateMatrixNotEmpty({})).toThrow(/empty/);
    });
  });
});
