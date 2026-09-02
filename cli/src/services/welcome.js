// src/services/welcome.js
// Boas-vindas exibidas na PRIMEIRA execução do ciclo em uma máquina.
//
// Por que existe: o npm ≥11 bloqueia scripts postinstall de dependências por
// padrão (allow-scripts), então a mensagem de instalação pode não aparecer.
// Este first-run garante que o usuário veja boas-vindas + comandos disponíveis
// na primeira vez que roda `ciclo`, em qualquer npm/versão. Discreto: marca
// ~/.ciclo/first-run.json e não repete; compatível com CICLO_SKIP_UPDATE_CHECK=1
// (CI) e com a flag env CICLO_NO_WELCOME=1 para silenciar.

const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const MARKER = join(os.homedir(), '.ciclo', 'first-run.json');

function alreadyShown() {
  try {
    return !!JSON.parse(readFileSync(MARKER, 'utf8')).shownAt;
  } catch {
    return false;
  }
}

function markShown() {
  try {
    mkdirSync(join(os.homedir(), '.ciclo'), { recursive: true });
    writeFileSync(MARKER, JSON.stringify({ shownAt: Date.now() }, null, 2), 'utf8');
  } catch (_) { /* best-effort */ }
}

function showWelcome() {
  if (process.env.CICLO_NO_WELCOME === '1' || process.env.CI) return;
  if (alreadyShown()) return;

  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;
  const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

  const hermesInstall = process.platform === 'win32'
    ? 'PowerShell: iex (irm https://hermes-agent.nousresearch.com/install.ps1)'
    : 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash';

  const msg = `
${bold('\x1b[32m🎉 Bem-vindo ao ciclo!')} ${dim('(framework de IA para o ciclo de desenvolvimento)')}

${bold('Comandos essenciais:')}
  ${cyan('ciclo doctor')}             valida o ambiente (acli + gh + Hermes)
  ${cyan('ciclo skills install')}     instala as skills do framework no Hermes (1ª vez)
  ${cyan('ciclo init')}               inicializa um projeto de dev (wizard)
  ${cyan('ciclo new "descrição"')}    cria a primeira task (local + issue no Jira)
  ${cyan('ciclo list')}               lista as tasks
  ${cyan('ciclo update-check')}       verifica se há versão nova + changelog

${bold('Próximos passos:' )}
  1. ${cyan('ciclo skills install')}           → skills no Hermes (~/.hermes/skills/)
  2. ${cyan('cd /caminho/do/projeto')} → ${cyan('ciclo init')} → inicializa o projeto
  3. ${cyan('ciclo new "Minha primeira feature"')} → primeira task

${dim(`Pré-requisitos: Hermes Agent (${hermesInstall}), acli + gh (instalados pelo ciclo init).`)}
${dim('Docs: https://github.com/guionardo/ciclo#readme · Roteiro completo: docs/ciclo/ROTEIRO-REPLICACAO.md')}
`;
  process.stdout.write(msg);
  markShown();
}

module.exports = { showWelcome, alreadyShown, markShown };