#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawnSync, spawn } = require('child_process');

const VERSION = require('../package.json').version;
const AGENTSQUAD_ROOT = path.resolve(__dirname, '..');
const CWD = process.cwd();

// ── Helpers ─────────────────────────────────────────────────

function print(msg) { console.log(msg); }
function printError(msg) { console.error(`ERROR: ${msg}`); }
function printSuccess(msg) { console.log(`  [PASS] ${msg}`); }
function printFail(msg) { console.log(`  [FAIL] ${msg}`); }

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFile(src, dest) {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
}

function makeExecutable(filePath) {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch (e) {
    // Ignore on Windows
  }
}

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function ask(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

// ── Commands ────────────────────────────────────────────────

async function cmdInit() {
  print('');
  print('  agentsquad init — Setting up autonomous AI development toolkit');
  print('  ─────────────────────────────────────────────────────────');
  print('');

  // Support non-interactive mode via env vars or --yes flag
  const nonInteractive = process.argv.includes('--yes') || process.argv.includes('-y') || !process.stdin.isTTY;

  let projectName, description, buildCmd, testCmd, e2eCmd, lintCmd, mainBranch;

  if (nonInteractive) {
    projectName = process.env.AGENTSQUAD_PROJECT || path.basename(CWD);
    description = process.env.AGENTSQUAD_DESCRIPTION || '';
    buildCmd = process.env.AGENTSQUAD_BUILD_CMD || 'npm run build';
    testCmd = process.env.AGENTSQUAD_TEST_CMD || 'npm test';
    e2eCmd = process.env.AGENTSQUAD_E2E_CMD || 'npx playwright test';
    lintCmd = process.env.AGENTSQUAD_LINT_CMD || 'npm run lint';
    mainBranch = process.env.AGENTSQUAD_MAIN_BRANCH || 'main';
    print(`  Non-interactive mode (--yes or piped stdin)`);
    print(`  Project: ${projectName}, Build: ${buildCmd}, Test: ${testCmd}`);
  } else {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    projectName = await ask(rl, 'Project name', path.basename(CWD));
    description = await ask(rl, 'Description', '');
    buildCmd = await ask(rl, 'Build command', 'npm run build');
    testCmd = await ask(rl, 'Test command', 'npm test');
    e2eCmd = await ask(rl, 'E2E test command', 'npx playwright test');
    lintCmd = await ask(rl, 'Lint command', 'npm run lint');
    mainBranch = await ask(rl, 'Main branch', 'main');

    rl.close();
  }

  print('');
  print('Setting up AgentSquad...');

  // 1. Create .tasks directory
  const tasksDir = path.join(CWD, '.tasks');
  fs.mkdirSync(path.join(tasksDir, '_interfaces'), { recursive: true });
  fs.mkdirSync(path.join(tasksDir, '_completed'), { recursive: true });
  fs.writeFileSync(path.join(tasksDir, '.gitkeep'), '');
  print('  Created .tasks/ directory');

  // 2. Copy core scripts to scripts/agentsquad/
  const scriptsDir = path.join(CWD, 'scripts', 'agentsquad');
  copyDir(path.join(AGENTSQUAD_ROOT, 'core', 'scripts'), scriptsDir);
  // Make all scripts executable
  if (fs.existsSync(scriptsDir)) {
    for (const f of fs.readdirSync(scriptsDir)) {
      if (f.endsWith('.sh')) makeExecutable(path.join(scriptsDir, f));
    }
  }
  print('  Copied core scripts to scripts/agentsquad/');

  // 3. Set up .claude directory
  const claudeDir = path.join(CWD, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // 4. Merge settings fragment into settings.json
  const settingsPath = path.join(claudeDir, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      const backup = settingsPath + '.backup.' + Date.now();
      fs.copyFileSync(settingsPath, backup);
      print(`  WARNING: ${settingsPath} invalid JSON — backed up to ${backup}`);
      settings = {};
    }
  }

  // Add allowed tools for agentsquad scripts
  if (!settings.permissions) settings.permissions = {};
  if (!settings.permissions.allow) settings.permissions.allow = [];

  const squadPermissions = [
    'Bash(scripts/agentsquad/*)',
    'Bash(jq *)',
    'Bash(tmux *)',
    'Bash(gh issue *)',
    'Bash(gh pr *)',
    'Bash(git *)',
  ];

  for (const perm of squadPermissions) {
    if (!settings.permissions.allow.includes(perm)) {
      settings.permissions.allow.push(perm);
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  print('  Updated .claude/settings.json with AgentSquad permissions');

  // 5. Copy hooks to .claude/hooks/
  const hooksDir = path.join(claudeDir, 'hooks');
  copyDir(path.join(AGENTSQUAD_ROOT, 'core', 'hooks'), hooksDir);
  if (fs.existsSync(hooksDir)) {
    for (const f of fs.readdirSync(hooksDir)) {
      if (f.endsWith('.sh')) makeExecutable(path.join(hooksDir, f));
    }
  }
  print('  Copied hooks to .claude/hooks/');

  // 6. Copy templates to .claude/templates/
  copyDir(path.join(AGENTSQUAD_ROOT, 'core', 'templates'), path.join(claudeDir, 'templates'));
  print('  Copied templates to .claude/templates/');

  // 7. Copy commands to .claude/commands/
  copyDir(path.join(AGENTSQUAD_ROOT, 'core', 'commands'), path.join(claudeDir, 'commands'));
  print('  Copied commands to .claude/commands/');

  // 8. Copy skills to .claude/skills/
  copyDir(path.join(AGENTSQUAD_ROOT, 'core', 'skills'), path.join(claudeDir, 'skills'));
  print('  Copied skills to .claude/skills/');

  // 9. Copy agents to .claude/agents/
  copyDir(path.join(AGENTSQUAD_ROOT, 'core', 'agents'), path.join(claudeDir, 'agents'));
  print('  Copied agents to .claude/agents/');

  // 10. Copy task repo templates
  copyDir(path.join(AGENTSQUAD_ROOT, 'core', 'tasks'), path.join(CWD, '.tasks'));
  print('  Copied task repository templates');

  // 11. Merge hooks config from settings-fragment.json
  const fragmentPath = path.join(AGENTSQUAD_ROOT, 'core', 'settings-fragment.json');
  if (fs.existsSync(fragmentPath)) {
    const fragment = JSON.parse(fs.readFileSync(fragmentPath, 'utf8'));
    // Merge env
    if (fragment.env) {
      if (!settings.env) settings.env = {};
      Object.assign(settings.env, fragment.env);
    }
    // Merge hooks
    if (fragment.hooks) {
      if (!settings.hooks) settings.hooks = {};
      for (const [hookType, hookEntries] of Object.entries(fragment.hooks)) {
        if (!settings.hooks[hookType]) settings.hooks[hookType] = [];
        for (const entry of hookEntries) {
          // Avoid duplicates by checking command
          const existing = settings.hooks[hookType].some(e =>
            e.hooks && e.hooks.some(h => entry.hooks && entry.hooks.some(eh => eh.command === h.command))
          );
          if (!existing) {
            settings.hooks[hookType].push(entry);
          }
        }
      }
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    print('  Merged hooks configuration into .claude/settings.json');
  }

  // 12. Create project config
  const configPath = path.join(claudeDir, 'agentsquad.json');
  const config = {
    project: projectName,
    description,
    commands: {
      build: buildCmd,
      test: testCmd,
      e2e: e2eCmd,
      lint: lintCmd,
    },
    mainBranch,
    tasksDir: '.tasks',
    maxWorkers: 3,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  print('  Created .claude/agentsquad.json');

  // 6. Add .claude/loop.local.md to .gitignore
  const gitignorePath = path.join(CWD, '.gitignore');
  let gitignore = '';
  if (fs.existsSync(gitignorePath)) {
    gitignore = fs.readFileSync(gitignorePath, 'utf8');
  }
  if (!gitignore.includes('.claude/loop.local.md')) {
    const addition = '\n# AgentSquad — local loop state\n.claude/loop.local.md\n';
    fs.appendFileSync(gitignorePath, addition);
    print('  Added .claude/loop.local.md to .gitignore');
  }

  // 7. Print alias command
  print('');
  print('  Setup complete! Add this alias to your shell profile:');
  print('');
  print(`    alias squadmode='AGENTSQUAD_LOOP_ENABLED=1 claude --model claude-opus-4-6 --dangerously-skip-permissions'`);
  print('');

  // 8. Run doctor
  print('  Running doctor...');
  print('');
  cmdDoctor();
}

function cmdAdd(packName) {
  if (!packName) {
    printError('Usage: agentsquad add <pack>');
    print('  Available packs: collab, github, vercel, notifications, supabase');
    process.exit(1);
  }

  const packDir = path.join(AGENTSQUAD_ROOT, 'packs', packName);
  if (!fs.existsSync(packDir)) {
    printError(`Unknown pack: ${packName}`);
    print('  Available packs: collab, github, vercel, notifications, supabase');
    process.exit(1);
  }

  print(`Adding pack: ${packName}`);

  // Copy scripts to scripts/agentsquad/ (or scripts/agentsquad/<pack>/)
  const packScripts = path.join(packDir, 'scripts');
  if (fs.existsSync(packScripts)) {
    const destScripts = path.join(CWD, 'scripts', 'agentsquad');
    copyDir(packScripts, destScripts);
    // Make executable
    for (const f of fs.readdirSync(destScripts)) {
      if (f.endsWith('.sh')) makeExecutable(path.join(destScripts, f));
    }
    print(`  Copied scripts to scripts/agentsquad/`);
  }

  // Copy bin to scripts/agentsquad/bin/ or .claude/bin/
  const packBin = path.join(packDir, 'bin');
  if (fs.existsSync(packBin)) {
    const destBin = path.join(CWD, 'scripts', 'agentsquad', 'bin');
    copyDir(packBin, destBin);
    for (const f of fs.readdirSync(destBin)) {
      if (f.endsWith('.sh')) makeExecutable(path.join(destBin, f));
    }
    print(`  Copied bin scripts`);
  }

  // Copy commands to .claude/commands/
  const packCommands = path.join(packDir, 'commands');
  if (fs.existsSync(packCommands)) {
    const destCommands = path.join(CWD, '.claude', 'commands');
    copyDir(packCommands, destCommands);
    print(`  Copied commands to .claude/commands/`);
  }

  // Copy specs dir if present
  const packSpecs = path.join(packDir, 'specs');
  if (fs.existsSync(packSpecs)) {
    const destSpecs = path.join(CWD, '.collab', 'specs');
    fs.mkdirSync(destSpecs, { recursive: true });
    copyDir(packSpecs, destSpecs);
    print(`  Created .collab/specs/`);
  }

  print(`  Pack "${packName}" added successfully.`);
}

function cmdDoctor() {
  print('  agentsquad doctor — checking your setup');
  print('  ───────────────────────────────────');
  let allGood = true;

  // Check: claude CLI
  if (commandExists('claude')) {
    printSuccess('claude CLI found');
  } else {
    printFail('claude CLI not found — install from https://docs.anthropic.com/en/docs/claude-code');
    allGood = false;
  }

  // Check: jq
  if (commandExists('jq')) {
    printSuccess('jq found');
  } else {
    printFail('jq not found — install via: brew install jq (or apt install jq)');
    allGood = false;
  }

  // Check: node
  if (commandExists('node')) {
    printSuccess('node found');
  } else {
    printFail('node not found');
    allGood = false;
  }

  // Check: tmux
  if (commandExists('tmux')) {
    printSuccess('tmux found');
  } else {
    printFail('tmux not found — install via: brew install tmux (or apt install tmux)');
    allGood = false;
  }

  // Check: gh
  if (commandExists('gh')) {
    printSuccess('gh CLI found');
  } else {
    printFail('gh CLI not found — install from https://cli.github.com');
    allGood = false;
  }

  // Check: .claude/settings.json
  const settingsPath = path.join(CWD, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    printSuccess('.claude/settings.json exists');
  } else {
    printFail('.claude/settings.json not found — run agentsquad init');
    allGood = false;
  }

  // Check: .tasks directory
  const tasksDir = path.join(CWD, '.tasks');
  if (fs.existsSync(tasksDir)) {
    printSuccess('.tasks/ directory exists');
  } else {
    printFail('.tasks/ directory not found — run agentsquad init');
    allGood = false;
  }

  // Check: scripts/agentsquad/ with executable permissions
  const scriptsDir = path.join(CWD, 'scripts', 'agentsquad');
  if (fs.existsSync(scriptsDir)) {
    const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.sh'));
    if (scripts.length > 0) {
      let allExec = true;
      for (const s of scripts) {
        try {
          const stat = fs.statSync(path.join(scriptsDir, s));
          if (!(stat.mode & 0o111)) allExec = false;
        } catch {
          allExec = false;
        }
      }
      if (allExec) {
        printSuccess(`scripts/agentsquad/ — ${scripts.length} scripts, all executable`);
      } else {
        printFail('scripts/agentsquad/ — some scripts not executable. Run: chmod +x scripts/agentsquad/*.sh');
        allGood = false;
      }
    } else {
      printFail('scripts/agentsquad/ exists but has no .sh files');
      allGood = false;
    }
  } else {
    printFail('scripts/agentsquad/ not found — run agentsquad init');
    allGood = false;
  }

  print('');
  if (allGood) {
    print('  All checks passed. You are ready to go.');
  } else {
    print('  Some checks failed. Fix the issues above and run: agentsquad doctor');
  }
}

// ── Start / Status / Stop ──────────────────────────────────

function detectProject() {
  const name = path.basename(CWD);
  // Node.js
  if (fs.existsSync(path.join(CWD, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(CWD, 'package.json'), 'utf8'));
      return {
        name: pkg.name || name,
        build: pkg.scripts?.build ? 'npm run build' : 'echo "no build"',
        test: pkg.scripts?.test ? 'npm test' : 'echo "no tests"',
        lint: pkg.scripts?.lint ? 'npm run lint' : '',
        description: pkg.description || '',
      };
    } catch {
      // Malformed package.json — use name-only fallback
      return { name, build: 'npm run build', test: 'npm test', lint: '', description: '' };
    }
  }
  // Python
  if (fs.existsSync(path.join(CWD, 'requirements.txt')) || fs.existsSync(path.join(CWD, 'pyproject.toml'))) {
    return { name, build: 'python3 -m pytest', test: 'python3 -m pytest', lint: '', description: '' };
  }
  // Go
  if (fs.existsSync(path.join(CWD, 'go.mod'))) {
    return { name, build: 'go build ./...', test: 'go test ./...', lint: '', description: '' };
  }
  // Rust
  if (fs.existsSync(path.join(CWD, 'Cargo.toml'))) {
    return { name, build: 'cargo build', test: 'cargo test', lint: '', description: '' };
  }
  // Fallback
  return { name, build: 'echo "no build"', test: 'echo "no tests"', lint: '', description: '' };
}

function loadEnvFile() {
  // Check .env.local first, then .env (projects use different conventions)
  let envPath = path.join(CWD, '.env.local');
  if (!fs.existsSync(envPath)) {
    envPath = path.join(CWD, '.env');
  }
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    // Strip 'export ' prefix
    if (line.startsWith('export ')) line = line.slice(7);
    const match = line.match(/^(TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|SLACK_WEBHOOK_URL|AGENTSQUAD_\w+)\s*=\s*(.+)/);
    if (match && !process.env[match[1]]) {
      let value = match[2].trim();
      // Strip quotes
      value = value.replace(/^["']|["']$/g, '');
      // Strip inline comment (only if not inside quotes)
      value = value.replace(/\s+#.*$/, '');
      process.env[match[1]] = value;
    }
  }
}

function ensureGitHubLabels() {
  if (!commandExists('gh')) { print('  gh CLI not found — skipping label creation'); return; }
  const labels = [
    { name: 'squad:ready', color: '0E8A16', desc: 'Ready for AgentSquad' },
    { name: 'squad:queued', color: 'FBCA04', desc: 'In queue' },
    { name: 'squad:in-progress', color: '1D76DB', desc: 'Being processed' },
    { name: 'squad:complete', color: '6F42C1', desc: 'Completed' },
    { name: 'squad:failed', color: 'D93F0B', desc: 'Failed' },
    { name: 'squad:triage', color: 'C5DEF5', desc: 'Needs triage' },
  ];
  let created = 0;
  for (const l of labels) {
    try {
      execSync(`gh label create "${l.name}" --color "${l.color}" --description "${l.desc}" --force`, { stdio: 'pipe', cwd: CWD });
      created++;
    } catch { /* ignore — maybe no repo access */ }
  }
  if (created > 0) print(`  GitHub labels ensured (${created} labels)`);
  else print('  GitHub labels: could not create (check gh auth)');
}

function syncGitHubIssues() {
  if (!commandExists('gh')) return;
  try {
    const issuesJson = execSync('gh issue list --label "squad:ready" --state open --json number,title,body --limit 20', { cwd: CWD, encoding: 'utf8' });
    const issues = JSON.parse(issuesJson);
    const tasksDir = path.join(CWD, '.tasks');
    let synced = 0;
    for (const issue of issues) {
      const taskDir = path.join(tasksDir, `issue-${issue.number}`);
      if (fs.existsSync(path.join(taskDir, 'status.json'))) continue; // already exists
      fs.mkdirSync(taskDir, { recursive: true });
      // Parse dependencies from body
      // Store as "issue-<number>" to match task directory names, since
      // conductor.sh checks .tasks/$dep/status.json for each dependency
      const deps = [];
      const depMatches = (issue.body || '').matchAll(/depends[- ]?on:?\s*#(\d+)/gi);
      for (const m of depMatches) deps.push(`issue-${m[1]}`);
      // Detect complexity from body
      let complexity = 'medium';
      const compMatch = (issue.body || '').match(/\*\*Complexity:\s*(\w+)\*\*/i);
      if (compMatch) complexity = compMatch[1].toLowerCase();
      // Create status.json
      const status = {
        task_id: `issue-${issue.number}`,
        kind: 'feature',
        status: 'ready',
        priority: 'P1',
        complexity,
        type: 'implement',
        branch: '',
        github_issue: issue.number,
        title: issue.title,
        pr_url: '',
        attempts: 0,
        max_iterations: 15,
        dependencies: deps,
        updated_at: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(taskDir, 'status.json'), JSON.stringify(status, null, 2) + '\n');
      fs.writeFileSync(path.join(taskDir, 'acceptance-criteria.md'), issue.body || '');
      synced++;
    }
    if (synced > 0) print(`  Synced ${synced} GitHub issues to .tasks/`);
    else print('  No new squad:ready issues to sync');
  } catch (e) {
    print('  Could not sync GitHub issues (gh CLI error)');
  }
}

function startConductor() {
  const conductorPath = path.join(CWD, 'scripts', 'agentsquad', 'conductor.sh');
  if (!fs.existsSync(conductorPath)) {
    printError('conductor.sh not found — run agentsquad init first');
    process.exit(1);
  }

  // Check if already running via persistent pid file (not the transient tick lock)
  const pidFile = path.join(CWD, '.tasks', '.conductor.pid');
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
    try {
      process.kill(pid, 0);
      print(`  Conductor already running (PID ${pid})`);
      return;
    } catch {
      // Stale pid file — process died
      fs.unlinkSync(pidFile);
    }
  }

  print('');
  print('  Starting conductor...');
  print('  To run in Claude Code: /loop 3m /conductor');
  print('  To run standalone: bash scripts/agentsquad/conductor.sh --loop 3m');
  print('');

  // Start conductor in background
  const conductor = spawn('bash', [conductorPath, '--loop', '3m'], {
    cwd: CWD,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, AGENTSQUAD_PROJECT_ROOT: CWD },
  });
  conductor.unref();

  // Write pid file for daemon tracking (separate from tick lock)
  fs.writeFileSync(pidFile, String(conductor.pid));

  print(`  Conductor started (PID ${conductor.pid})`);
  print('');
  print('  Commands:');
  print('    agentsquad status    — see what\'s happening');
  print('    agentsquad stop      — stop the conductor');
  print('');
}

async function cmdStart() {
  print('');
  print('  agentsquad start — plug-and-play autonomous development');
  print('  ─────────────────────────────────────────────────────────');
  print('');

  // 1. Auto-detect project type if no agentsquad.json exists
  if (!fs.existsSync(path.join(CWD, '.claude', 'agentsquad.json'))) {
    // Check if .claude/ has existing custom setup
    const hasExistingSetup = fs.existsSync(path.join(CWD, '.claude', 'settings.json'));
    if (hasExistingSetup) {
      print('  Existing .claude/ setup detected — installing AgentSquad alongside it');
    }
    print('  No agentsquad.json found — auto-detecting project...');
    const detected = detectProject();
    print(`  Detected: ${detected.name} (build: ${detected.build}, test: ${detected.test})`);
    // Run init with detected values
    process.env.AGENTSQUAD_PROJECT = detected.name;
    process.env.AGENTSQUAD_BUILD_CMD = detected.build;
    process.env.AGENTSQUAD_TEST_CMD = detected.test;
    process.env.AGENTSQUAD_LINT_CMD = detected.lint;
    process.env.AGENTSQUAD_MAIN_BRANCH = 'main';
    process.argv.push('--yes'); // force non-interactive
    await cmdInit();
    // Install all packs
    for (const pack of ['github', 'collab', 'notifications']) {
      cmdAdd(pack);
    }
  } else {
    print('  Found existing agentsquad.json — skipping init');
  }

  // 2. Load credentials from environment or .env.local
  loadEnvFile();

  // 3. Ensure GitHub labels (idempotent)
  ensureGitHubLabels();

  // 4. Sync squad:ready issues from GitHub → create .tasks/ dirs
  syncGitHubIssues();

  // 5. Start conductor
  startConductor();
}

function cmdStatus() {
  const conductorPath = path.join(CWD, 'scripts', 'agentsquad', 'conductor.sh');
  if (fs.existsSync(conductorPath)) {
    try {
      const output = execSync(`bash "${conductorPath}" status`, { cwd: CWD, encoding: 'utf8', env: { ...process.env, AGENTSQUAD_PROJECT_ROOT: CWD } });
      print(output);
    } catch {
      print('  No conductor status available');
    }
  } else {
    print('  AgentSquad not initialized — run: agentsquad start');
  }
}

function cmdStop() {
  const pidFile = path.join(CWD, '.tasks', '.conductor.pid');
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
    try {
      process.kill(pid, 'SIGTERM');
      print(`  Conductor stopped (PID ${pid})`);
    } catch {
      print('  Conductor process not found (stale pid)');
    }
    try { fs.unlinkSync(pidFile); } catch {}
  } else {
    print('  No conductor running');
  }
  // Also clean up transient tick lock if present
  const lockDir = path.join(CWD, '.tasks', '.conductor.lock.d');
  try { fs.rmSync(lockDir, { recursive: true }); } catch {}
}

function cmdVersion() {
  print(`agentsquad v${VERSION}`);
}

function cmdHelp() {
  print(`
  agentsquad v${VERSION} — Autonomous AI development toolkit for Claude Code

  Usage:
    agentsquad <command> [options]

  Commands:
    start             Auto-detect, install, sync issues, and start the Conductor
    init              Set up AgentSquad in the current project (interactive)
    add <pack>        Install an optional pack (collab, github, vercel, notifications, supabase)
    doctor            Check that all dependencies and config are in place
    status            Show conductor and task queue status
    stop              Stop the conductor
    version           Print version
    help              Show this help message

  Environment Variables:
    AGENTSQUAD_TASKS_DIR        Task repository directory (default: .tasks)
    AGENTSQUAD_TMUX_SESSION     tmux session name for workers (default: project dirname)
    AGENTSQUAD_NOTIFY_WEBHOOK   Webhook URL for notifications (Slack, Discord, etc.)
    AgentSquad_MAX_WORKERS      Max concurrent workers (default: 3)
    AGENTSQUAD_SECONDARY_MODEL  Model for collab pack (default: gpt-5.4)
    AGENTSQUAD_SECONDARY_CLI    CLI for collab pack (default: codex)

  Getting started:
    cd your-project
    npx agentsquad start         # one command — auto-detects everything

  Or step by step:
    npx agentsquad init
    agentsquad add collab        # optional: cross-model collaboration
    agentsquad add github        # optional: GitHub issue orchestration

  Documentation: https://github.com/AlessioZazzarini/AgentSquad
  `);
}

// ── Main ────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case 'start':
    cmdStart().catch(e => { printError(e.message); process.exit(1); });
    break;
  case 'init':
    cmdInit().catch(e => { printError(e.message); process.exit(1); });
    break;
  case 'add':
    cmdAdd(args[0]);
    break;
  case 'doctor':
    cmdDoctor();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'stop':
    cmdStop();
    break;
  case 'version':
  case '--version':
  case '-v':
    cmdVersion();
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    cmdHelp();
    break;
  default:
    printError(`Unknown command: ${command}`);
    cmdHelp();
    process.exit(1);
}
