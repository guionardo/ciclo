// src/commands/doctor.js
const { Command } = require('commander');
const { access, readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { execaSync } = require('execa');

const doctorCommand = new Command()
  .command('doctor')
  .description('Validate dependencies (acli/gh/Hermes) + ciclo project setup')
  .action(async () => {
    const cwd = process.cwd();
    const configPath = join(cwd, '.ciclo', 'config.json');

    console.log('🩺 Running ciclo doctor check...');

    // ------------------------------------------------------------------
    // 1. Toolchain / dependencies — ALWAYS checked first, even outside a
    //    ciclo project (first install: this is exactly what the dev needs).
    // ------------------------------------------------------------------
    console.log('\n🔧 Dependencies (toolchain):');
    let toolFailures = 0;

    // Node.js
    console.log(`  ✅ Node.js: ${process.version}`);

    // Helper: prints "install with <OS-specific command>" for a missing CLI
    const { detectPlatform, getInstallSpec } = require('../services/cliInstall.js');
    const platform = detectPlatform();
    function osInstallHint(cli) {
      const spec = getInstallSpec(cli);
      const steps = spec && spec.manual && spec.manual.length ? spec.manual : [];
      console.log(`     📥 Instalar agora (${platform}):`);
      if (steps.length) {
        steps.forEach((s) => console.log(`        ${s}`));
      } else {
        console.log(`        Consulte a documentação oficial de ${cli} (https://cli.github.com/ ou README).`);
      }
      console.log('     (ou rode `ciclo init`, que instala automaticamente)');
    }

    // acli (Atlassian CLI) + Jira auth
    try {
      const acliV = execaSync('acli', ['--version'], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
      console.log(`  ✅ acli (Atlassian CLI): ${acliV || 'installed'}`);
      try {
        execaSync('acli', ['jira', 'auth', 'status'], { stdio: 'ignore' });
        console.log('     ✅ Jira auth: authenticated');
      } catch {
        toolFailures++;
        console.log('     ❌ Jira auth: NOT authenticated. Run `acli jira auth login --web` (OAuth) or API token.');
      }
    } catch {
      toolFailures++;
      console.log('  ❌ acli (Atlassian CLI): not found.');
      osInstallHint('acli');
    }

    // gh (GitHub CLI) + auth
    try {
      const ghV = execaSync('gh', ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0];
      console.log(`  ✅ gh (GitHub CLI): ${ghV}`);
      const authOutput = execaSync('gh', ['auth', 'status'], { encoding: 'utf8', stdio: [] }).stdout;
      const match = authOutput.match(/Logged in to (\S+) account (\S+)/);
      console.log(`     ✅ GitHub auth: ${match ? `authenticated as ${match[2]} (${match[1]})` : 'authenticated'}`);
    } catch (err) {
      toolFailures++;
      const isAuthError = String(err.stderr || err.message || '').includes('not logged in');
      if (isAuthError) {
        console.log('  ❌ gh (GitHub CLI): installed but NOT authenticated. Run `gh auth login`.');
      } else {
        console.log('  ❌ gh (GitHub CLI): not found.');
        osInstallHint('gh');
        console.log('     Depois: `gh auth login`.');
      }
    }

    // Hermes Agent (runtime do agente)
    // Instalador oficial por SO: install.sh (Linux/macOS) | install.ps1 (Windows PowerShell)
    const hermesInstall = process.platform === 'win32'
      ? 'iex (irm https://hermes-agent.nousresearch.com/install.ps1)'
      : 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash';
    try {
      const hV = execaSync('hermes', ['--version'], { encoding: 'utf8' }).stdout.trim().split('\n')[0];
      console.log(`  ✅ Hermes Agent: ${hV}`);
    } catch {
      toolFailures++;
      console.log(`  ❌ Hermes Agent: not found. Install with \`${hermesInstall}\` (see ROTEIRO-REPLICACAO Etapa 3).`);
    }

    // ------------------------------------------------------------------
    // 2. Project check — .ciclo directory + config (only meaningful when
    //    the current directory is a ciclo project; do NOT abort before the
    //    toolchain check above).
    // ------------------------------------------------------------------
    console.log('\n📦 Projeto ciclo:');
    let isProject = true;
    try {
      await access(join(cwd, '.ciclo'));
    } catch {
      isProject = false;
      toolFailures++;
      console.log('  ✗ .ciclo directory not found — this directory is not a ciclo project. Run `ciclo init` first.');
    }

    if (isProject) {
      let config;
      try {
        const configContent = await readFile(configPath, 'utf8');
        config = JSON.parse(configContent);
      } catch (err) {
        toolFailures++;
        console.log(`  ✗ Failed to read config: ${err.message}`);
        config = null;
      }

      if (config) {
        console.log(`  ✅ ciclo config: ${configPath}`);
        console.log(`  📦 ciclo version: ${config.version || 'unknown'}`);
        // devName lives in the global config (~/.ciclo/config.json), not per-project —
        // fall back to legacy location in the project config for old setups.
        let devName = null;
        try {
          const { readGlobalConfig } = require('../services/globalConfig.js');
          const globalCfg = await readGlobalConfig();
          devName = (globalCfg && globalCfg.devName) || null;
        } catch (_) { /* no global config */ }
        if (!devName) devName = config.devName || null;
        console.log(`  👨‍💻 Developer name: ${devName || '(not set — rode ciclo init para configurar no global)'}`);
        console.log(`  🏷️  Task prefix: ${config.taskPrefix || 'TASK'}`);

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
              toolFailures++;
              console.log(`    ❌ Connection: FAILED`);
              console.log(`        ${result.error}`);
            }
          } catch (err) {
            toolFailures++;
            console.log(`    ❌ Connection: FAILED`);
            console.log(`        ${err.message}`);
          }
        } else {
          console.log('  Jira: not configured (run `ciclo init` without -y to configure Jira integration)');
          console.log('        Authenticate first with `acli jira auth login --web`.');
        }

        // GitHub — authentication already validated in the toolchain block above
        console.log('  GitHub: gh CLI authentication validated above');

        // Check for presence of .ciclo/state.json
        const statePath = join(cwd, '.ciclo', 'state.json');
        try {
          await access(statePath);
          console.log('\n📄 State file: present');
        } catch {
          console.log('\n⚠️  State file: missing (may indicate incomplete initialization)');
        }

        // Check for context directories
        const contextDir = join(cwd, 'context');
        try {
          await access(contextDir);
          console.log('📂 Context directory: present');
        } catch {
          console.log('📂 Context directory: missing (will be created on first task)');
        }
      }
    }

    // ------------------------------------------------------------------
    // 3. Summary + exit code
    // ------------------------------------------------------------------
    if (toolFailures > 0) {
      console.log(`\n❌ doctor: ${toolFailures} pendência(s) encontrada(s).`);
      if (!isProject) {
        console.log('   → Como primeiro passo neste diretório: `ciclo init` (inicializa o projeto e instala CLIs ausentes).');
      } else {
        console.log('   → Corrija as pendências acima e rode `ciclo doctor` novamente.');
      }
      process.exit(1);
    }

    console.log('\n✅ All checks passed.');
    console.log('\n💡 Tips:');
    console.log('  - Run `ciclo init` (without -y) to reconfigure services.');
    console.log('  - Set environment variables for Jira to enable real access.');
    console.log('  - GitHub is detected via `gh auth status` (no configuration needed).');
    console.log('  - Use `ciclo init -y` to accept defaults and skip service configuration.');
  });

module.exports = doctorCommand;