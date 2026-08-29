// src/commands/move.js
const { Command } = require('commander');
const { access, readFile, writeFile, readdir } = require("node:fs/promises");
const { join } = require("node:path");

const moveCommand = new Command()
  .command('move <id> <state>')
  .description('Move task to a state (local + sync to Jira via ACLI when applicable)')
  .action(async (id, state) => {
    const cwd = process.cwd();
    const tasksDir = join(cwd, '.ciclo', 'tasks');
    const validStates = ['backlog', 'refinando', 'pronta', 'em_execução', 'revisao', 'concluida'];
    if (!validStates.includes(state)) {
      console.error(`✗ Invalid state: ${state}. Valid states: ${validStates.join(', ')}`);
      process.exit(1);
    }

    try {
      await access(tasksDir);
    } catch {
      console.error('✗ .ciclo directory not found. Run `ciclo init` first.');
      process.exit(1);
    }

    // Normalize id: if it's already a full UUID, use it; else treat as prefix
    let taskId = id;
    if (id.length < 36) { // assume it's a short id
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
    let task;
    try {
      const content = await readFile(taskFile, 'utf8');
      task = JSON.parse(content);
      task.status = state;
      task.updatedAt = new Date().toISOString();
      await writeFile(taskFile, JSON.stringify(task, null, 2));
      console.log(`➡️  Moved task ${taskId} to ${state}`);
    } catch (err) {
      console.error(`✗ Failed to update task: ${err}`);
      process.exit(1);
    }

    // --- Sync status to Jira (via ACLI) when this task has a jiraKey ---
    if (task.jiraKey) {
      const jiraStatus = mapCicloToJira(state);
      if (jiraStatus) {
        // Optional per-project override: config.services.jira.statusMap = { pronta: "READY FOR REVIEW", ... }
        const configPath = join(cwd, '.ciclo', 'config.json');
        try {
          const config = JSON.parse(await readFile(configPath, 'utf8'));
          const custom = config.services?.jira?.statusMap?.[state];
          if (custom) jiraStatus = custom;
        } catch (_) { /* ignore config read issues */ }
        try {
          const JiraTaskStore = require('../services/JiraTaskStore.js');
          const store = new JiraTaskStore();
          if (store.configured) {
            await store.updateTask(task.jiraKey, { status: jiraStatus });
            console.log(`   → Sincronizado com o Jira (${task.jiraKey} → ${jiraStatus})`);
          } else {
            console.log(`   ⚠️  ACLI não autenticada — status não sincronizado (rode: acli jira auth login --web)`);
          }
        } catch (err) {
          console.log(`   ⚠️  Falha ao sincronizar status no Jira: ${err.message}`);
        }
      } else {
        console.log(`   ℹ️  Estado "${state}" sem mapeamento Jira — apenas local.`);
      }
    } else {
      console.log(`   ℹ️  Task sem jiraKey — apenas local.`);
    }
  });

/**
 * Map ciclo workflow states to Jira status names.
 * Jira workflows typically use: To Do → In Progress → In Review → Done.
 * States without a meaningful transition (backlog/refinando/pronta) stay in To Do.
 * Override per project via config.services.jira.statusMap (object state -> jira status),
 * e.g. { pronta: "READY FOR CODE REVIEW", concluida: "Closed" }.
 */
function mapCicloToJira(state) {
  const map = {
    'backlog': null, // stays in To Do
    'refinando': null, // stays in To Do
    'pronta': null, // stays in To Do (ready to pick up)
    'em_execução': 'IN PROGRESS',
    'revisao': 'IN REVIEW',
    'concluida': 'DONE',
  };
  return map[state] || null;
}

module.exports = moveCommand;