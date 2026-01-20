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
  // Field names match Koala format for compatibility
  for (const service of services) {
    for (const env of filteredEnvs) {
      const entry = {
        // Core fields (matching Koala format exactly)
        service_name: service.name,
        service_dir: service.path,
        service_tag: `${service.name}_${tag}`,  // Koala format: {service_name}_{tag}
        overlay: env.name
      };

      // Service repo if present
      if (service.repo) entry.service_repo = service.repo;

      // Environment properties (matching Koala field names)
      if (env.cluster_name) entry.cluster = env.cluster_name;
      if (env.cloud_provider) entry.cloud_provider = env.cloud_provider;
      if (env.location) entry.cluster_location = env.location;
      if (env.namespace) entry.namespace = env.namespace;
      if (env.account) entry.account = env.account;
      if (env.deploy_tool) entry.deploy_tool = env.deploy_tool;

      // Deployment repo info if present in environment
      if (env.deployment_repo) entry.deployment_repo = env.deployment_repo;
      if (env.deployment_folder_path) entry.deployment_folder_path = env.deployment_folder_path;

      // Auto deploy flag
      if (env.auto_deploy !== undefined) entry.auto_deploy = String(env.auto_deploy);

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
    include: matrix.include.filter(entry => entry.overlay === envFilter)
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
      entry.deploy_tool === deployToolFilter
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
    services.add(entry.service_name);
    environments.add(entry.overlay);
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
