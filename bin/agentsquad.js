#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawnSync } = require('child_process');

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

function cmdVersion() {
  print(`agentsquad v${VERSION}`);
}

function cmdHelp() {
  print(`
  agentsquad v${VERSION} — Autonomous AI development toolkit for Claude Code

  Usage:
    agentsquad <command> [options]

  Commands:
    init              Set up AgentSquad in the current project
    add <pack>        Install an optional pack (collab, github, vercel, notifications, supabase)
    doctor            Check that all dependencies and config are in place
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
    npx agentsquad init
    agentsquad add collab        # optional: cross-model collaboration
    agentsquad add github        # optional: GitHub issue orchestration

  Documentation: https://github.com/AlessioZazzarini/AgentSquad
  `);
}

// ── Main ────────────────────────────────────────────────────

const [,, command, ...args] = process.argv;

switch (command) {
  case 'init':
    cmdInit().catch(e => { printError(e.message); process.exit(1); });
    break;
  case 'add':
    cmdAdd(args[0]);
    break;
  case 'doctor':
    cmdDoctor();
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
