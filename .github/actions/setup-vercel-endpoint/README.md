# Setup Vercel Endpoint Action

This composite action constructs a Vercel deployment endpoint URL based on the branch name and waits for the deployment to be ready.

## Usage

```yaml
- name: Setup Vercel endpoint
  id: vercel
  uses: ./.github/actions/setup-vercel-endpoint
  with:
    vercel-endpoint-override: ${{ secrets.VERCEL_ENDPOINT }}
    vercel-bypass-secret: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
    branch-name: ${{ github.head_ref || github.ref_name }}
```

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `vercel-endpoint-override` | Override Vercel endpoint URL (if set, skips construction) | No | `''` |
| `vercel-bypass-secret` | Vercel protection bypass secret for authentication | No | `''` |
| `branch-name` | Branch name to construct endpoint from | Yes | - |
| `max-attempts` | Maximum number of attempts to wait for deployment | No | `30` |
| `wait-interval` | Time in seconds to wait between attempts | No | `10` |

## Outputs

| Name | Description |
|------|-------------|
| `vercel-endpoint` | The Vercel endpoint URL (e.g., `https://spice-js-git-branch-name-spice.vercel.app` or `https://spice-js.vercel.app`) |
| `vercel-api-endpoint` | The Vercel API endpoint URL (endpoint + `/api`) |

## How It Works

1. **Tag Detection**: If the branch name is a tag (starts with `v` followed by a number, e.g., `v3.0.0`), it uses the production domain: `https://spice-js.vercel.app`

2. **Branch Construction**: For regular branches, takes the branch name, converts it to lowercase, replaces `/` with `-`, and constructs the Vercel preview URL pattern: `https://spice-js-git-{branch-slug}-spice.vercel.app`

3. **Override Support**: If `vercel-endpoint-override` is provided, uses that instead of the constructed URL

4. **Wait for Ready**: Polls the `/health` endpoint until it returns HTTP 200 with "ok" in the response body, or until max attempts is reached

5. **Bypass Protection**: If `vercel-bypass-secret` is provided, includes the `x-vercel-protection-bypass` header in health check requests

## Examples

### Branch-based deployment (PR)
```yaml
- name: Setup Vercel endpoint
  id: vercel
  uses: ./.github/actions/setup-vercel-endpoint
  with:
    branch-name: ${{ github.head_ref }}
    vercel-bypass-secret: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}

- name: Run tests against Vercel
  run: npm test
  env:
    VERCEL_ENDPOINT: ${{ steps.vercel.outputs.vercel-api-endpoint }}
```

Result: `https://spice-js-git-my-branch-name-spice.vercel.app`

### Tag-based deployment (Release)
```yaml
- name: Setup Vercel endpoint
  id: vercel
  uses: ./.github/actions/setup-vercel-endpoint
  with:
    branch-name: ${{ github.ref_name }}  # Will be like "v3.0.0"
    vercel-bypass-secret: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
```

Result: `https://spice-js.vercel.app` (production)
