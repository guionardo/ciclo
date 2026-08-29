// src/commands/work.js
// Prepare the working repository for a Jira issue and sync it locally.
//
// Flow:
//   1. Fetch the Jira issue (via ACLI) to read its repository LABEL.
//   2. Resolve the repo dir: <reposDir>/<label>  (reposDir from env/global config).
//   3. If the directory does not exist → clone the repository (gh repo clone)
//      and run `ciclo init` inside it.
//   4. Sync the issue locally (ciclo show <jiraKey>).
//
// The repo label on the Jira issue ties the issue to the repository; the root
// directory (CICLO_REPOS_DIR or ~/.ciclo/config.json → reposDir) tells ciclo
// WHERE the repository should live.

const { Command } = require('commander');
const { access, readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { execa } = require('execa');
const { resolveReposDir, readGlobalConfig } = require('../services/globalConfig.js');
const { getRepoLabel } = require('../services/repoLabel.js');

const workCommand = new Command()
  .command('trabalho <jiraKey>')
  .description('Prepara o repositório de uma issue do Jira (clona se necessário, inicializa e sincroniza)')
  .option('-p, --project <key>', 'Jira project key (default: config)')
  .option('--no-init', 'não rodar ciclo init no repo clonado')
  .action(async (jiraKey, opts) => {
    const cwd = process.cwd();

    // 1. Resolve repos root dir
    const globalCfg = await readGlobalConfig();
    const reposDir = resolveReposDir(globalCfg);
    console.log(`📂 Repos root: ${reposDir}`);

    // 2. Fetch issue to read the repo label
    const JiraTaskStore = require('../services/JiraTaskStore.js');
    const store = new JiraTaskStore(cwd);
    if (!store.configured) {
      console.error('✗ ACLI não autenticada. Rode `acli jira auth login --web`.');
      process.exit(1);
    }

    const key = String(jiraKey).toUpperCase();
    console.log(`🔍 Buscando issue ${key} no Jira...`);
    let issue;
    try {
      issue = await store.getTask(key);
    } catch (err) {
      console.error(`✗ Falha ao buscar ${key}: ${err.message}`);
      process.exit(1);
    }
    console.log(`   ${issue.key}: ${issue.summary} [${issue.status}]`);
    console.log(`   Labels: ${(issue.labels || []).join(', ') || '(nenhum)'}`);

    // 3. Determine repo from label (fallback: label = local repo label)
    const repoLabel = issue.labels && issue.labels.length > 0
      ? issue.labels[0]
      : getRepoLabel(cwd);
    if (!repoLabel) {
      console.error('✗ Não foi possível determinar o repositório da issue (sem label).');
      process.exit(1);
    }
    console.log(`📦 Repositório (label): ${repoLabel}`);

    // 4. Resolve target dir
    const targetDir = join(reposDir, repoLabel);
    console.log(`📁 Caminho esperado: ${targetDir}`);

    // 5. Clone if missing
    let repoExists = true;
    try {
      await access(join(targetDir, '.git'));
    } catch {
      repoExists = false;
    }

    if (!repoExists) {
      console.log(`🔄 Repositório não encontrado — tentando clonar como ${repoLabel}...`);
      try {
        // gh repo clone expects owner/repo; use whatever the label resolves to.
        // If the label is a plain repo name, gh will try the authenticated user's account.
        await execa('gh', ['repo', 'clone', repoLabel, targetDir], { stdio: 'inherit' });
        console.log(`✅ Clonado em ${targetDir}`);
      } catch (err) {
        console.error(`✗ Falha ao clonar ${repoLabel}: ${err.message}`);
        console.error('   Verifique se o repo existe na sua conta GitHub e se `gh auth login` está feito.');
        process.exit(1);
      }
    } else {
      console.log(`✅ Repositório já existe: ${targetDir}`);
    }

    // 6. Initialize ciclo inside the repo (unless skipped or already init)
    if (!opts.noInit) {
      try {
        await access(join(targetDir, '.ciclo'));
        console.log(`ℹ️  .ciclo já existe em ${targetDir} — pulando init.`);
      } catch {
        console.log(`🔧 Inicializando ciclo em ${targetDir}...`);
        try {
          await execa('ciclo', ['init', '-y'], { cwd: targetDir, stdio: 'inherit' });
          console.log(`✅ ciclo inicializado em ${targetDir}`);
        } catch (err) {
          console.error(`✗ Falha ao inicializar ciclo: ${err.message}`);
          process.exit(1);
        }
      }
    }

    // 7. Sync the issue locally
    console.log(`🔄 Sincronizando a issue ${key} para ${targetDir}...`);
    try {
      await execa('ciclo', ['show', key], { cwd: targetDir, stdio: 'inherit' });
    } catch (err) {
      console.error(`✗ Falha ao sincronizar a issue: ${err.message}`);
      process.exit(1);
    }

    console.log(`\n✅ Pronto! Trabalhe em ${targetDir}`);
    console.log(`   Use: cd ${targetDir} && ciclo refinar ${key} / ciclo iniciar ${key}`);
  });

module.exports = workCommand;