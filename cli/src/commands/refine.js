// src/commands/refine.js
const { Command } = require('commander');
const { access, readFile, writeFile, readdir } = require("node:fs/promises");
const { join } = require("node:path");
const prompts = require('prompts');

const refineCommand = new Command()
  .command('refine <id>')
  .description('Refine a task (add details, acceptance criteria, subtasks)')
  .action(async (id) => {
    const cwd = process.cwd();
    const tasksDir = join(cwd, '.ciclo', 'tasks');

    // Check .ciclo exists
    try {
      await access(join(cwd, '.ciclo'));
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

    // Check task exists
    try {
      await access(taskFile);
    } catch {
      console.error(`✗ Task not found: ${id}`);
      process.exit(1);
    }

    // Load task
    let task;
    try {
      const content = await readFile(taskFile, 'utf8');
      task = JSON.parse(content);
    } catch (err) {
      console.error(`✗ Failed to read task: ${err}`);
      process.exit(1);
    }

    // Check if we can refine (only from backlog or refinando, otherwise ask to go back)
    const validStatusesForRefine = ['backlog', 'refinando'];
    let needsConfirmation = false;
    if (!validStatusesForRefine.includes(task.status)) {
      needsConfirmation = true;
    }

    // Helper to ask for an array of strings
    const askArray = async (promptMessage, defaultArray = []) => {
      const items = [];
      let done = false;
      while (!done) {
        const res = await prompts({
          type: 'text',
          name: 'value',
          message: promptMessage + (items.length > 0 ? ` (${items.length} items so far)` : '') + ':',
          initial: '',
        });
        if (res.value === '') {
          done = true;
        } else {
          items.push(res.value);
        }
      }
      return items;
    };

    // If we need confirmation, ask
    if (needsConfirmation) {
      const confirm = await prompts({
        type: 'confirm',
        name: 'goBack',
        message: `Task is currently in ${task.status}. Refining will set status back to refinando. Continue?`,
        initial: false,
      });
      if (!confirm.goBack) {
        console.log('✗ Refinement cancelled.');
        process.exit(0);
      }
    }

    // Show parent chain context BEFORE refining (helps the human/agent keep the
    // task scope aligned with the story/feature/epic in Jira)
    if (task.parentChain && task.parentChain.length > 0) {
      console.log('\n🧭 Contexto (cadeia de parents do Jira):');
      task.parentChain.forEach((p) => {
        console.log(`  [${p.issueType}] ${p.key} — ${p.summary}`);
        if (p.description) {
          // indent the parent description for readability
          const lines = p.description.split('\n');
          console.log(`      ${lines[0].slice(0, 100)}${lines.length > 1 ? '…' : ''}`);
        }
      });
      console.log('');
    }

    // Ask for refined description
    const descResponse = await prompts({
      type: 'text',
      name: 'description',
      message: 'Refined description:',
      initial: task.description,
    });

    // Ask for acceptance criteria
    console.log('\n📝 Acceptance criteria (press enter on empty line to finish):');
    const acceptanceCriteria = await askArray('Add acceptance criterion');

    // Ask for subtasks
    console.log('\n📋 Subtasks (press enter on empty line to finish):');
    const subtasks = await askArray('Add subtask');

    // Update task
    task.description = descResponse.description;
    task.acceptanceCriteria = acceptanceCriteria;
    task.subtasks = subtasks;
    task.status = 'refinando';
    task.updatedAt = new Date().toISOString();

    // Save
    try {
      await writeFile(taskFile, JSON.stringify(task, null, 2));
      console.log(`✅ Task ${taskId} refined and status set to refinando.`);
    } catch (err) {
      console.error(`✗ Failed to save task: ${err}`);
      process.exit(1);
    }

    // --- Sync refined description to Jira (via ACLI) when this task has a jiraKey ---
    if (task.jiraKey) {
      try {
        const JiraTaskStore = require('../services/JiraTaskStore.js');
        const store = new JiraTaskStore();
        if (store.configured) {
          const updates = { description: task.description };
          if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
            updates.description += '\n\nCritérios de aceitação:\n' + task.acceptanceCriteria.map((c, i) => `- ${c}`).join('\n');
          }
          await store.updateTask(task.jiraKey, updates);
          console.log(`   → Descrição sincronizada com o Jira (${task.jiraKey})`);
        }
      } catch (err) {
        console.log(`   ⚠️  Não foi possível sincronizar a descrição no Jira: ${err.message}`);
      }
    }
  });

module.exports = refineCommand;