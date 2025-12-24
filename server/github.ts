
import { Octokit } from '@octokit/rest'

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

export async function createRepositoryAndPush(repoName: string, description: string) {
  const octokit = await getUncachableGitHubClient();
  
  // Get authenticated user
  const { data: user } = await octokit.users.getAuthenticated();
  
  // Check if repo exists
  let repoExists = false;
  try {
    await octokit.repos.get({
      owner: user.login,
      repo: repoName,
    });
    repoExists = true;
    console.log(`Repository ${repoName} already exists`);
  } catch (err: any) {
    if (err.status !== 404) throw err;
  }

  // Create new repository if it doesn't exist
  let repo;
  if (!repoExists) {
    const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: description,
      private: false,
      auto_init: false, // Don't auto-init so we can push our files
    });
    repo = newRepo;
    console.log(`Created repository: ${newRepo.full_name}`);
  } else {
    const { data: existingRepo } = await octokit.repos.get({
      owner: user.login,
      repo: repoName,
    });
    repo = existingRepo;
  }

  // Push files to repository using GitHub API
  await pushFilesToGitHub(octokit, user.login, repoName);

  return {
    success: true,
    message: `Repository ${repoExists ? 'already exists' : 'created successfully'} with code pushed`,
    url: `https://github.com/${user.login}/${repoName}`
  };
}

async function pushFilesToGitHub(octokit: any, owner: string, repo: string) {
  const fs = await import('fs');
  
  const filesToPush = [
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'tailwind.config.ts',
    'drizzle.config.ts',
    'README.md',
    'shared/schema.ts',
    'shared/routes.ts',
    'server/index.ts',
    'server/db.ts',
    'server/auth.ts',
    'server/storage.ts',
    'server/routes.ts',
    'server/openai.ts',
    'server/github.ts',
    'client/index.html',
    'client/src/App.tsx',
    'client/src/index.css',
    'client/src/main.tsx',
  ];

  // Create tree with files
  const treeItems = [];
  
  for (const filePath of filesToPush) {
    const fullPath = `/home/runner/workspace/${filePath}`;
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      treeItems.push({
        path: filePath,
        mode: '100644' as const,
        type: 'blob' as const,
        content: content,
      });
    }
  }

  // Check if main branch exists and get parent commit
  let parentShas: string[] = [];
  try {
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: 'heads/main',
    });
    parentShas = [refData.object.sha];
  } catch {
    // Branch doesn't exist yet, this is initial commit
  }

  // Create new tree
  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    tree: treeItems,
  });

  // Create commit
  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo,
    tree: tree.sha,
    message: 'Initial commit: OneClickApply - Two-sided hiring platform with AI screening',
    parents: parentShas,
  });

  // Create or update main branch
  try {
    await octokit.git.createRef({
      owner,
      repo,
      ref: 'refs/heads/main',
      sha: commit.sha,
    });
  } catch (err: any) {
    // Branch already exists, update it
    await octokit.git.updateRef({
      owner,
      repo,
      ref: 'heads/main',
      sha: commit.sha,
      force: true,
    });
  }

  console.log(`Pushed ${treeItems.length} files to GitHub`);
}
