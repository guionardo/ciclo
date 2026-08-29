// src/commands/sync.js
// Sync Jira → local: pulls all issues carrying the current repository label and
// ensures a local copy exists for each (skipping ones already imported for THIS repo).
// This respects the repo↔label binding: only tasks labeled with this repository
// are considered "the same repository's tasks".

const { Command } = require('commander');
const { access, readFile, readdir, writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { v4: uuidv4 } = require('uuid');

const syncCommand = new Command()
  .command('sync')
  .description('Sync tasks from Jira (scoped to the repository label) into local tasks')
  .option('-y, --yes', 'skip confirmation')
  .action(async (opts) => {
    const cwd = process.cwd();
    const cicloDir = join(cwd, '.ciclo');
    const tasksDir = join(cicloDir, 'tasks');

    try {
      await access(cicloDir);
    } catch {
      console.error('✗ .ciclo directory not found. Run `ciclo init` first.');
      process.exit(1);
    }

    // Config: read project key etc.
    let config = {};
    try {
      config = JSON.parse(await readFile(join(cicloDir, 'config.json'), 'utf8'));
    } catch (_) { /* optional */ }
    const jira = config.services?.jira;
    if (!jira?.configured) {
      console.error('✗ Jira não configurado no ciclo. Rode `ciclo init` e configure o Jira.');
      process.exit(1);
    }

    const JiraTaskStore = require('../services/JiraTaskStore.js');
    const { getRepoLabel } = require('../services/repoLabel.js');
    const store = new JiraTaskStore();
    if (!store.configured) {
      console.error('✗ ACLI não autenticada. Rode `acli jira auth login --web`.');
      process.exit(1);
    }

    const repoLabel = getRepoLabel(cwd);
    console.log(`🔄 Sincronizando tasks do Jira com o label "${repoLabel}"...`);

    // Fetch issues scoped to the repo label
    let issues;
    try {
      issues = await store.listTasks({ repoLabel, limit: opts.limit || 100 });
    } catch (err) {
      console.error(`✗ Falha ao buscar tasks no Jira: ${err.message}`);
      process.exit(1);
    }

    // Load existing local tasks (map jiraKey → {id, file})
    const existingByKey = new Map();
    try {
      const files = await readdir(tasksDir);
      for (const f of files.filter((f) => f.endsWith('.json'))) {
        try {
          const t = JSON.parse(await readFile(join(tasksDir, f), 'utf8'));
          if (t.jiraKey) existingByKey.set(String(t.jiraKey).toUpperCase(), { id: f.replace('.json', ''), task: t });
        } catch (_) { /* skip unreadable */ }
      }
    } catch (_) { /* tasks dir may not exist yet */ }

    if (issues.length === 0) {
      console.log(`ℹ️  Nenhuma task com o label "${repoLabel}" no projeto ${jira.projectKey || '(default)'}.`);
      return;
    }

    console.log(`🔎 Encontradas ${issues.length} task(s) no Jira:`);
    issues.forEach((i) => console.log(`   - ${i.key}: ${i.summary} [${i.status}]`));

    if (!opts.yes) {
      const prompts = require('prompts');
      const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: `Importar ${issues.length} task(s) localmente?`,
        initial: true,
      });
      if (!confirm) {
        console.log('⚠️  Sincronização cancelada.');
        return;
      }
    }

    await mkdir(tasksDir, { recursive: true });
    let created = 0;
    let skipped = 0;
    for (const issue of issues) {
      const key = String(issue.key).toUpperCase();
      if (existingByKey.has(key)) {
        const ex = existingByKey.get(key);
        if (ex.task.repoLabel && ex.task.repoLabel !== repoLabel) {
          console.log(`   ⏭️  ${issue.key} — importada sob outro label (${ex.task.repoLabel}); puxando cópia deste repo.`);
        } else {
          skipped++;
          console.log(`   ⏭️  ${issue.key} — já local (${ex.id})`);
          continue;
        }
      }
      const taskId = uuidv4().substring(0, 8);
      const task = {
        id: taskId,
        jiraKey: issue.key,
        repoLabel,
        description: issue.summary,
        status: (issue.status || 'backlog').toLowerCase().replace(/\s+/g, '_'),
        createdAt: issue.created ? new Date(issue.created).toISOString() : new Date().toISOString(),
        updatedAt: issue.updated ? new Date(issue.updated).toISOString() : new Date().toISOString(),
      };
      if (issue.description) task.details = issue.description;

      // If the Jira issue lacks the repo label (and this folder is a git repo), offer to add it.
      const issueLabels = (issue.labels || []).map((l) => String(l).toLowerCase());
      if (!issueLabels.includes(repoLabel) && !opts.yes && await isGitRepository(cwd)) {
        const prompts = require('prompts');
        const { addLabel } = await prompts({
          type: 'confirm',
          name: 'addLabel',
          message: `A task ${issue.key} no Jira não tem o label "${repoLabel}". Deseja atualizá-la no Jira?`,
          initial: true,
        });
        if (addLabel) {
          try {
            await store.updateTask(issue.key, { labels: [...issueLabels, repoLabel] });
            console.log(`   → Label "${repoLabel}" adicionado à task ${issue.key} no Jira.`);
          } catch (err) {
            console.log(`   ⚠️  Não foi possível atualizar o label no Jira: ${err.message}`);
          }
        }
      }

      await writeFile(join(tasksDir, `${taskId}.json`), JSON.stringify(task, null, 2));
      created++;
      console.log(`   ➕ ${issue.key} → local ${taskId} [${task.status}]`);
    }

    console.log(`\n✅ Sincronização concluída: ${created} importada(s), ${skipped} já existente(s).`);
  });

/**
 * Detect whether the given folder is a git repository (has a .git entry).
 */
async function isGitRepository(cwd) {
  const { access: fsAccess } = require('node:fs/promises');
  const { join: pathJoin } = require('node:path');
  try {
    await fsAccess(pathJoin(cwd, '.git'));
    return true;
  } catch {
    return false;
  }
}

module.exports = syncCommand;