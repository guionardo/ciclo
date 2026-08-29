// src/commands/move.js
const { Command } = require('commander');
const { access, readFile, writeFile, readdir } = require("node:fs/promises");
const { join } = require("node:path");
const prompts = require('prompts');
const { jiraToCiclo } = require('../services/statusMap.js');
const { loadEffectiveConfig, resolveStatusMap } = require('../services/globalConfig.js');

const moveCommand = new Command()
  .command('move <id> [state]')
  .description('Move task to a state (local + sync to Jira via ACLI when applicable). Without [state], lists the lanes the issue can adopt.')
  .action(async (id, state, opts) => {
    const cwd = process.cwd();
    const tasksDir = join(cwd, '.ciclo', 'tasks');
    const validStates = ['backlog', 'refinando', 'pronta', 'em_execução', 'revisao', 'concluida'];

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
    } catch (err) {
      console.error(`✗ Failed to read task: ${err}`);
      process.exit(1);
    }

    // Effective statusMap (project > global > default)
    const effectiveConfig = await loadEffectiveConfig(cwd);
    const statusMap = resolveStatusMap(
      await readGlobalConfigSafe(),
      effectiveConfig
    );

    // Resolve the target state
    let targetState = state;
    if (!targetState) {
      // Discover lanes the issue can adopt (real board lanes when possible)
      let lanes = validStates;
      if (task.jiraKey) {
        try {
          const JiraTaskStore = require('../services/JiraTaskStore.js');
          const store = new JiraTaskStore();
          if (store.configured) {
            const discovered = await store.getAvailableTransitions(task.jiraKey, statusMap);
            // discovered returns Jira status names; map them back to ciclo states
            const mapped = discovered
              .map((j) => jiraToCiclo(j))
              .filter((s) => validStates.includes(s));
            if (mapped.length > 0) lanes = [...new Set(mapped)];
            console.log(`🗂️  Lanes disponíveis para ${task.jiraKey}: ${discovered.join(' → ') || '(via statusMap configurado)'}`);
          }
        } catch (_) { /* keep defaults */ }
      }
      const pick = await prompts({
        type: 'select',
        name: 'state',
        message: 'Para qual estado mover?',
        choices: lanes.map((l) => ({ title: l, value: l })),
      });
      if (!pick.state) {
        console.log('✗ Movimento cancelado.');
        process.exit(0);
      }
      targetState = pick.state;
      console.log(`   🏷️  Movendo para: ${targetState}`);
    }

    if (!validStates.includes(targetState)) {
      console.error(`✗ Invalid state: ${targetState}. Valid states: ${validStates.join(', ')}`);
      process.exit(1);
    }

    try {
      task.status = targetState;
      task.updatedAt = new Date().toISOString();
      await writeFile(taskFile, JSON.stringify(task, null, 2));
      console.log(`➡️  Moved task ${taskId} to ${targetState}`);
    } catch (err) {
      console.error(`✗ Failed to update task: ${err}`);
      process.exit(1);
    }

    // --- Sync status to Jira (via ACLI) when this task has a jiraKey ---
    if (task.jiraKey) {
      const { cicloToJira } = require('../services/statusMap.js');
      // statusMap already merged: project > global > default
      const jiraStatus = cicloToJira(targetState, statusMap);
      if (jiraStatus) {
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
        console.log(`   ℹ️  Estado "${targetState}" sem mapeamento Jira — apenas local.`);
      }
    } else {
      console.log(`   ℹ️  Task sem jiraKey — apenas local.`);
    }
  });

async function readGlobalConfigSafe() {
  try {
    const { readGlobalConfig } = require('../services/globalConfig.js');
    return await readGlobalConfig();
  } catch (_) {
    return {};
  }
}

module.exports = moveCommand;