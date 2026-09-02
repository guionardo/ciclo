// src/commands/context.js
// Generates the analysis material an AI agent needs to help refine a task:
//   - the task itself (description, details, plan, refined status)
//   - its Jira parent chain (story/feature/epic summaries + descriptions)
//   - the project codebase overview (structure, stack, key files)
//
// Intended flow (agent-assisted refinement in chat):
//   1. dev: "me ajuda a refinar a task a1b2c3d4 (FW-x)"
//   2. agent: runs `ciclo contexto a1b2c3d4` and analyzes the output
//   3. agent: proposes objective/steps/expected result in chat
//   4. dev approves → agent runs `ciclo refine <id> --plan '<json>'`
//   5. ciclo saves locally + syncs Jira (description + "refined" label)

const { Command } = require('commander');
const { readFile, readdir, access } = require('node:fs/promises');
const { join } = require('node:path');
const { execaSync } = require('execa');

const contextCommand = new Command()
  .command('contexto <id>')
  .description('Gera o material de análise (task + parents Jira + codebase) para auxiliar o refinamento da task')
  .option('-c, --code', 'incluir árvore de arquivos do código (default: resumo)')
  .action(async (id, opts) => {
    const cwd = process.cwd();
    const tasksDir = join(cwd, '.ciclo', 'tasks');

    try {
      await access(join(cwd, '.ciclo'));
    } catch {
      console.error('✗ .ciclo directory not found. Run `ciclo init` first.');
      process.exit(1);
    }

    // Resolve task id (short prefix → full filename)
    let taskId = id;
    if (id.length < 36) {
      try {
        const files = await readdir(tasksDir);
        const matches = files.filter(f => f.startsWith(id + '.') && f.endsWith('.json'));
        if (matches.length === 0 && /^[A-Z]+-\d+$/i.test(id)) {
          // Looks like a Jira key and not local: import first (ciclo show), then re-resolve
          console.log(`🔍 Importando ${id.toUpperCase()} do Jira para análise...`);
          const { execa } = require('execa');
          await execa('ciclo', ['show', id], { cwd, stdio: 'inherit' });
          const filesAfter = await readdir(tasksDir);
          for (const f of filesAfter.filter(ff => ff.endsWith('.json'))) {
            try {
              const t = JSON.parse(await readFile(join(tasksDir, f), 'utf8'));
              if (t.jiraKey && String(t.jiraKey).toUpperCase() === String(id).toUpperCase()) {
                taskId = f.replace('.json', '');
                break;
              }
            } catch (_) { /* skip */ }
          }
        }
        if (taskId === id) {
          const files2 = await readdir(tasksDir);
          const matches2 = files2.filter(f => f.startsWith(id + '.') && f.endsWith('.json'));
          if (matches2.length === 0) {
            console.error(`✗ No task found with id starting with: ${id}`);
            process.exit(1);
          }
          if (matches2.length > 1) {
            console.error(`✗ Multiple tasks match id prefix ${id}: ${matches2.map(m => m.replace('.json','')).join(', ')}`);
            process.exit(1);
          }
          taskId = matches2[0].replace('.json', '');
        }
      } catch (err) {
        console.error(`✗ Error resolving task id: ${err}`);
        process.exit(1);
      }
    }

    const taskFile = join(tasksDir, `${taskId}.json`);
    let task;
    try {
      task = JSON.parse(await readFile(taskFile, 'utf8'));
    } catch (err) {
      console.error(`✗ Failed to read task: ${err}`);
      process.exit(1);
    }

    const out = [];
    out.push('══════════════════════════════════════════════════════');
    out.push(`📦 TASK ${task.id.substring(0, 8)}${task.jiraKey ? ` (${task.jiraKey})` : ''}`);
    out.push('══════════════════════════════════════════════════════');
    out.push(`Descrição: ${task.description || '(sem descrição)'}`);
    out.push(`Status: ${task.status}`);
    out.push(`Issue type: ${task.issueType || '(não definido)'}`);
    out.push(`Refinada: ${task.refined ? 'sim (label refined)' : 'NÃO — refinamento pendente'}`);
    if (task.goal) out.push(`Objetivo (atual): ${task.goal}`);
    if (task.steps && task.steps.length > 0) out.push(`Passos (atual): ${task.steps.join(' | ')}`);
    if (task.expectedResult) out.push(`Resultado esperado (atual): ${task.expectedResult}`);
    if (task.details) out.push(`Detalhes: ${task.details}`);

    // Fetch fresh issue + parent chain from Jira when available
    if (task.jiraKey) {
      try {
        const JiraTaskStore = require('../services/JiraTaskStore.js');
        const store = new JiraTaskStore(cwd);
        if (store.configured) {
          const { issue: remote, parentChain } = await store.getTaskWithParents(task.jiraKey);
          out.push('');
          out.push('🔵 JIRA (dados atuais):');
          out.push(`   Summary: ${remote.summary}`);
          out.push(`   Status: ${remote.status}`);
          const labels = remote.labels || [];
          out.push(`   Labels: ${labels.join(', ') || '(nenhum)'}`);
          out.push(`   Refinada (label): ${labels.map(l => String(l).toLowerCase()).includes('refined') ? 'sim' : 'NÃO'}`);
          if (remote.description) out.push(`   Descrição no Jira: ${remote.description}`);
          if (parentChain && parentChain.length > 0) {
            out.push('');
            out.push('🧭 CADEIA DE PARENTS (hierarquia):');
            parentChain.forEach((p) => {
              out.push(`   [${p.issueType}] ${p.key} — ${p.summary}`);
              if (p.description) {
                p.description.split('\n').forEach((line) => out.push(`       ${line}`));
              }
            });
          }
        } else {
          out.push('\n⚠️  ACLI não autenticada — sem dados frescos do Jira (local somente).');
        }
      } catch (err) {
        out.push(`\n⚠️  Falha ao buscar Jira: ${err.message}`);
      }
    }

    // Codebase overview
    out.push('');
    out.push('💻 CÓDIGO DO PROJETO:');
    try {
      const cfg = JSON.parse(await readFile(join(cwd, '.ciclo', 'config.json'), 'utf8'));
      const stack = cfg.stack || {};
      out.push(`   Stack: ${[stack.language, ...(stack.frameworks || [])].filter(Boolean).join(' + ') || '(não detectada)'}`);
      out.push(`   Test runner: ${stack.testRunner || '(não detectado)'}`);
      out.push(`   Package manager: ${stack.packageManager || '(não detectado)'}`);
    } catch (_) { /* no config stack */ }

    // Repo origin (if any)
    try {
      const url = execaSync('git', ['remote', 'get-url', 'origin'], {
        cwd, stdio: ['ignore', 'pipe', 'ignore'],
      }).stdout.trim();
      if (url) out.push(`   Remote: ${url}`);
    } catch (_) { /* no remote */ }

    // File tree (top level + key dirs)
    const files = await readdir(cwd, { withFileTypes: true });
    const ignored = new Set(['.git', 'node_modules', '.ciclo', 'context', 'docs', 'vendor', 'dist', 'build', '.planning']);
    const top = files
      .filter((f) => !f.name.startsWith('.') && !ignored.has(f.name))
      .map((f) => (f.isDirectory() ? f.name + '/' : f.name))
      .sort();
    out.push('');
    out.push('   Estrutura (raiz):');
    top.forEach((name) => out.push(`     ${name}`));

    if (opts.code) {
      // deeper walk (2 levels) excluding noise
      const deep = [];
      for (const f of files) {
        if (!f.isDirectory() || ignored.has(f.name) || f.name.startsWith('.')) continue;
        try {
          const sub = await readdir(join(cwd, f.name), { withFileTypes: true });
          for (const s of sub) {
            if (s.name.startsWith('.') || s.name === 'node_modules') continue;
            deep.push(`     ${f.name}/${s.isDirectory() ? s.name + '/' : s.name}`);
          }
        } catch (_) { /* skip */ }
      }
      if (deep.length > 0) {
        out.push('   Estrutura (2 níveis):');
        deep.slice(0, 80).forEach((line) => out.push(line));
        if (deep.length > 80) out.push(`     … e mais ${deep.length - 80} itens`);
      }
    }

    console.log(out.join('\n'));
    console.log('');
    console.log('💡 Para refinar: discorra a proposta no chat e, após aprovação do dev, use:');
    console.log(`   ciclo refine ${task.id.substring(0, 8)} --plan '<json com goal/steps/expectedResult/acceptanceCriteria>'`);
  });

module.exports = contextCommand;