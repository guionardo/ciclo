# Skill Selection for Ciclo

During `ciclo init`, you can optionally enable skill sets that unlock AI-assisted features such as task refinement with the Hermes Agent, code generation via coding agents, and more.

## How it works
- When the wizard prompts for skill selection (unless you use `-y/--yes`), you can choose one or more skill categories.
- Your selections are stored in `.ciclo/config.json` under the `skillsEnabled` array.
- At runtime, the ciclo CLI loads the listed skills, making their tools and capabilities available for commands like `hermes chat -q`, `delegate_task`, and `ciclo refine`.

## Default selection
If no prior configuration exists, the wizard pre-selects:
- `hermes-agent` (core configuration and orchestration)
- `autonomous-ai-agents` (for spawning specialized agents)

You can always change the selected skills later by editing `.ciclo/config.json` directly or re‑running the wizard (without `-y`).

## Available skill categories
| Skill set | Description |
|-----------|-------------|
| hermes-agent | Hermes Agent core: configuration, theming, extension, orchestration |
| coding-agents | Coding agents: Claude Code, OpenCode, etc. |
| autonomous-ai-agents | Autonomous AI agents: planning, ideation, execution workflows |
| computer-use | Desktop control via CUADriver (background mouse/keyboard) |
| github | GitHub operations: auth, repos, issues, PRs, code review |
| gsd | Project management: GSD workflows, Kanban, etc. |
| data-science | Data science & ML: Jupyter, monitoring, etc. |
| creative | Creative content: ASCII art, diagrams, hand‑drawn style |
| note-taking | Note taking & documentation: Obsidian, etc. |
| devops | DevOps & infrastructure: monitoring, CI/CD, etc. |

## Example
After selecting `hermes-agent` and `coding-agents`, your `.ciclo/config.json` will contain:
```json
{
  "skillsEnabled": ["hermes-agent", "coding-agents"]
}
```