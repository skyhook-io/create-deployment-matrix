/**
 * Build a GitHub Actions deployment matrix from services and environments
 * @param {Array} services - Array of service configurations
 * @param {Array} environments - Array of environment configurations
 * @param {Object} options - Build options
 * @param {string} options.tag - Image tag to inject
 * @param {string} options.envFilter - Environment filter (optional)
 * @param {string} options.deployToolFilter - Deploy tool filter: 'kubectl', 'argocd', or 'all' (optional)
 * @returns {Object} - GitHub Actions matrix object { include: Array }
 */
function buildMatrix(services, environments, options = {}) {
  const { tag, envFilter, deployToolFilter = 'all' } = options;
  const matrix = { include: [] };

  // Apply environment filter
  let filteredEnvs = environments;
  if (envFilter) {
    filteredEnvs = environments.filter(env => env.name === envFilter);
  }

  // Apply deploy tool filter
  if (deployToolFilter && deployToolFilter !== 'all') {
    filteredEnvs = filteredEnvs.filter(env =>
      env.deploy_tool === deployToolFilter || !env.deploy_tool
    );
  }

  // Build matrix entries for each service x environment combination
  for (const service of services) {
    for (const env of filteredEnvs) {
      const entry = {
        service: service.name,
        service_path: service.path,
        environment: env.name,
        tag: tag
      };

      // Add environment properties if present
      if (env.cluster_name) entry.cluster_name = env.cluster_name;
      if (env.cloud_provider) entry.cloud_provider = env.cloud_provider;
      if (env.location) entry.location = env.location;
      if (env.namespace) entry.namespace = env.namespace;
      if (env.deploy_tool) entry.deploy_tool = env.deploy_tool;
      if (env.account) entry.account = env.account;

      // Add service properties if present
      if (service.buildTool) entry.build_tool = service.buildTool;
      if (service.dockerfilePath) entry.dockerfile_path = service.dockerfilePath;
      if (service.dockerfileContext) entry.dockerfile_context = service.dockerfileContext;

      matrix.include.push(entry);
    }
  }

  return matrix;
}

/**
 * Filter matrix by environment name
 * @param {Object} matrix - Matrix object { include: Array }
 * @param {string} envFilter - Environment name to filter by
 * @returns {Object} - Filtered matrix
 */
function filterByEnvironment(matrix, envFilter) {
  if (!envFilter) {
    return matrix;
  }

  return {
    include: matrix.include.filter(entry => entry.environment === envFilter)
  };
}

/**
 * Filter matrix by deploy tool
 * @param {Object} matrix - Matrix object { include: Array }
 * @param {string} deployToolFilter - Deploy tool to filter by ('kubectl', 'argocd', or 'all')
 * @returns {Object} - Filtered matrix
 */
function filterByDeployTool(matrix, deployToolFilter) {
  if (!deployToolFilter || deployToolFilter === 'all') {
    return matrix;
  }

  return {
    include: matrix.include.filter(entry =>
      entry.deploy_tool === deployToolFilter || !entry.deploy_tool
    )
  };
}

/**
 * Get statistics about the matrix
 * @param {Object} matrix - Matrix object { include: Array }
 * @returns {Object} - Statistics object
 */
function getMatrixStats(matrix) {
  const services = new Set();
  const environments = new Set();

  matrix.include.forEach(entry => {
    services.add(entry.service);
    environments.add(entry.environment);
  });

  return {
    totalEntries: matrix.include.length,
    serviceCount: services.size,
    environmentCount: environments.size,
    services: Array.from(services),
    environments: Array.from(environments)
  };
}

/**
 * Validate matrix is not empty
 * @param {Object} matrix - Matrix object { include: Array }
 * @param {Object} options - Options used to build the matrix (for error message)
 * @returns {boolean} - True if valid
 * @throws {Error} - If matrix is empty
 */
function validateMatrixNotEmpty(matrix, options = {}) {
  if (!matrix.include || matrix.include.length === 0) {
    let message = 'Generated matrix is empty. No service/environment combinations found.';

    if (options.envFilter) {
      message += ` Environment filter: '${options.envFilter}'`;
    }
    if (options.deployToolFilter && options.deployToolFilter !== 'all') {
      message += ` Deploy tool filter: '${options.deployToolFilter}'`;
    }

    throw new Error(message);
  }

  return true;
}

module.exports = {
  buildMatrix,
  filterByEnvironment,
  filterByDeployTool,
  getMatrixStats,
  validateMatrixNotEmpty
};
