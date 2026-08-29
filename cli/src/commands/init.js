const { Command } = require('commander');
const { fingerprintRepo } = require('../fingerprint.js');
const {
  backupFile,
  restoreBackups,
  writeFileAtomic,
  appendFileAtomic,
  deepMerge,
  generateStateJson,
  readStateJson,
  WizardAnswers,
  DEFAULT_ANSWERS,
} = require('../wizard.js');
const { join, dirname } = require('node:path');
const { access, readFile, mkdir } = require('node:fs/promises');
const prompts = require('prompts');
const { execa } = require('execa');
const { VERSION } = require('../types.js');
const os = require('node:os');
const homedir = require('os').homedir();
const { promises: fsPromises } = require('fs');
const {
  isCommandAvailable,
  installCli,
  printManualInstall,
} = require('../services/cliInstall.js');

// Path to user-wide defaults file
const USER_DEFAULTS_PATH = join(homedir, '.hermes', 'ciclo-defaults.json');

/**
 * Load user defaults from ~/.hermes/ciclo-defaults.json
 * @returns {Promise<Object|null>} null if file does not exist or is invalid
 */
async function loadUserDefaults() {
  try {
    const data = await fsPromises.readFile(USER_DEFAULTS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    // File does not exist or invalid JSON
    return null;
  }
}

const initCommand = new Command()
  .command('init')
  .description('Initialize ciclo in the current repository (wizard)')
  .option('-y, --yes', 'accept defaults for all prompts')
  .action(async (opts) => {
    const cwd = process.cwd();
    console.log(`🔧 Initializing ciclo in ${cwd}`);

    // Load user defaults
    let userDefaults = null;
    try {
      userDefaults = await loadUserDefaults();
    } catch (err) {
      // ignore, userDefaults remains null
    }

    // 1. Pre-flight: check node, git
    try {
      await access(join(cwd, '.git'));
    } catch {
       console.error("✗ Not a git repository. Please run 'git init' first.");
      process.exit(1);
    }

    // 2. Fingerprint
    console.log('🔍 Scanning repository...');
    const fingerprint = await fingerprintRepo(cwd);
    console.log(`   📦 Package: ${fingerprint.packageName || '(none)'}`);
    console.log(`   📦 Manager: ${fingerprint.packageManager || '(none)'}`);
    console.log(`   💬 Language: ${fingerprint.language || '(none)'}`);
    console.log(`   ⚛️  Frameworks: ${fingerprint.frameworks.join(', ') || '(none)'}`);
    console.log(`   🧪 Test runner: ${fingerprint.testRunner || '(none)'}`);
    console.log(`   🔧 GH Workflows: ${fingerprint.hasGithubWorkflows ? 'yes' : 'no'}`);

    // 3. Check if already initialized
    const existingState = await readStateJson(cwd);
    let existingConfig = null;
    let configPath = join(cwd, '.ciclo', 'config.json');
    try {
      const raw = await readFile(configPath, 'utf8');
      existingConfig = JSON.parse(raw);
    } catch {
      // ignore
    }

    // Determine default devName: existing config/state, then user defaults, else system user
    const defaultDevName =
      (existingConfig && existingConfig.devName) ||
      (existingState && existingState.devName) ||
      (userDefaults && userDefaults.devName) ||
      os.userInfo().username ||
      '';

    // Determine default task prefix: existing config/state, then user defaults, else 'TASK'
    const defaultTaskPrefix =
      (existingConfig && existingConfig.taskPrefix) ||
      (existingState && existingState.taskPrefix) ||
      (userDefaults && userDefaults.taskPrefix) ||
      'TASK';

    // 4. Wizard questions (basic)
    let answers = DEFAULT_ANSWERS;
    if (!opts.yes) {
      const basicQuestions = [
        {
          type: 'text',
          name: 'devName',
          message: 'Your name (for attributing agent actions):',
          initial: defaultDevName,
          validate: (value) =>
            value.length > 0 || 'Please enter your name',
        },
        {
          type: 'text',
          name: 'taskPrefix',
          message: 'Task prefix (e.g., TASK, PROJ):',
          initial: defaultTaskPrefix,
          validate: (value) =>
            /^[A-Z]+$/.test(value) ||
            'Please use uppercase letters only',
        },
      ];

      const basicResponse = await prompts(basicQuestions, {
        onCancel: () => {
          console.error('\n✗ Initialization cancelled');
          process.exit(1);
        },
      });

      answers = {
        ...DEFAULT_ANSWERS,
        devName: basicResponse.devName,
        taskPrefix: basicResponse.taskPrefix,
      };
    } else {
      console.log('🔧 Using defaults (--yes flag)');
      answers = {
        ...DEFAULT_ANSWERS,
        devName:
          (existingConfig && existingConfig.devName) ||
          (existingState && existingState.devName) ||
          (userDefaults && userDefaults.devName) ||
          os.userInfo().username ||
          '',
        taskPrefix:
          (existingConfig && existingConfig.taskPrefix) ||
          (existingState && existingState.taskPrefix) ||
          (userDefaults && userDefaults.taskPrefix) ||
          'TASK',
      };
    }

    // 5. Service configuration (Jira required; GitHub needs no config - checked via gh auth at runtime)
    // Jira is now validated via the official Atlassian CLI (ACLI) instead of REST env vars.
    // ACLI stores the session in the user's home; the project only records siteUrl/projectKey as metadata.
    //
    // If acli/gh are missing, offer automatic installation (per-OS) or show manual instructions.
    const validateJira = async () => {
      const JiraTaskStore = require('../services/JiraTaskStore.js');
      const store = new JiraTaskStore();
      // acli may be resolvable by the store (fixed paths: ~/bin, /usr/local/bin, ...)
      // even when it is not on the current PATH — so check that first
      if (!store.acliPath) {
        const acliOk = await ensureCliInstalled('acli', !opts.yes);
        if (!acliOk) {
          console.error('\n✗ ACLI (Atlassian CLI) é obrigatória para Jira. Instale e tente novamente.');
          process.exit(1);
        }
        // re-resolve after install
        const store2 = new JiraTaskStore();
        if (!store2.acliPath) {
          console.error('\n✗ ACLI não encontrada no PATH após o setup.');
          printManualInstall('acli');
          process.exit(1);
        }
        const check2 = await store2.testConnection();
        return { store: store2, check: check2 };
      }
      const check = await store.testConnection();
      return { store, check };
    };
    if (!opts.yes) {
      // --- Jira (MANDATORY) ---
      console.log('\n🔌 Jira configuration (required)');
      const { check } = await validateJira();
      if (!check.ok) {
        console.error(`\n✗ Jira not authenticated via ACLI: ${check.error}`);
        console.error('   Run `acli jira auth login --web` (OAuth) OR');
        console.error('   echo $TOKEN | acli jira auth login --site "site.atlassian.net" --email "user@..." --token');
        process.exit(1);
      }
      // Optional project key (can be overridden by env var)
      const siteHint = process.env.JIRA_BASE_URL || 'https://yourcompany.atlassian.net';
      const jiraProjectKey = process.env.JIRA_PROJECT_KEY || '';
      const jiraDefaults = userDefaults && userDefaults.services?.jira;
      answers.services = {
        ...answers.services,
        jira: {
          configured: true,
          method: 'acli',
          siteUrl: (jiraDefaults && jiraDefaults.siteUrl) || siteHint,
          projectKey: (jiraDefaults && jiraDefaults.projectKey) || (jiraProjectKey.length > 0 ? jiraProjectKey.trim() : null),
        },
      };

    } else {
      console.log('🔧 Using defaults (--yes flag) - configuring Jira via ACLI');
      const { check } = await validateJira();
      if (!check.ok) {
        console.error(`\n✗ Jira not authenticated via ACLI: ${check.error}`);
        console.error('   Run `acli jira auth login --web` (OAuth) OR');
        console.error('   echo $TOKEN | acli jira auth login --site "site.atlassian.net" --email "user@..." --token');
        process.exit(1);
      }
      // Optional project key (can be overridden by env var)
      const siteHint = process.env.JIRA_BASE_URL || 'https://yourcompany.atlassian.net';
      const jiraProjectKey = process.env.JIRA_PROJECT_KEY || '';
      const jiraDefaults = userDefaults && userDefaults.services?.jira;
      answers.services = {
        ...answers.services,
        jira: {
          configured: true,
          method: 'acli',
          siteUrl: (jiraDefaults && jiraDefaults.siteUrl) || siteHint,
          projectKey: (jiraDefaults && jiraDefaults.projectKey) || (jiraProjectKey.length > 0 ? jiraProjectKey.trim() : null),
        },
      };
    }// 5.5. Skills configuration (optional)
    // 5.6. GitHub CLI check (optional install)
    if (!opts.yes) {
      if (!isCommandAvailable('gh')) {
        console.log('\n🔌 GitHub CLI (gh) — necessário para push de branches e PRs');
        const installGh = await prompts({
          type: 'confirm',
          name: 'installGh',
          message: 'gh não encontrado. Deseja instalar automaticamente?',
          initial: true,
        });
        if (installGh.installGh) {
          await installCli('gh');
        } else {
          printManualInstall('gh');
          console.log('   (Você pode continuar; GitHub fica disponível após instalar.)');
        }
      }
    }
    if (!opts.yes) {
      console.log('\n🔧 Skill configuration (optional, enables AI-assisted features)');
      const skillCategories = [
        { title: 'Hermes Agent core (configuration, orchestration)', value: 'hermes-agent' },
        { title: 'Coding agents (Claude Code, OpenCode, etc.)', value: 'coding-agents' },
        { title: 'Autonomous AI agents', value: 'autonomous-ai-agents' },
        { title: 'Computer use (desktop control)', value: 'computer-use' },
        { title: 'GitHub operations', value: 'github' },
        { title: 'Project management (GSD, Kanban)', value: 'gsd' },
        { title: 'Data science & ML', value: 'data-science' },
        { title: 'Creative content (ASCII art, diagrams)', value: 'creative' },
        { title: 'Note taking & documentation', value: 'note-taking' },
        { title: 'DevOps & infrastructure', value: 'devops' },
      ];
      const skillsResponse = await prompts({
        type: 'multiselect',
        name: 'selectedSkills',
        message: 'Which skill sets would you like to enable for AI-assisted tasks? (Use space to select, enter to confirm)',
        instructions: false,
        choices: skillCategories,
        // Default to hermes-agent and autonomous-ai-agents if no prior config
        initial: (userDefaults && userDefaults.skillsEnabled) ||
                 (existingConfig && existingConfig.skillsEnabled) ||
                 (existingState && existingState.skillsEnabled) ||
                 ['hermes-agent', 'autonomous-ai-agents'],
      });
      answers.skillsEnabled = skillsResponse.selectedSkills;
    } else {
      console.log('🔧 Using defaults (--yes flag) - skipping skill configuration');
      answers.skillsEnabled = (userDefaults && userDefaults.skillsEnabled) ||
                              (existingConfig && existingConfig.skillsEnabled) ||
                              (existingState && existingState.skillsEnabled) ||
                              []; // empty by default when using --yes
    }

    // 6. Prepare files to write (transacted)
    const filesToWrite = [];

    // .ciclo/config.json (merge if exists)
    configPath = join(cwd, '.ciclo', 'config.json');
    let configObj = {
      version: VERSION,
      devName: answers.devName,
      taskPrefix: answers.taskPrefix,
      services: answers.services,
      stack: {
        language: fingerprint.language,
        frameworks: fingerprint.frameworks,
        testRunner: fingerprint.testRunner,
        packageManager: fingerprint.packageManager,
      },
    };
    // If config exists, read and merge (preserve user values)
    try {
      const existingConfig = await readJsonFile(configPath);
      if (existingConfig && typeof existingConfig === 'object') {
        configObj = deepMerge(configObj, existingConfig);
      }
    } catch {
      // ignore
    }
    filesToWrite.push({
      path: configPath,
      content: JSON.stringify(configObj, null, 2),
    });

    // .ciclo/state.json (lockfile)
    const statePath = join(cwd, '.ciclo', 'state.json');
    filesToWrite.push({
      path: statePath,
      content: generateStateJson(fingerprint, answers),
    });

    // .gitignore append (deduplicated)
    const gitignoreLines = [
      '',
      '# ciclo framework',
      '.ciclo/logs/',
      '.ciclo/events.jsonl',
      '.ciclo/state.json',
      '.ciclo/tasks/',
      '.env',
      '.env.local',
      'worktrees/', // for git worktree add
      '',
    ].join('\n');
    // We'll handle .gitignore via appendGitignoreAtomic (dedup) later

    // AGENTS.md managed section
    const agentsPath = join(cwd, 'AGENTS.md');
    const agentsSection = `<!-- ciclo:begin -->
# ciclo

This section is managed by the ciclo framework. Do not edit manually.

## Agents
- Analista: Hermes Agent (task refinement)
- Dev: opencode (code implementation in isolated worktrees)
- Reviewer: Hermes/opencode (automated PR review)

## Context
- Hub: ./context/
- Specs: ./context/specs/
- Rules: ./context/rules/
- Templates: ./context/templates/
<!-- ciclo:end -->`;
    // We'll handle AGENTS.md via a custom function that either creates or injects

    // Create .ciclo directory
    await mkdir(join(cwd, '.ciclo'), { recursive: true });

    // Backup all target files
    for (const { path } of filesToWrite) {
      await backupFile(path);
    }
    await backupFile(join(cwd, '.gitignore'));
    await backupFile(agentsPath);

    try {
      // Write files
      for (const { path, content } of filesToWrite) {
        await writeFileAtomic(path, content);
      }

      // Append to .gitignore (deduplicated — never duplicate the ciclo block)
      await appendGitignoreAtomic(join(cwd, '.gitignore'), gitignoreLines);

      // Handle AGENTS.md: create or inject managed section
      await handleAgentsMd(agentsPath, agentsSection);

      // Create context skeleton
      await mkdir(join(cwd, 'context', 'specs'), { recursive: true });
      await mkdir(join(cwd, 'context', 'rules'), { recursive: true });
      await mkdir(join(cwd, 'context', 'templates'), { recursive: true });
      await mkdir(join(cwd, 'docs', 'ciclo', 'decisoes'), { recursive: true });
      // Create empty CHANGELOG-IA.md
      await writeFileAtomic(
        join(cwd, 'docs', 'ciclo', 'CHANGELOG-IA.md'),
        '# Changelog IA\n\n*Changes made by ciclo agents*\n'
      );

      console.log('\n✅ ciclo initialized successfully!');
      console.log('\n📌 Next steps:');
      console.log('  1. Create your first task: ciclo new \"My feature\"');
      console.log('  2. Refine it: ciclo refine <task-id>');
      console.log('  3. Start implementation: ciclo start <task-id>');
      console.log('\n💡 Tip: Use ciclo doctor anytime to validate service access.');
      if (!opts.yes) {
        if (answers.services.jira.configured) {
          console.log('   → Jira integrado via ACLI (Atlassian CLI). Autenticação: `acli jira auth status`.');
          if (answers.services.jira.projectKey) {
            console.log(`   → Default project key set to ${answers.services.jira.projectKey} (pode ser sobrescrito por JIRA_PROJECT_KEY env var).`);
          }
        }
      }
    } catch (err) {
      console.error('\n✗ Initialization failed. Rolling back...');
      await restoreBackups();
      console.error(`   Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

async function handleAgentsMd(agentsPath, section) {
  try {
    const exists = await access(agentsPath).then(() => true).catch(() => false);
    if (!exists) {
      await writeFileAtomic(agentsPath, section + '\n');
      return;
    }
    const content = await readFile(agentsPath, 'utf8');
    // If we already have a ciclo section, replace it (preserve rest)
    const begin = '<!-- ciclo:begin -->';
    const end = '<!-- ciclo:end -->';
    const beginIndex = content.indexOf(begin);
    const endIndex = content.indexOf(end);
    if (beginIndex !== -1 && endIndex !== -1 && endIndex > beginIndex) {
      const before = content.slice(0, beginIndex);
      const after = content.slice(endIndex + end.length);
      const newContent = before + section + '\n' + after;
      await writeFileAtomic(agentsPath, newContent);
    } else {
      // No existing section, append
      await writeFileAtomic(agentsPath, content.endsWith('\n') ? content : content + '\n');
      await appendFileAtomic(agentsPath, section + '\n');
    }
  } catch (err) {
    throw new Error(`Failed to update AGENTS.md: ${err}`);
  }
}

/**
 * Ensure a CLI is available; if missing, offer automatic installation (interactive)
 * or show manual instructions. When `interactive` is false (e.g. --yes), only bln checks
 * availability and prints manual instructions if missing.
 * @param {'acli'|'gh'} cli
 * @param {boolean} interactive - whether to ask the user before installing
 * @returns {Promise<boolean>} true if available after the flow
 */
async function ensureCliInstalled(cli, interactive) {
  if (isCommandAvailable(cli)) {
    return true;
  }
  const names = { acli: 'ACLI (Atlassian CLI)', gh: 'GitHub CLI (gh)' };
  console.log(`\n⚠️  ${names[cli] || cli} não encontrada no sistema.`);
  if (!interactive) {
    printManualInstall(cli);
    return false;
  }
  const answer = await prompts({
    type: 'confirm',
    name: 'install',
    message: `Deseja instalar ${names[cli] || cli} automaticamente?`,
    initial: true,
  });
  if (answer.install) {
    const ok = await installCli(cli);
    if (ok) return true;
    console.log(`\n⚠️  Não foi possível confirmar a instalação de ${cli}.`);
  }
  printManualInstall(cli);
  return false;
}

/**
 * Append the ciclo block to .gitignore, skipping if the marker already exists.
 * This prevents duplicated blocks when `ciclo init` is run multiple times.
 */
async function appendGitignoreAtomic(filePath, block) {
  let current = '';
  try {
    current = await readFile(filePath, 'utf8');
  } catch (_) {
    // file doesn't exist yet
  }
  if (current.includes('# ciclo framework')) {
    return; // already present — do not duplicate
  }
  await backupFile(filePath);
  try {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFileAtomic(filePath, current + block); // writeFileAtomic re-backups; ok for gitignore
  } catch (err) {
    await restoreBackups();
    throw err;
  }
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = initCommand;