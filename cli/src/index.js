#!/usr/bin/env node
const { program } = require('commander');
const initCommand = require('./commands/init');
const newCommand = require('./commands/new');
const listCommand = require('./commands/list');
const showCommand = require('./commands/show');
const moveCommand = require('./commands/move');
const startCommand = require('./commands/start');
const reportCommand = require('./commands/report');
const doctorCommand = require('./commands/doctor');

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

program.parse();