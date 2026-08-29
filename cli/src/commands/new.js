// src/commands/new.js
const { Command } = require('commander');
const { access, readFile, writeFile, mkdir } = require("node:fs/promises");
const { join } = require("node:path");
const { v4: uuidv4 } = require('uuid');

const newCommand = new Command()
  .command('new [description]')
  .description('Create a new task')
  .action(async (description) => {
    const cwd = process.cwd();
    const cicloDir = join(cwd, '.ciclo');
    const configPath = join(cicloDir, 'config.json');
    const tasksDir = join(cicloDir, 'tasks');

    // Ensure .ciclo and tasks directory exist
    try {
      await access(cicloDir);
    } catch {
      console.error('✗ .ciclo directory not found. Run `ciclo init` first.');
      process.exit(1);
    }
    try {
      await access(tasksDir);
    } catch {
      await mkdir(tasksDir, { recursive: true });
    }

    // Load config for service integration
    let config = {};
    try {
      const configContent = await readFile(configPath, 'utf8');
      config = JSON.parse(configContent);
    } catch (err) {
      // If config missing or invalid, we'll just continue locally
      console.warn(`⚠️  Could not read ciclo config: ${err.message}`);
    }

    // Generate short task ID (first 8 chars of UUID)
    let taskId;
    let attempts = 0;
    const maxAttempts = 5;
    do {
      taskId = uuidv4().substring(0, 8);
      attempts++;
      if (attempts > maxAttempts) {
        console.error('✗ Failed to generate unique task ID after multiple attempts.');
        process.exit(1);
      }
    } while (await fileExists(join(tasksDir, `${taskId}.json`)));

    const task = {
      id: taskId,
      description: description || "(no description)",
      status: "backlog",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const taskFile = join(tasksDir, `${taskId}.json`);
    try {
      await writeFile(taskFile, JSON.stringify(task, null, 2));
      console.log(`🆕 Created task ${taskId}: "${task.description}"`);
    } catch (err) {
      console.error(`✗ Failed to create task: ${err}`);
      process.exit(1);
    }

    // --- Jira integration (via ACLI) ---
    const jira = config.services?.jira;
    if (jira?.configured) {
      try {
        const JiraTaskStore = require('../services/JiraTaskStore.js');
        const { getRepoLabel } = require('../services/repoLabel.js');
        const jiraStore = new JiraTaskStore();
        if (jiraStore.configured) {
          const summary = task.description;
          const description = task.description; // could be enhanced with a template
          const issueType = config.services.jira.issueType || 'Task';
          const repoLabel = getRepoLabel(cwd);
          const jiraTask = await jiraStore.createTask({
            summary,
            description,
            issueType,
            project: config.services.jira.projectKey,
            labels: [repoLabel],
          });
          // Optionally store the Jira key in the task object for future reference
          task.jiraKey = jiraTask.key;
          task.repoLabel = repoLabel;
          await writeFile(taskFile, JSON.stringify(task, null, 2));
          console.log(`   → Também criada no Jira: ${jiraTask.key} (label: ${repoLabel})`);
        } else {
          console.log(`   ⚠️  Jira configurado no ciclo mas ACLI não autenticada (rode: acli jira auth login --web)`);
        }
      } catch (err) {
        console.warn(`   → Falha ao criar task no Jira: ${err.message}`);
      }
    }
  });

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

module.exports = newCommand;