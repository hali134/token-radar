# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/hali134/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/hali134/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: pre-token DefiLlama protocols ranked by implied value, with a farm plan for each. It reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that still record no token (and are not a wrapped or staked product of one that trades), ranks them by what their launch would be worth, and hands back a web dashboard with the board, a detail view per protocol, and the steps to farm it. Every row also carries a confidence score (0–100) built from its own record — lock size, age, seven-day calm, and data completeness — so you can tell a solid lead from a thin one at a glance.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22, standard library only. The program writes `board.json` (198 ranked rows, the full 40-protocol watchlist covered), the dashboard data, and `dossier.json` into the output directory, and copies `dashboard/` and `screenshots/` there. Run it twice and the outputs are byte-identical.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
