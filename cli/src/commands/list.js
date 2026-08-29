const { Command } = require('commander');
const { access, readdir } = require("node:fs/promises");
const { join } = require("node:path");

const listCommand = new Command()
  .command('list')
  .description('List tasks')
  .action(async () => {
    const cwd = process.cwd();
    const tasksDir = join(cwd, '.ciclo', 'tasks');

    try {
      await access(tasksDir);
    } catch {
      console.log('Nenhuma task encontrada. Execute `ciclo new` primeiro.');
      return;
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
      console.log('Nenhuma task encontrada.');
      return;
    }

    const tasks = [];
    for (const file of taskFiles) {
      try {
        const content = await require("node:fs/promises").readFile(join(tasksDir, file), 'utf8');
        tasks.push(JSON.parse(content));
      } catch (err) {
        console.warn(`Erro ao ler task ${file}: ${err}`);
      }
    }

    // Sort by creation date (oldest first)
    tasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    console.log('Tasks:');
    tasks.forEach(t => {
      const shortId = t.id.substring(0, 8);
      const refinedMark = t.refined ? ' ✅' : (t.jiraKey ? ' ⚠️-sem-refine' : '');
      console.log(`  ${shortId} – ${t.description} [${t.status}]${refinedMark}`);
    });
    const unrefined = tasks.filter(t => t.jiraKey && !t.refined);
    if (unrefined.length > 0) {
      console.log('\nℹ️  Tasks com jiraKey sem a label "refined":');
      unrefined.forEach(t => console.log(`   ${t.jiraKey} — rode \`ciclo refine ${t.id.substring(0,8)}\``));
    }
  });

module.exports = listCommand;