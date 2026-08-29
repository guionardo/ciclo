// src/commands/report.js
const { Command } = require('commander');
const { access, readdir, stat } = require("node:fs/promises");
const { join } = require("node:path");
const { jiraToCiclo, CICLO_STATES } = require('../services/statusMap.js');

const reportCommand = new Command()
  .command('report')
  .description('Generate observability report')
  .action(async () => {
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

    console.log(`Total tasks: ${tasks.length}\n`);

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

    console.log('💡 Dica: use `ciclo doctor` para validar configurações de serviço.');
  });

module.exports = reportCommand;