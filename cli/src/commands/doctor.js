// src/commands/doctor.js
const { Command } = require('commander');
const { access, readFile } = require("node:fs/promises");
const { join } = require("node:path");

const doctorCommand = new Command()
  .command('doctor')
  .description('Validate ciclo setup and service access')
  .action(async () => {
    const cwd = process.cwd();
    const configPath = join(cwd, '.ciclo', 'config.json');

    console.log('🩺 Running ciclo doctor check...');

    // Check .ciclo directory and config
    try {
      await access(join(cwd, '.ciclo'));
    } catch {
      console.error('✗ .ciclo directory not found. Run `ciclo init` first.');
      process.exit(1);
    }

    let config;
    try {
      const configContent = await readFile(configPath, 'utf8');
      config = JSON.parse(configContent);
    } catch (err) {
      console.error(`✗ Failed to read config: ${err.message}`);
      process.exit(1);
    }

    console.log(`📦 ciclo version: ${config.version || 'unknown'}`);
    console.log(`👨‍💻 Developer name: ${config.devName || '(not set)'}`);
    console.log(`🏷️  Task prefix: ${config.taskPrefix || 'TASK'}`);

    // Services
    const services = config.services || {};
    console.log('\n🔌 Services:');

    // Jira
    const jira = services.jira || {};
    if (jira.configured) {
      console.log('  Jira: configured in ciclo');
      console.log(`    Method: ${jira.method || 'acli'}`);
      console.log(`    Site URL: ${jira.siteUrl || '(not set)'}`);
      if (jira.projectKey) {
        console.log(`    Default project key: ${jira.projectKey}`);
      } else {
        console.log(`    Default project key: (not set, set JIRA_PROJECT_KEY env var)`);
      }
      // Validate connection via ACLI (official Atlassian CLI)
      try {
        const JiraTaskStore = require('../services/JiraTaskStore.js');
        const store = new JiraTaskStore();
        const result = await store.testConnection();
        if (result.ok) {
          console.log(`    ✅ Connection: OK (via ACLI → ${result.status || 'authenticated'})`);
        } else {
          console.log(`    ❌ Connection: FAILED`);
          console.log(`        ${result.error}`);
        }
      } catch (err) {
        console.log(`    ❌ Connection: FAILED`);
        console.log(`        ${err.message}`);
      }
    } else {
      console.log('  Jira: not configured (run `ciclo init` without -y to configure Jira integration)');
      console.log('        Authenticate first with `acli jira auth login --web`.');
    }

    // GitHub — validate via gh CLI authentication only (no config stored)
    const { execSync } = require('child_process');
    try {
      execSync('gh --version', { stdio: 'ignore' });
      const authOutput = execSync('gh auth status', { encoding: 'utf8', stdio: [] });
      const match = authOutput.match(/Logged in to (\S+) account (\S+)/);
      console.log('  GitHub: gh CLI installed');
      console.log(`    ✅ Authenticated as: ${match ? match[2] : 'unknown account'}`);
      if (match) {
        console.log(`    🔑 Auth host: ${match[1]}`);
      }
    } catch (err) {
      const isAuthError = String(err.stderr || err.message || '').includes('not logged in');
      console.log('  GitHub: gh CLI checked');
      if (isAuthError) {
        console.log(`    ❌ Not authenticated. Run \`gh auth login\` to authenticate.`);
      } else {
        console.log(`    ❌ gh CLI not available or auth check failed. Install gh from https://cli.github.com/ and run \`gh auth login\`.`);
      }
    }

    // Check for presence of .ciclo/state.json
    const statePath = join(cwd, '.ciclo', 'state.json');
    try {
      await access(statePath);
      console.log(`\n📄 State file: present`);
    } catch {
      console.log(`\n⚠️  State file: missing (may indicate incomplete initialization)`);
    }

    // Check for context directories
    const contextDir = join(cwd, 'context');
    try {
      await access(contextDir);
      console.log(`📂 Context directory: present`);
    } catch {
      console.log(`📂 Context directory: missing (will be created on first task)`);
    }

    console.log('\n💡 Tips:');
    console.log('  - Run `ciclo init` (without -y) to reconfigure services.');
    console.log('  - Set environment variables for Jira to enable real access.');
    console.log('  - GitHub is detected via `gh auth status` (no configuration needed).');
    console.log('  - Use `ciclo init -y` to accept defaults and skip service configuration.');
  });

module.exports = doctorCommand;