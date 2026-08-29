// src/commands/show.js
const { Command } = require('commander');
const { access, readFile, readdir, writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { v4: uuidv4 } = require('uuid');

const showCommand = new Command()
  .command('show <id>')
  .description('Show task details (local or fetched from Jira via ACLI)')
  .action(async (id) => {
    const cwd = process.cwd();
    const tasksDir = join(cwd, '.ciclo', 'tasks');

    try {
      await access(tasksDir);
    } catch {
      console.error('✗ .ciclo directory not found. Run `ciclo init` first.');
      process.exit(1);
    }

    // Normalize id: if it's already a full UUID, use it; else treat as prefix
    let taskId = id;
    if (id.length < 36) { // assume it's a short id
      const files = await readdir(tasksDir);
      const matches = files.filter(f => f.startsWith(id + '.') && f.endsWith('.json'));
      if (matches.length === 0) {
        // Not found locally — if it looks like a Jira key (e.g. FW-1, PROJ-123), try fetching from Jira
        if (/^[A-Z]+-\d+$/i.test(id)) {
          await fetchFromJira(id, cwd, tasksDir);
          return;
        }
        console.error(`✗ No task found with id starting with: ${id}`);
        process.exit(1);
      }
      if (matches.length > 1) {
        console.error(`✗ Multiple tasks match id prefix ${id}: ${matches.map(m => m.replace('.json','')).join(', ')}`);
        process.exit(1);
      }
      taskId = matches[0].replace('.json', '');
    }

    const taskFile = join(tasksDir, `${taskId}.json`);
    try {
      const content = await readFile(taskFile, 'utf8');
      const task = JSON.parse(content);
      console.log(`🆔 ID: ${task.id}`);
      if (task.jiraKey) console.log(`🔑 Jira: ${task.jiraKey}`);
      console.log(`📝 Description: ${task.description}`);
      console.log(`📌 Status: ${task.status}`);
      console.log(`🕒 Created: ${new Date(task.createdAt).toLocaleString()}`);
      console.log(`🕒 Updated: ${new Date(task.updatedAt).toLocaleString()}`);
      if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        console.log(`✅ Acceptance Criteria:`);
        task.acceptanceCriteria.forEach((c, i) => console.log(`   ${i+1}. ${c}`));
      }
      if (task.subtasks && task.subtasks.length > 0) {
        console.log(`📋 Subtasks:`);
        task.subtasks.forEach((s, i) => console.log(`   ${i+1}. ${s}`));
      }
    } catch (err) {
      console.error(`✗ Failed to read task: ${err}`);
      process.exit(1);
    }
  });

async function fetchFromJira(jiraKey, cwd, tasksDir) {
  try {
    const JiraTaskStore = require('../services/JiraTaskStore.js');
    const { getRepoLabel } = require('../services/repoLabel.js');
    const { jiraToCiclo } = require('../services/statusMap.js');
    const repoLabel = getRepoLabel(cwd);
    const store = new JiraTaskStore();
    if (!store.configured) {
      console.error(`✗ Task ${jiraKey} not found locally and Jira via ACLI is not authenticated.`);
      console.error('   Run `acli jira auth login --web` then try again.');
      process.exit(1);
    }

    // Reuse an existing local copy if this Jira key was already imported for THIS repo
    const files = await readdir(tasksDir);
    for (const f of files.filter((f) => f.endsWith('.json'))) {
      try {
        const existing = JSON.parse(await readFile(join(tasksDir, f), 'utf8'));
        if (existing && existing.jiraKey && String(existing.jiraKey).toUpperCase() === String(jiraKey).toUpperCase()) {
          if (existing.repoLabel && existing.repoLabel !== repoLabel) {
            // imported under a different repo label — treat as not ours, re-import below
            console.log(`⚠️  ${jiraKey} importada antes sob label "${existing.repoLabel}" (repo atual: ${repoLabel}) — reimportando.`);
            break;
          }
          existing.id = f.replace('.json', '');
          console.log(`🔎 ${jiraKey} já importada localmente (${existing.id}) — exibindo cópia local.`);
          printTask(existing);
          return;
        }
      } catch (_) {
        // skip unreadable files
      }
    }

    console.log(`🔍 Fetching ${jiraKey} from Jira...`);
    const remote = await store.getTask(jiraKey);

    // Repo binding: issues carrying the repository label belong to this repo.
    const remoteLabels = (remote.labels || []).map((l) => String(l).toLowerCase());
    const isRepoDir = await isGitRepository(cwd);
    if (!remoteLabels.includes(repoLabel)) {
      if (isRepoDir) {
        // Only ask to update the Jira issue when the current folder is a git repository
        const prompts = require('prompts');
        const { addLabel } = await prompts({
          type: 'confirm',
          name: 'addLabel',
          message: `A task ${jiraKey} no Jira não tem o label "${repoLabel}" deste repositório. Deseja atualizá-la no Jira?`,
          initial: true,
        });
        if (addLabel) {
          try {
            await store.updateTask(jiraKey, { labels: [...remoteLabels, repoLabel] });
            console.log(`   → Label "${repoLabel}" adicionado à task ${jiraKey} no Jira.`);
            remote.labels = [...remoteLabels, repoLabel];
          } catch (err) {
            console.log(`   ⚠️  Não foi possível atualizar o label no Jira: ${err.message}`);
          }
        } else {
          console.log(`   ℹ️  Label "${repoLabel}" NÃO adicionado à task ${jiraKey} no Jira.`);
        }
      } else {
        console.log(`⚠️  A task ${jiraKey} no Jira não tem o label "${repoLabel}" deste repositório.`);
        console.log(`   (pasta atual não é um repositório git — importando sem atualizar o Jira)`);
      }
    }

    // Generate short local task ID (first 8 chars of UUID)
    const taskId = uuidv4().substring(0, 8);
    const task = {
      id: taskId,
      jiraKey: remote.key,
      repoLabel,
      description: remote.summary,
      status: jiraToCiclo(remote.status),
      createdAt: remote.created ? new Date(remote.created).toISOString() : new Date().toISOString(),
      updatedAt: remote.updated ? new Date(remote.updated).toISOString() : new Date().toISOString(),
    };
    if (remote.description) task.details = remote.description;

    const taskFile = join(tasksDir, `${taskId}.json`);
    await mkdir(tasksDir, { recursive: true });
    await writeFile(taskFile, JSON.stringify(task, null, 2));
    task.id = taskId;
    printTask(task);
    console.log(`   → Saved locally as ${taskId}.json (label repo: ${repoLabel})`);
  } catch (err) {
    console.error(`✗ Failed to fetch ${jiraKey} from Jira: ${err.message}`);
    process.exit(1);
  }
}

function printTask(task) {
  console.log(`🆔 ID: ${task.id}`);
  if (task.jiraKey) console.log(`🔑 Jira: ${task.jiraKey}`);
  console.log(`📝 Description: ${task.description}`);
  console.log(`📌 Status: ${task.status}`);
  if (task.details) console.log(`📄 Details: ${task.details}`);
}

/**
 * Detect whether the given folder is a git repository (has a .git entry).
 */
async function isGitRepository(cwd) {
  const { access: fsAccess } = require('node:fs/promises');
  try {
    await fsAccess(join(cwd, '.git'));
    return true;
  } catch {
    return false;
  }
}

module.exports = showCommand;