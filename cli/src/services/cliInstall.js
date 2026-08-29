// src/services/cliInstall.js
// Platform detection + install/upgrade commands for the CLIs ciclo depends on:
//   - acli  (Atlassian CLI, official) — required for Jira
//   - gh    (GitHub CLI, official)    — required for GitHub operations
// Supports macOS, Windows and Linux. Detects the platform at runtime and returns
// ready-to-run install commands (auto) and human-readable manual instructions.

const os = require('node:os');
const { execaCommandSync } = require('execa');

const PLATFORMS = {
  darwin: 'macos',
  win32: 'windows',
  linux: 'linux',
};

function detectPlatform() {
  return PLATFORMS[process.platform] || 'other';
}

function detectArch() {
  const arch = os.arch(); // arm64 | x64 | arm | ia32 ...
  if (arch === 'arm64') return 'arm64';
  if (arch === 'x64') return 'amd64';
  return arch;
}

function isCommandAvailable(cmd) {
  const names = process.platform === 'win32' ? [cmd, `${cmd}.exe`, `${cmd}.cmd`, `${cmd}.bat`] : [cmd];
  for (const name of names) {
    try {
      if (process.platform === 'win32') {
        execaCommandSync(`where ${name}`, { shell: true });
      } else {
        execaCommandSync(`which ${name}`, { shell: true });
      }
      return true;
    } catch (_) {
      // try next candidate name
    }
  }
  return false;
}

/**
 * Install specs per CLI.
 * auto:   array of shell commands to run automatically (pipe-safe, one per entry)
 * manual: array of human-readable instruction lines (user copies them)
 */
const INSTALL_SPECS = {
  acli: {
    name: 'acli (Atlassian CLI)',
    requiredFor: 'Jira',
    macos: {
      auto: ['brew tap atlassian/homebrew-acli', 'brew install acli'],
      manual: [
        'brew tap atlassian/homebrew-acli',
        'brew install acli',
      ],
    },
    windows: {
      auto: [
        // Install to user-local bin dir (no admin needed)
        'powershell -NoProfile -Command "New-Item -ItemType Directory -Force -Path $HOME\\bin | Out-Null; Invoke-WebRequest -Uri https://acli.atlassian.com/windows/latest/acli_windows_amd64/acli.exe -OutFile $HOME\\bin\\acli.exe"',
      ],
      manual: [
        'powershell -NoProfile -Command "Invoke-WebRequest -Uri https://acli.atlassian.com/windows/latest/acli_windows_amd64/acli.exe -OutFile acli.exe"',
        'Move-Item .\\acli.exe <pasta-em-PATH>\\acli.exe   # ex.: C:\\Users\\voce\\bin',
      ],
    },
    linux: {
      auto: [
        'mkdir -p ~/.local/bin',
        'curl -sL "https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli" -o ~/.local/bin/acli',
        'chmod +x ~/.local/bin/acli',
      ],
      manual: [
        'curl -sL "https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli" -o ~/.local/bin/acli',
        'chmod +x ~/.local/bin/acli',
        '# (Debian/Ubuntu via apt: veja https://developer.atlassian.com/cloud/acli/guides/install-linux/)',
      ],
    },
  },
  gh: {
    name: 'gh (GitHub CLI)',
    requiredFor: 'GitHub (push, branches, PRs)',
    macos: {
      auto: ['brew install gh'],
      manual: ['brew install gh'],
    },
    windows: {
      auto: ['winget install --id GitHub.cli -e'],
      manual: [
        'winget install --id GitHub.cli -e',
        '# ou: choco install gh / scoop install gh / https://cli.github.com/',
      ],
    },
    linux: {
      auto: [
        // Debian/Ubuntu official apt repository
        '(type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y))',
        'sudo mkdir -p -m 755 /etc/apt/keyrings',
        'wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null',
        'sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg',
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
        'sudo apt update',
        'sudo apt install gh -y',
      ],
      manual: [
        '# Debian/Ubuntu (repositório oficial do GitHub)',
        '(type -p wget >/dev/null || (sudo apt update && sudo apt-get install wget -y))',
        'sudo mkdir -p -m 755 /etc/apt/keyrings',
        'wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null',
        'sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg',
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
        'sudo apt update',
        'sudo apt install gh -y',
        '# Fedora/RHEL: sudo dnf install -y \'dnf-command(config-manager)\' && sudo dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo && sudo dnf install -y gh',
      ],
    },
  },
};

/**
 * Get the install spec for a CLI on the current platform.
 * @param {'acli'|'gh'} cli
 * @returns {{auto: string[], manual: string[]} | null}
 */
function getInstallSpec(cli) {
  const spec = INSTALL_SPECS[cli];
  if (!spec) return null;
  const platform = detectPlatform();
  if (!spec[platform]) return null;
  return spec[platform];
}

/**
 * Print manual install instructions for a CLI.
 * @param {'acli'|'gh'} cli
 */
function printManualInstall(cli) {
  const spec = INSTALL_SPECS[cli];
  const platform = detectPlatform();
  const steps = spec && spec[platform] ? spec[platform].manual : [];
  console.log('');
  console.log(`📥  Para instalar **${spec ? spec.name : cli}** manualmente (${platform}):`);
  steps.forEach((s) => console.log(`     ${s}`));
  if (steps.length === 0) {
    console.log(`     Consulte a documentação oficial de ${cli}.`);
  }
}

/**
 * Attempt automatic installation of a CLI using platform-specific commands.
 * Runs each command sequentially; stops at the first failure.
 * @param {'acli'|'gh'} cli
 * @returns {Promise<boolean>} true if the CLI became available after install
 */
async function installCli(cli) {
  const spec = getInstallSpec(cli);
  if (!spec || spec.auto.length === 0) {
    console.log(`⚠️  Instalação automática de ${cli} não suportada nesta plataforma.`);
    printManualInstall(cli);
    return false;
  }
  const platform = detectPlatform();
  console.log(`🛠️  Instalando ${cli} (${platform})...`);
  for (const cmd of spec.auto) {
    try {
      const result = await runCommand(cmd);
      if (result.stderr && result.stderr.trim()) {
        // brew/apt write warnings to stderr; only surface real errors we can't recover from
        console.log(`   (aviso) ${result.stderr.trim().split('\n').pop()}`);
      }
    } catch (err) {
      // On Windows, winget/Invoke-WebRequest may need interactive consent; report and abort
      console.error(`✗ Falha ao executar: ${cmd}`);
      console.error(`    ${err.stderr || err.message}`);
      printManualInstall(cli);
      return false;
    }
  }
  // Verify availability after install
  if (isCommandAvailable(cli)) {
    console.log(`✅ ${cli} instalado com sucesso!`);
    return true;
  }
  console.log(`⚠️  ${cli} aparentemente instalado, mas não encontrado no PATH (talvez seja necessário reiniciar o terminal).`);
  return false;
}

function runCommand(cmd) {
  const { execa } = require('execa');
  // Use non-shell execa for structured output; fall back to shell for complex commands
  return execa(cmd, { shell: true, reject: false, timeout: 180000, env: process.env });
}

module.exports = {
  detectPlatform,
  detectArch,
  isCommandAvailable,
  getInstallSpec,
  printManualInstall,
  installCli,
  INSTALL_SPECS,
};