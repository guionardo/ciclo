#!/usr/bin/env node
// Carrega variáveis opcionais de .env silenciosamente (ex.: JIRA_PROJECT_KEY, GITHUB_OWNER).
// Credenciais NÃO vêm de .env: Jira usa a sessão da ACLI e GitHub usa o gh (keyring).
require('dotenv').config({ quiet: true });
const { program } = require('commander');
const initCommand = require('../src/commands/init');
const newCommand = require('../src/commands/new');
const listCommand = require('../src/commands/list');
const showCommand = require('../src/commands/show');
const moveCommand = require('../src/commands/move');
const startCommand = require('../src/commands/start');
const reportCommand = require('../src/commands/report');
const doctorCommand = require('../src/commands/doctor');
const syncCommand = require('../src/commands/sync');
const workCommand = require('../src/commands/work');
const contextCommand = require('../src/commands/context');
const instructionsCommand = require('../src/commands/instructions');
const refineCommand = require('../src/commands/refine');
const skillsCommand = require('../src/commands/skills');
const updateCommand = require('../src/commands/update');
const nextCommand = require('../src/commands/next');

// Boas-vindas na primeira execução (garante a mensagem mesmo quando o npm ≥11
// bloqueia o postinstall via allow-scripts). Discreto e one-shot.
const { showWelcome } = require('../src/services/welcome.js');
showWelcome();

// Checagem periódica de nova versão (TTL 24h; silenciosa se não há update;
// desligável com CICLO_SKIP_UPDATE_CHECK=1 ou em CI). Dispara sem bloquear.
const { scheduleAutomaticCheck } = require('../src/services/updateCheck.js');
scheduleAutomaticCheck();

program
 .name('ciclo')
 .description('Framework de IA para o ciclo de desenvolvimento')
 .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(newCommand);
program.addCommand(listCommand);
program.addCommand(showCommand);
program.addCommand(moveCommand);
program.addCommand(startCommand);
program.addCommand(reportCommand);
program.addCommand(doctorCommand);
program.addCommand(syncCommand);
program.addCommand(workCommand);
program.addCommand(contextCommand);
program.addCommand(instructionsCommand);
program.addCommand(refineCommand);
program.addCommand(skillsCommand);
program.addCommand(updateCommand);
program.addCommand(nextCommand);

program.parse();