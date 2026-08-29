// src/commands/start.js
const { Command } = require('commander');
const { access, readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const { execa } = require('execa');

const startCommand = new Command()
  .command('start <id>')
  .description('Start implementation of a task (creates branch and sets status to em_execução)')
  .action(async (id) => {
    const cwd = process.cwd();
    const cicloDir = join(cwd, '.ciclo');
    const configPath = join(cicloDir, 'config.json');
    const taskFile = join(cicloDir, 'tasks', `${id}.json`);

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

    // Determine branch name
    const shortId = id.substring(0, 8);
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
      console.log(`📝 Task ${id} status updated to em_execução`);
    } catch (err) {
      console.error(`✗ Failed to update task: ${err.message}`);
      process.exit(1);
    }

    console.log(`🚀 Started implementation of task ${id}`);
    console.log(`   Branch: ${branchName}`);
    console.log(`   Next: implement your code, then use \`ciclo move ${id} pronta\` when ready for review.`);
  });

module.exports = startCommand;