# Create Deployment Matrix Action

[![Release](https://github.com/skyhook-io/create-deployment-matrix/actions/workflows/release.yml/badge.svg)](https://github.com/skyhook-io/create-deployment-matrix/actions/workflows/release.yml)

A GitHub Action that creates a deployment matrix for services based on Koala monorepo configuration files (`.koala-monorepo.json` and `.koala.toml`). This action intelligently reads your monorepo structure and generates a GitHub Actions matrix for multi-service, multi-environment deployments.

## Why This Action?

1. **Monorepo-aware**: Automatically discovers services from `.koala-monorepo.json`
2. **Environment-based deployment**: Uses `.koala.toml` to determine deployment configurations per environment
3. **Flexible filtering**: Deploy to specific environments or all environments at once
4. **Matrix optimization**: Generates optimized GitHub Actions matrices for parallel deployments
5. **Tag management**: Handles image tag configuration for deployments
6. **GitOps-ready**: Perfect for GitOps workflows with Kustomize overlays

## Use Cases

- **Multi-service deployments**: Deploy multiple services from a monorepo in parallel
- **Environment-specific rollouts**: Deploy to dev, staging, production with different configurations
- **Feature branch deployments**: Dynamically create deployment matrices for feature branches
- **Automated releases**: Integrate with CI/CD pipelines for automated service deployments
- **GitOps workflows**: Generate deployment configurations for ArgoCD, Flux, or manual Kustomize

## Prerequisites

Your repository should have:
- `.koala-monorepo.json` file at the root defining your services
- `.koala.toml` files in service directories with deployment configuration
- `workflow-utils` npm package available (installed automatically via npx)

## Usage

### Basic Example - All Environments

```yaml
- name: Create deployment matrix
  id: matrix
  uses: skyhook-io/create-deployment-matrix@v1
  with:
    tag: v1.2.3
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Deploy services
  strategy:
    matrix: ${{ fromJson(steps.matrix.outputs.matrix) }}
  runs-on: ubuntu-latest
  steps:
    - name: Deploy ${{ matrix.service }} to ${{ matrix.environment }}
      run: |
        echo "Deploying ${{ matrix.service }} version ${{ matrix.tag }} to ${{ matrix.environment }}"
```

### Filter by Environment

```yaml
- name: Create production deployment matrix
  id: matrix
  uses: skyhook-io/create-deployment-matrix@v1
  with:
    overlay: production
    tag: ${{ github.ref_name }}
    branch: main
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Deploy to production
  needs: matrix
  strategy:
    matrix: ${{ fromJson(steps.matrix.outputs.matrix) }}
  runs-on: ubuntu-latest
  steps:
    - name: Deploy ${{ matrix.service }}
      uses: skyhook-io/kustomize-deploy@v1
      with:
        service: ${{ matrix.service }}
        environment: ${{ matrix.environment }}
        tag: ${{ matrix.tag }}
```

### Multi-Environment Deployment Pipeline

```yaml
name: Deploy Services

on:
  push:
    tags:
      - 'v*'

jobs:
  create-matrix:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.matrix.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4

      - name: Create deployment matrix
        id: matrix
        uses: skyhook-io/create-deployment-matrix@v1
        with:
          tag: ${{ github.ref_name }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

  deploy:
    needs: create-matrix
    strategy:
      matrix: ${{ fromJson(needs.create-matrix.outputs.matrix) }}
      fail-fast: false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy ${{ matrix.service }} to ${{ matrix.environment }}
        run: |
          echo "Deploying service: ${{ matrix.service }}"
          echo "Environment: ${{ matrix.environment }}"
          echo "Tag: ${{ matrix.tag }}"
          # Add your deployment logic here
```

### Feature Branch Deployments

```yaml
name: Deploy Feature Branch

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  deploy-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Create dev deployment matrix
        id: matrix
        uses: skyhook-io/create-deployment-matrix@v1
        with:
          overlay: dev
          branch: ${{ github.head_ref }}
          tag: pr-${{ github.event.pull_request.number }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Deploy preview environments
        strategy:
          matrix: ${{ fromJson(steps.matrix.outputs.matrix) }}
        run: |
          echo "Deploying preview for ${{ matrix.service }}"
```

### Custom Repository Path

```yaml
- name: Checkout monorepo
  uses: actions/checkout@v4
  with:
    path: my-monorepo

- name: Create matrix from custom path
  id: matrix
  uses: skyhook-io/create-deployment-matrix@v1
  with:
    repo-path: my-monorepo
    tag: ${{ github.sha }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `tag` | The image tag to deploy | Yes | - |
| `github-token` | GitHub token for API access | Yes | - |
| `overlay` | Environment/overlay filter (e.g., dev, staging, production) | No | (all) |
| `branch` | Branch to use for deployment context | No | `main` |
| `repo-path` | Path to the repository root | No | `.` |

## Outputs

| Output | Description |
|--------|-------------|
| `matrix` | Parsed JSON matrix object ready for GitHub Actions `strategy.matrix` |
| `matrix-json` | Raw JSON string of the matrix for debugging or custom parsing |

## Matrix Output Format

The action generates a matrix with the following structure:

```json
{
  "include": [
    {
      "service": "api-service",
      "environment": "dev",
      "tag": "v1.2.3",
      "overlay": "overlays/dev"
    },
    {
      "service": "api-service",
      "environment": "production",
      "tag": "v1.2.3",
      "overlay": "overlays/production"
    },
    {
      "service": "web-service",
      "environment": "dev",
      "tag": "v1.2.3",
      "overlay": "overlays/dev"
    }
  ]
}
```

Each matrix entry includes:
- `service`: Service name from `.koala-monorepo.json`
- `environment`: Target environment (dev, staging, production, etc.)
- `tag`: Image tag to deploy
- `overlay`: Kustomize overlay path (if applicable)

## Configuration Files

### .koala-monorepo.json

Define your services at the repository root:

```json
{
  "services": [
    {
      "name": "api-service",
      "path": "services/api"
    },
    {
      "name": "web-service",
      "path": "services/web"
    },
    {
      "name": "worker-service",
      "path": "services/worker"
    }
  ]
}
```

### .koala.toml

Configure deployment settings per service:

```toml
[deployment]
environments = ["dev", "staging", "production"]

[deployment.dev]
replicas = 1
resources = "small"

[deployment.staging]
replicas = 2
resources = "medium"

[deployment.production]
replicas = 5
resources = "large"
```

## How It Works

1. **Validation**: Validates all required inputs and checks repository path
2. **Service Discovery**: Reads `.koala-monorepo.json` to identify services
3. **Configuration Parsing**: Extracts deployment settings from each service's `.koala.toml`
4. **Matrix Generation**: Uses `workflow-utils` to generate an optimized GitHub Actions matrix
5. **Filtering**: Applies environment filters if specified
6. **Output**: Returns both parsed and raw JSON formats

## Examples

### Complete CI/CD Pipeline

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api-service, web-service, worker-service]
    steps:
      - uses: actions/checkout@v4

      - name: Build and push ${{ matrix.service }}
        uses: skyhook-io/docker-build-push-action@v1
        with:
          context: services/${{ matrix.service }}
          tags: |
            ghcr.io/my-org/${{ matrix.service }}:${{ github.sha }}
            ghcr.io/my-org/${{ matrix.service }}:latest

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Create staging matrix
        id: matrix
        uses: skyhook-io/create-deployment-matrix@v1
        with:
          overlay: staging
          tag: ${{ github.sha }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Deploy to staging
        strategy:
          matrix: ${{ fromJson(steps.matrix.outputs.matrix) }}
        run: |
          kubectl set image deployment/${{ matrix.service }} \
            ${{ matrix.service }}=ghcr.io/my-org/${{ matrix.service }}:${{ matrix.tag }}

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    steps:
      - uses: actions/checkout@v4

      - name: Create production matrix
        id: matrix
        uses: skyhook-io/create-deployment-matrix@v1
        with:
          overlay: production
          tag: ${{ github.ref_name }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Deploy to production
        strategy:
          matrix: ${{ fromJson(steps.matrix.outputs.matrix) }}
        run: |
          kubectl set image deployment/${{ matrix.service }} \
            ${{ matrix.service }}=ghcr.io/my-org/${{ matrix.service }}:${{ matrix.tag }}
```

### Progressive Rollout

```yaml
name: Progressive Deployment

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy'
        required: true

jobs:
  deploy-dev:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to dev
        uses: skyhook-io/create-deployment-matrix@v1
        with:
          overlay: dev
          tag: ${{ inputs.version }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

  deploy-staging:
    needs: deploy-dev
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        uses: skyhook-io/create-deployment-matrix@v1
        with:
          overlay: staging
          tag: ${{ inputs.version }}
          github-token: ${{ secrets.GITHUB_TOKEN }}

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        uses: skyhook-io/create-deployment-matrix@v1
        with:
          overlay: production
          tag: ${{ inputs.version }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Troubleshooting

### Matrix is empty

Check that:
1. `.koala-monorepo.json` exists at repository root
2. Services have `.koala.toml` files with deployment configuration
3. If using `overlay`, the environment exists in your `.koala.toml` files

### Invalid JSON error

This usually means:
1. The `workflow-utils` package failed to execute
2. Configuration files have syntax errors
3. Check the action logs for detailed error messages

### Service not in matrix

Verify:
1. Service is listed in `.koala-monorepo.json`
2. Service has a `.koala.toml` file
3. If using environment filter, the service is configured for that environment

## Permissions

This action requires the following permissions:

```yaml
permissions:
  contents: read  # Read repository contents
```

## Dependencies

- **workflow-utils**: Automatically installed via npx (no setup required)
- **Node.js**: Available in GitHub Actions runners by default
- **jq**: Used for JSON validation (pre-installed in GitHub runners)

## Related Actions

- [skyhook-io/git-sync-commit](https://github.com/skyhook-io/git-sync-commit) - Commit and push deployment changes
- [skyhook-io/kustomize-deploy](https://github.com/skyhook-io/kustomize-deploy) - Deploy with Kustomize
- [skyhook-io/docker-build-push-action](https://github.com/skyhook-io/docker-build-push-action) - Build and push Docker images

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/skyhook-io/create-deployment-matrix).
