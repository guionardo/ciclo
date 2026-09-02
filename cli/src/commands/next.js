// src/commands/next.js
// Exibe apenas a sugestão de próximo passo com base no estado do projeto, sem validar dependências.
const { Command } = require('commander');
const { access } = require('node:fs/promises');
const { join } = require('node:path');
const { readdir } = require('node:fs/promises');

const nextCommand = new Command()
  .command('next')
  .description('Mostra a sugestão de próximo passo com base no estado do projeto')
  .action(async () => {
    const cwd = process.cwd();
    const configPath = join(cwd, '.ciclo');
    let isProject = true;
    try {
      await access(configPath);
    } catch {
      isProject = false;
    }

    if (!isProject) {
      console.log('🚀 Próximo passo sugerido: Execute `ciclo init` para iniciar um novo projeto ciclo.');
    } else {
      // Verificar se há tarefas
      const tasksDir = join(cwd, '.ciclo', 'tasks');
      let taskCount = 0;
      try {
        const files = await readdir(tasksDir);
        taskCount = files.filter(f => f.endsWith('.json')).length;
      } catch {
        // Se o diretório de tarefas não existir, considere 0 tarefas
      }

      if (taskCount === 0) {
        console.log('🚀 Próximo passo sugerido: Nenhuma tarefa encontrada. Execute `ciclo new` para criar uma nova tarefa.');
      } else {
        console.log('🚀 Próximo passo sugerido: Execute `ciclo list` para ver as tarefas e `ciclo start <id>` para iniciar uma tarefa.');
      }
    }
  });

module.exports = nextCommand;