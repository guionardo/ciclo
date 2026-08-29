// src/commands/report.js
const { Command } = require('commander');
const { access, readdir, stat } = require("node:fs/promises");
const { join } = require("node:path");
const { jiraToCiclo, CICLO_STATES } = require('../services/statusMap.js');

const reportCommand = new Command()
  .command('report')
  .description('Generate observability report (add --jira to merge Jira data)')
  .option('-j, --jira', 'Merge Jira data (assignee, priority, status, labels) from the board')
  .action(async (opts) => {
    const cwd = process.cwd();
    const tasksDir = join(cwd, '.ciclo', 'tasks');

    try {
      await access(tasksDir);
    } catch {
      console.error('✗ .ciclo directory not found. Run `ciclo init` first.');
      process.exit(1);
    }

    let files;
    try {
      files = await readdir(tasksDir);
    } catch (err) {
      console.error(`Erro ao ler diretório de tasks: ${err}`);
      process.exit(1);
    }

    const taskFiles = files.filter(f => f.endsWith('.json'));
    if (taskFiles.length === 0) {
      console.log('Nenhuma task encontrada para gerar relatório.');
      return;
    }

    const tasks = [];
    for (const file of taskFiles) {
      try {
        const content = await require("node:fs/promises").readFile(join(tasksDir, file), 'utf8');
        const task = JSON.parse(content);
        tasks.push(task);
      } catch (err) {
        console.warn(`Erro ao ler task ${file}: ${err}`);
      }
    }

    // --- Optional: merge Jira data (report --jira) ---
    let jiraByKey = new Map(); // jiraKey (lower) -> { assignee, priority, jiraStatus, labels, key }
    if (opts.jira) {
      try {
        const JiraTaskStore = require('../services/JiraTaskStore.js');
        const { getRepoLabel } = require('../services/repoLabel.js');
        const store = new JiraTaskStore();
        if (store.configured) {
          const issues = await store.listTasks({ repoLabel: getRepoLabel(cwd), limit: 100 });
          for (const issue of issues) {
            jiraByKey.set(String(issue.key).toLowerCase(), {
              key: issue.key,
              assignee: issue.assignee || '',
              priority: issue.priority || '',
              jiraStatus: issue.status || '',
              labels: issue.labels || [],
            });
          }
        } else {
          console.log('⚠️  ACLI não autenticada — pulando dados do Jira (rode: acli jira auth login --web)');
        }
      } catch (err) {
        console.log(`⚠️  Não foi possível buscar dados do Jira: ${err.message}`);
      }
    }

    // Attach Jira info to local tasks that have a jiraKey
    for (const t of tasks) {
      if (t.jiraKey) {
        const info = jiraByKey.get(String(t.jiraKey).toLowerCase());
        if (info) {
          t.jiraAssignee = info.assignee;
          t.jiraPriority = info.priority;
          t.jiraStatus = info.jiraStatus;
          t.jiraLabels = info.labels;
        } else {
          // Task has jiraKey but the Jira issue was deleted / belongs elsewhere
          t.jiraMissing = true;
        }
      }
    }

    // Statuses we expect (ciclo states; normalize any Jira-style statuses found)
    const statuses = CICLO_STATES;
    const stats = {};
    statuses.forEach(s => {
      stats[s] = { count: 0, totalAgeMs: 0, tasks: [] };
    });

    const now = Date.now();
    tasks.forEach(t => {
      let status = jiraToCiclo(t.status || 'backlog'); // normalize Jira → ciclo
      if (!stats[status]) {
        status = 'backlog'; // unknown → backlog
      }
      const created = new Date(t.createdAt || t.updatedAt || now).getTime();
      const ageMs = now - created;
      stats[status].count++;
      stats[status].totalAgeMs += ageMs;
      stats[status].tasks.push(t);
    });

    console.log('📊 ciclo observability report');
    console.log('============================');

    console.log(`Total tasks: ${tasks.length}`);
    if (opts.jira) {
      console.log(`🔄 Dados do Jira: ${jiraByKey.size} issue(s) com o label do repo mescladas`);
      const missing = tasks.filter(t => t.jiraMissing);
      if (missing.length > 0) {
        console.log(`   ⚠️  ${missing.length} task(s) local(is) com jiraKey sem issue correspondente no label do repo`);
        console.log(`       (o issue pode ter sido apagado ou não ter o label "${getRepoLabelSafe(cwd)}")`);
      }
    }
    console.log('');

    console.log('Por estado:');
    statuses.forEach(s => {
      const { count, totalAgeMs, tasks: statusTasks } = stats[s];
      if (count === 0) return;
      const avgAgeMs = totalAgeMs / count;
      const avgAgeDays = avgAgeMs / (1000 * 60 * 60 * 24);
      console.log(`  ${s}: ${count} task(s)`);
      console.log(`    Idade média: ${avgAgeDays.toFixed(2)} dias`);
      // Optionally list task IDs
      if (count <= 5) {
        const ids = statusTasks.map(t => t.id.substring(0, 8)).join(', ');
        console.log(`    IDs: ${ids}`);
      } else {
        console.log(`    (lista de IDs omitida para brevedade)`);
      }
      console.log('');
    });

    // Tasks with branch (likely in progress)
    const withBranch = tasks.filter(t => t.branch);
    if (withBranch.length > 0) {
      console.log(`🌱 Tasks com branch ativa: ${withBranch.length}`);
      withBranch.forEach(t => {
        console.log(`  ${t.id.substring(0,8)} – ${t.description} (branch: ${t.branch})`);
      });
      console.log('');
    }

    // Tasks recently updated (last 24h)
    const recent = tasks.filter(t => {
      const updated = new Date(t.updatedAt || t.createdAt || now).getTime();
      return (now - updated) < 24 * 60 * 60 * 1000;
    });
    if (recent.length > 0) {
      console.log(`🕒 Tasks atualizadas nas últimas 24h: ${recent.length}`);
      recent.forEach(t => {
        console.log(`  ${t.id.substring(0,8)} – ${t.description} [${t.status}]`);
      });
      console.log('');
    }

    // --- Jira summary section (report --jira) ---
    if (opts.jira) {
      const jiraTasks = tasks.filter(t => t.jiraKey && !t.jiraMissing);
      if (jiraTasks.length > 0) {
        console.log('🔄 Dados do Jira por task:');
        const pad = (s, n) => String(s || '').padEnd(n);
        for (const t of jiraTasks) {
          console.log(`  ${pad(t.id.substring(0,8), 9)} ${pad(t.jiraKey, 8)} ${pad(t.jiraStatus, 12)} ${pad(t.jiraAssignee || '-', 20)} ${pad(t.jiraPriority || '-', 10)} ${t.description.slice(0, 40)}`);
        }
        console.log('');

        // By assignee
        const byAssignee = {};
        jiraTasks.forEach(t => {
          const a = t.jiraAssignee || '(sem assignee)';
          byAssignee[a] = (byAssignee[a] || 0) + 1;
        });
        console.log('👤 Por responsável:');
        Object.entries(byAssignee)
          .sort((a, b) => b[1] - a[1])
          .forEach(([a, n]) => console.log(`  ${a}: ${n}`));
        console.log('');

        // By priority
        const byPriority = {};
        jiraTasks.forEach(t => {
          const p = t.jiraPriority || '(sem prioridade)';
          byPriority[p] = (byPriority[p] || 0) + 1;
        });
        if (Object.keys(byPriority).length > 0) {
          console.log('🎯 Por prioridade:');
          Object.entries(byPriority)
            .sort((a, b) => b[1] - a[1])
            .forEach(([p, n]) => console.log(`  ${p}: ${n}`));
          console.log('');
        }
      }
    }

    console.log('💡 Dica: use `ciclo doctor` para validar configurações de serviço.');
  });

function getRepoLabelSafe(cwd) {
  try {
    const { getRepoLabel } = require('../services/repoLabel.js');
    return getRepoLabel(cwd);
  } catch (_) {
    return '(indefinido)';
  }
}

module.exports = reportCommand;