/**
 * Represents a single entry in the deployment matrix.
 * Field names match Koala format for compatibility with existing workflows.
 */
class MatrixEntry {
  /**
   * @param {Object} params - Entry parameters
   * @param {string} params.serviceName - Service name
   * @param {string} params.serviceDir - Service directory path
   * @param {string} params.serviceTag - Service tag in format {service_name}_{tag}_{counter}
   * @param {string} params.overlay - Environment/overlay name
   * @param {string} [params.serviceRepo] - Service repository (optional)
   * @param {string} [params.deploymentRepo] - Deployment repository (optional)
   * @param {string} [params.deploymentFolderPath] - Deployment folder path (optional)
   * @param {string} [params.cluster] - Cluster name (optional)
   * @param {string} [params.cloudProvider] - Cloud provider (optional)
   * @param {string} [params.clusterLocation] - Cluster location (optional)
   * @param {string} [params.namespace] - Kubernetes namespace (optional)
   * @param {string} [params.account] - Cloud account (optional)
   * @param {string} [params.deployTool] - Deploy tool: kubectl or argocd (optional)
   * @param {string} [params.autoDeploy] - Auto deploy flag as string (optional)
   */
  constructor(params) {
    // Required fields
    this.service_name = params.serviceName;
    this.service_dir = params.serviceDir;
    this.service_tag = params.serviceTag;
    this.overlay = params.overlay;

    // Optional service fields
    if (params.serviceRepo) this.service_repo = params.serviceRepo;
    if (params.deploymentRepo) this.deployment_repo = params.deploymentRepo;
    if (params.deploymentFolderPath) this.deployment_folder_path = params.deploymentFolderPath;

    // Optional environment fields
    if (params.cluster) this.cluster = params.cluster;
    if (params.cloudProvider) this.cloud_provider = params.cloudProvider;
    if (params.clusterLocation) this.cluster_location = params.clusterLocation;
    if (params.namespace) this.namespace = params.namespace;
    if (params.account) this.account = params.account;
    if (params.deployTool) this.deploy_tool = params.deployTool;
    if (params.autoDeploy !== undefined) this.auto_deploy = params.autoDeploy;
  }

  /**
   * Create a MatrixEntry from service and environment configurations
   * @param {Object} service - Service configuration (normalized)
   * @param {Object} env - Environment configuration (normalized)
   * @param {string} tag - Image tag
   * @param {number} counter - Entry counter for unique tag generation
   * @returns {MatrixEntry}
   */
  static fromServiceAndEnv(service, env, tag, counter) {
    const counterStr = String(counter).padStart(2, '0');

    return new MatrixEntry({
      // Core fields
      serviceName: service.name,
      serviceDir: service.path,
      serviceTag: `${service.name}_${tag}_${counterStr}`,
      overlay: env.name,

      // Service fields
      serviceRepo: service.repo,
      deploymentRepo: service.deployment_repo || env.deployment_repo,
      deploymentFolderPath: service.deployment_folder_path || env.deployment_folder_path,

      // Environment fields
      cluster: env.cluster_name,
      cloudProvider: env.cloud_provider,
      clusterLocation: env.location,
      namespace: env.namespace,
      account: env.account,
      deployTool: env.deploy_tool,
      autoDeploy: env.auto_deploy !== undefined ? String(env.auto_deploy) : undefined
    });
  }

  /**
   * Convert to plain object for JSON serialization
   * @returns {Object}
   */
  toJSON() {
    const obj = {
      service_name: this.service_name,
      service_dir: this.service_dir,
      service_tag: this.service_tag,
      overlay: this.overlay
    };

    if (this.service_repo) obj.service_repo = this.service_repo;
    if (this.deployment_repo) obj.deployment_repo = this.deployment_repo;
    if (this.deployment_folder_path) obj.deployment_folder_path = this.deployment_folder_path;
    if (this.cluster) obj.cluster = this.cluster;
    if (this.cloud_provider) obj.cloud_provider = this.cloud_provider;
    if (this.cluster_location) obj.cluster_location = this.cluster_location;
    if (this.namespace) obj.namespace = this.namespace;
    if (this.account) obj.account = this.account;
    if (this.deploy_tool) obj.deploy_tool = this.deploy_tool;
    if (this.auto_deploy !== undefined) obj.auto_deploy = this.auto_deploy;

    return obj;
  }
}

module.exports = { MatrixEntry };
