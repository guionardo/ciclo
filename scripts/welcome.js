#!/usr/bin/env node
// scripts/welcome.js — mensagem de boas-vindas exibida após `npm install -g guionardo/ciclo`
// (executada pelo script "postinstall" do package.json da raiz).
// É best-effort: nunca deve falhar a instalação (qualquer erro → sai 0).

'use strict';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

// Instalador oficial do Hermes por SO: install.sh (Linux/macOS) | install.ps1 (Windows PowerShell)
const hermesInstall = process.platform === 'win32'
  ? 'PowerShell: iex (irm https://hermes-agent.nousresearch.com/install.ps1)'
  : 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash';

function main() {
  const msg = `
${green(bold('🎉 ciclo instalado com sucesso!'))} ${dim('(framework de IA para o ciclo de desenvolvimento)')}

${bold('Comandos essenciais:')}
  ${cyan('ciclo --version')}          confere a versão instalada
  ${cyan('ciclo doctor')}             valida o ambiente (acli + gh + Hermes)
  ${cyan('ciclo skills install')}     instala as skills do framework no Hermes (1ª vez)
  ${cyan('ciclo init')}               inicializa um projeto de dev (wizard)
  ${cyan('ciclo new "descrição"')}    cria a primeira task (local + issue no Jira)
  ${cyan('ciclo list')}               lista as tasks
  ${cyan('ciclo update-check')}       verifica se há versão nova + changelog

${bold('Próximos passos:')}
  1. ${cyan('ciclo skills install')}        → skills no Hermes (~/.hermes/skills/)
  2. ${cyan('cd /caminho/do/projeto')} → ${cyan('ciclo init')}   → inicializa o projeto
  3. ${cyan('ciclo new "Minha primeira feature"')} → primeira task

${dim(`Pré-requisitos: Hermes Agent (${hermesInstall}), acli + gh (instalados pelo ciclo init).`)}
${dim('Docs: https://github.com/guionardo/ciclo#readme · Roteiro completo: docs/ciclo/ROTEIRO-REPLICACAO.md')}
`;
  process.stdout.write(msg);
}

try {
  main();
} catch (_) {
  // best-effort — nunca quebrar a instalação
}
process.exit(0);