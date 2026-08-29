// src/commands/refine.js
// Refines a task into an execution plan: objective, steps, expected result,
// acceptance criteria and subtasks. Marks the task as refined (local flag +
// Jira label "refined" synced) so agents can verify refinement before starting.

const { Command } = require('commander');
const { access, readFile, writeFile, readdir } = require("node:fs/promises");
const { join } = require("node:path");
const prompts = require('prompts');

const REFINED_LABEL = 'refined';

const refineCommand = new Command()
  .command('refine <id>')
  .description('Refine a task into an execution plan (objective, steps, expected result) and mark it as refined')
  .option('-p, --plan <json>', 'Aplicar um plano já aprovado via JSON (sem prompts): {"goal": "...", "steps": [...], "expectedResult": "...", "acceptanceCriteria": [...], "subtasks": [...]}')
  .action(async (id, opts) => {
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
          const lines = p.description.split('\n');
          console.log(`      ${lines[0].slice(0, 100)}${lines.length > 1 ? '…' : ''}`);
        }
      });
      console.log('');
    }

    // --- Execution plan: from --plan JSON (agent-assisted, no prompts) or interactive ---
    let plan = null;
    if (opts.plan) {
      try {
        plan = typeof opts.plan === 'string' ? JSON.parse(opts.plan) : opts.plan;
      } catch (err) {
        console.error(`✗ --plan JSON inválido: ${err.message}`);
        process.exit(1);
      }
      console.log('📋 Aplicando plano aprovado (--plan).');
    }

    if (plan) {
      // Agent-approved plan: use as-is
      task.description = plan.description || task.description;
      task.goal = plan.goal || '';
      task.steps = Array.isArray(plan.steps) ? plan.steps : [];
      task.expectedResult = plan.expectedResult || '';
      task.acceptanceCriteria = Array.isArray(plan.acceptanceCriteria) ? plan.acceptanceCriteria : [];
      task.subtasks = Array.isArray(plan.subtasks) ? plan.subtasks : [];
      console.log(`   🎯 Objetivo: ${task.goal}`);
      if (task.steps.length > 0) {
        console.log('   🪜 Passos:');
        task.steps.forEach((s, i) => console.log(`      ${i + 1}. ${s}`));
      }
      if (task.expectedResult) console.log(`   📦 Resultado esperado: ${task.expectedResult}`);
    } else {
      const descResponse = await prompts({
        type: 'text',
        name: 'description',
        message: 'Refined description:',
        initial: task.description,
      });

      console.log('\n🎯 Objetivo a ser alcançado (uma frase clara):');
      const goalResponse = await prompts({
        type: 'text',
        name: 'goal',
        message: 'Objetivo:',
        initial: task.goal || '',
      });

      console.log('\n🪜 Passos para execução (press enter on empty line to finish):');
      const steps = await askArray('Add execution step', task.steps || []);

      console.log('\n📦 Resultado esperado (entregável concreto):');
      const resultResponse = await prompts({
        type: 'text',
        name: 'expectedResult',
        message: 'Resultado esperado:',
        initial: task.expectedResult || '',
      });

      // Acceptance criteria and subtasks (existing behavior, kept)
      console.log('\n📝 Acceptance criteria (press enter on empty line to finish):');
      const acceptanceCriteria = await askArray('Add acceptance criterion', task.acceptanceCriteria || []);

      console.log('\n📋 Subtasks (press enter on empty line to finish):');
      const subtasks = await askArray('Add subtask', task.subtasks || []);

      task.description = descResponse.description;
      task.goal = goalResponse.goal;
      task.steps = steps;
      task.expectedResult = resultResponse.expectedResult;
      task.acceptanceCriteria = acceptanceCriteria;
      task.subtasks = subtasks;
    }

    // Mark refined + save
    task.refined = true; // local marker
    task.status = 'refinando';
    task.updatedAt = new Date().toISOString();

    // Save
    try {
      await writeFile(taskFile, JSON.stringify(task, null, 2));
      console.log(`✅ Task ${taskId} refined and status set to refinando (plan created).`);
    } catch (err) {
      console.error(`✗ Failed to save task: ${err}`);
      process.exit(1);
    }

    // --- Sync refined plan to Jira (via ACLI): description + "refined" label ---
    if (task.jiraKey) {
      try {
        const JiraTaskStore = require('../services/JiraTaskStore.js');
        const store = new JiraTaskStore();
        if (store.configured) {
          // Compose a structured description for Jira from the execution plan
          let description = task.description || '';
          if (task.goal) description += `\n\n🎯 Objetivo: ${task.goal}`;
          if (task.steps && task.steps.length > 0) {
            description += `\n\n🪜 Passos para execução:\n` + task.steps.map((s) => `- ${s}`).join('\n');
          }
          if (task.expectedResult) description += `\n\n📦 Resultado esperado: ${task.expectedResult}`;
          if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
            description += `\n\n📝 Critérios de aceitação:\n` + task.acceptanceCriteria.map((c) => `- ${c}`).join('\n');
          }
          if (task.subtasks && task.subtasks.length > 0) {
            description += `\n\n📋 Subtasks:\n` + task.subtasks.map((s) => `- ${s}`).join('\n');
          }

          // Read current labels (to preserve existing ones) then add "refined"
          let labels = [];
          try {
            const current = await store.getTask(task.jiraKey);
            labels = (current.labels || []).slice();
          } catch (_) { /* ignore */ }
          if (!labels.map((l) => l.toLowerCase()).includes(REFINED_LABEL)) {
            labels.push(REFINED_LABEL);
          }

          await store.updateTask(task.jiraKey, { description, labels });
          console.log(`   → Plano de execução sincronizado com o Jira (${task.jiraKey}) + label "refined"`);
        }
      } catch (err) {
        console.log(`   ⚠️  Não foi possível sincronizar o plano no Jira: ${err.message}`);
      }
    } else {
      console.log('   ℹ️  Task sem jiraKey — plano salvo apenas localmente (refined).');
    }
  });

module.exports = refineCommand;