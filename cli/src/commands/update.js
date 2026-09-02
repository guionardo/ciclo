// src/commands/update.js
// Verificação manual de novas versões da CLI: `ciclo update-check`.
//   ciclo update-check            # mostra versão atual, disponível e changelog
//   ciclo update-check --json     # saída estruturada (jq-friendly)
//   ciclo update-check --forçar   # ignora o cache da checagem periódica

const { Command } = require('commander');

const updateCommand = new Command('update-check')
  .alias('update')
  .description('Verifica se há nova versão da CLI ciclo e mostra o changelog')
  .option('-j, --json', 'saída em JSON')
  .option('-f, --forcar', 'ignora o cache e consulta o GitHub agora')
  .action(async (opts) => {
    const { checkForUpdates, getLocalVersion } = require('../services/updateCheck.js');
    try {
      const r = await checkForUpdates({ force: !!opts.forcar });

      if (opts.json) {
        console.log(JSON.stringify(r, null, 2));
        return;
      }

      console.log(`🔄 ciclo update-check — repositório: ${r.repo}\n`);
      console.log(`   Versão instalada:   v${r.current}`);
      if (!r.latest) {
        console.log('   Versão disponível: (indisponível — sem releases publicadas)');
        console.log('   Você está na branch main (instalação via GitHub).');
      } else if (r.updateAvailable) {
        console.log(`   Versão disponível: ${r.latest}  🆕`);
        console.log(`   Fonte: ${r.source === 'release' ? `GitHub Release (${r.releaseUrl})` : `package.json da branch main`}`);
        console.log(`\n   Atualize com:\n     ${r.installCommand}\n`);
        console.log('   ── Changelog ───────────────────────────────────────────');
        console.log(r.changelog ? `\n${r.changelog}\n` : '   (sem changelog para esta versão)');
      } else {
        console.log(`   Versão disponível: ${r.latest} (você está em dia ✅)`);
        if (r.changelog) {
          console.log('\n   ── Últimas mudanças na main ──────────────────────────');
          console.log(`\n${r.changelog}\n`);
        }
      }
    } catch (err) {
      console.error(`✗ Falha ao verificar atualização: ${err.message}`);
      console.error('   (sem internet ou GitHub indisponível — a checagem automática é silenciosa)');
      process.exitCode = 1;
    }
  });

module.exports = updateCommand;