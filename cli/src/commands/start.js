// src/commands/start.js
const { Command } = require('commander');
const { access, readFile, writeFile, readdir } = require("node:fs/promises");
const { join } = require("node:path");
const { execa } = require('execa');

const startCommand = new Command()
  .command('start <id>')
  .description('Start implementation of a task (creates branch, sets em_execução, syncs Jira)')
  .action(async (id) => {
    const cwd = process.cwd();
    const cicloDir = join(cwd, '.ciclo');
    const configPath = join(cicloDir, 'config.json');
    const tasksDir = join(cicloDir, 'tasks');

    // Check .ciclo exists
    try {
      await access(cicloDir);
    } catch {
      console.error('✗ .ciclo directory not found. Run `ciclo init` first.');
      process.exit(1);
    }

    // Load config for taskPrefix and service integration
    let config = { taskPrefix: 'TASK' };
    try {
      const configContent = await readFile(configPath, 'utf8');
      config = JSON.parse(configContent);
    } catch (err) {
      console.warn(`⚠️  Could not read config, using default taskPrefix: ${err}`);
    }
    const taskPrefix = config.taskPrefix || 'TASK';

    // Resolve task id (short prefix → full filename), like show/move/refine
    let taskId = id;
    if (id.length < 36) {
      try {
        const files = await readdir(tasksDir);
        const matches = files.filter(f => f.startsWith(id + '.') && f.endsWith('.json'));
        if (matches.length === 0) {
          console.error(`✗ No task found with id starting with: ${id}`);
          process.exit(1);
        }
        if (matches.length > 1) {
          console.error(`✗ Multiple tasks match id prefix ${id}: ${matches.map(m => m.replace('.json','')).join(', ')}`);
          process.exit(1);
        }
        taskId = matches[0].replace('.json', '');
      } catch (err) {
        console.error(`✗ Error resolving task id: ${err}`);
        process.exit(1);
      }
    }

    const taskFile = join(tasksDir, `${taskId}.json`);

    // Load task
    let task;
    try {
      await access(taskFile);
      const content = await readFile(taskFile, 'utf8');
      task = JSON.parse(content);
    } catch (err) {
      console.error(`✗ Task not found: ${id}`);
      process.exit(1);
    }

    // --- Sync with Jira (required): keep the task scope aligned with the board ---
    // Whenever the dev is about to start work on the issue, re-fetch it (plus its
    // parent chain: story/feature/epic summaries + descriptions) from Jira and
    // update the local copy BEFORE creating the branch.
    if (task.jiraKey) {
      try {
        const JiraTaskStore = require('../services/JiraTaskStore.js');
        const { jiraToCiclo } = require('../services/statusMap.js');
        const store = new JiraTaskStore(cwd);
        if (store.configured) {
          const { issue: remote, parentChain } = await store.getTaskWithParents(task.jiraKey);
          let changed = false;
          if (remote.summary && remote.summary !== task.description) {
            console.log(`   ℹ️  Escopo atualizado no Jira: "${task.description}" → "${remote.summary}"`);
            task.description = remote.summary;
            changed = true;
          }
          if (remote.description && remote.description !== (task.details || '')) {
            task.details = remote.description;
            changed = true;
          }
          if (parentChain && parentChain.length > 0) {
            // re-store parent chain (may have changed: new parent, edited descriptions)
            const current = JSON.stringify(task.parentChain || []);
            const next = JSON.stringify(parentChain);
            if (current !== next) {
              task.parentChain = parentChain;
              changed = true;
            }
          }
          const jiraStatusCiclo = jiraToCiclo(remote.status || '');
          if (jiraStatusCiclo && jiraStatusCiclo !== task.status) {
            console.log(`   ℹ️  Status no Jira diferente (${remote.status}) — local irá para em_execução.`);
          }
          if (changed) {
            task.updatedAt = new Date().toISOString();
            await writeFile(taskFile, JSON.stringify(task, null, 2));
            console.log('   🔄 Task re-sincronizada com o Jira (escopo alinhado).');
          } else {
            console.log('   ✅ Escopo local já alinhado com o Jira.');
          }
          if (parentChain && parentChain.length > 0) {
            console.log('   🧭 Contexto da cadeia de parents:');
            parentChain.forEach((p) => {
              console.log(`      ${p.key} [${p.issueType}] ${p.summary}${p.description ? ' — ' + p.description.slice(0, 60) : ''}`);
            });
          }
        } else {
          console.log('   ⚠️  ACLI não autenticada — continuando com o escopo local (rode: acli jira auth login --web)');
        }
      } catch (err) {
        console.log(`   ⚠️  Falha ao sincronizar com o Jira: ${err.message}`);
      }
    }

    // Determine branch name
    const shortId = taskId.substring(0, 8);
    // Slugify description: lowercase, replace non-alphanumeric with hyphens, trim
    const slug = task.description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const branchName = `${taskPrefix}/${shortId}-${slug}`;

    // Ensure we are in a git repo (should be)
    try {
      await execa('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    } catch {
      console.error('✗ Not a git repository. ciclo init requires a git repo.');
      process.exit(1);
    }

    // Create and checkout new branch (local)
    try {
      await execa('git', ['checkout', '-b', branchName]);
      console.log(`🌱 Created and checked out branch: ${branchName}`);
    } catch (err) {
      // If branch already exists, just checkout
      if (err.message.includes('already exists') || err.exitCode === 128) {
        try {
          await execa('git', ['checkout', branchName]);
          console.log(`🔀 Switched to existing branch: ${branchName}`);
        } catch (err2) {
          console.error(`✗ Failed to checkout branch ${branchName}: ${err2.message}`);
          process.exit(1);
        }
      } else {
        console.error(`✗ Failed to create branch ${branchName}: ${err.message}`);
        process.exit(1);
      }
    }

    // --- GitHub integration: only used if gh CLI is authenticated (no config needed) ---
    try {
      const { execSync } = require('child_process');
      execSync('gh auth status', { stdio: 'ignore' });
      // gh is authenticated — try to push the branch to origin (if a remote exists)
      const remoteUrl = execSync('git remote get-url origin', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const m = remoteUrl.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/);
      if (m) {
        execSync('gh api /repos/' + m[1] + '/' + m[2], { encoding: 'utf8' }); // verifies repo access
        execSync('git push -u origin ' + branchName, { encoding: 'utf8', stdio: 'pipe' });
        console.log(`   → Também criada no GitHub: ${branchName}`);
      }
    } catch (err) {
      // gh not authenticated or no remote — branch stays local-only (fine)
      if (String(err.message || '').includes('not logged in')) {
        console.log(`   ℹ️  gh não autenticado; branch criada apenas localmente (rode gh auth login para habilitar GitHub).`);
      }
    }

    // Update task status and record branch
    task.status = 'em_execução';
    task.branch = branchName;
    task.updatedAt = new Date().toISOString();
    try {
      await writeFile(taskFile, JSON.stringify(task, null, 2));
      console.log(`📝 Task ${taskId} status updated to em_execução`);
    } catch (err) {
      console.error(`✗ Failed to update task: ${err.message}`);
      process.exit(1);
    }

    // --- Sync status to Jira (via ACLI) when this task has a jiraKey ---
    if (task.jiraKey) {
      try {
        const JiraTaskStore = require('../services/JiraTaskStore.js');
        const store = new JiraTaskStore();
        if (store.configured) {
          await store.updateTask(task.jiraKey, { status: 'IN PROGRESS' });
          console.log(`   → Sincronizado com o Jira (${task.jiraKey} → IN PROGRESS)`);
        } else {
          console.log(`   ⚠️  ACLI não autenticada — status não sincronizado (rode: acli jira auth login --web)`);
        }
      } catch (err) {
        console.log(`   ⚠️  Falha ao sincronizar status no Jira: ${err.message}`);
      }
    }

    console.log(`🚀 Started implementation of task ${taskId}`);
    console.log(`   Branch: ${branchName}`);
    console.log(`   Next: implement your code, then use \`ciclo move ${taskId} pronta\` when ready for review.`);
  });

module.exports = startCommand;