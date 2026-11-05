# Wizz: Wizard score keeper

A scoring app for the **Wizard** trick-taking card game, for **3 to 10 players**.

**Play it:** https://helaas.github.io/Wizz/

The app is a small static web app with no build step and no server. Games are saved on your device with `localStorage`, and it works offline once loaded. You can add it to your phone's home screen as an app.

## Features

- **3–10 players.** The number of rounds follows from the deck: every player gets one more card each round.
- **Bids, then tricks.** Players are listed in bidding order: the player left of the dealer bids first and the dealer bids last. The dealer rotates every round.
- **Bids stay editable while playing:** tap a player's bid to correct it.
- **Live feedback:** the bid total shows how far over or under the hand it is, the tricks must add up before a round can be scored, and every player's points for the round appear as you enter tricks.
- **Scoreboard** with each player's running total, bid/tricks and points per round. Tap a round number to correct it, at any time, even after the game ends.
- **Chart** of every player's score over the rounds, with a tooltip per round and tap-to-highlight.
- **Standings** with ties and each player's count of correct bids.
- **Undo** the last round, **rename** players, **end early**, and **play again** with the same table.
- **History** of finished games.
- English, Nederlands and Deutsch; light and dark theme; keeps the screen awake while playing (where supported).

### Rounds per player count

| Players | 60 cards (1 deck) | 120 cards (2 decks) |
|--------:|------------------:|--------------------:|
| 3 | 20 | 40 |
| 4 | 15 | 30 |
| 5 | 12 | 24 |
| 6 | 10 | 20 |
| 7 | 8 | 17 |
| 8 | 7 | 15 |
| 9 | 6 | 13 |
| 10 | 6 | 12 |

The deck size can be set to any number, and you can choose to play fewer rounds. When every card is dealt in a round, the app reminds you there is no trump.

### Scoring

Standard Wizard scoring, adjustable in the game setup:

- Correct bid: **20 points + 10 per trick** won.
- Wrong bid: **−10 points per trick** difference.

### Optional rules

- **Bids may not add up:** the dealer can't make the total of all bids equal the number of cards. The forbidden value is blocked.
- **Bomb card:** one trick per round can go to nobody, so tricks may total one less than the cards.
- **Cloud card:** whoever wins the trick with the cloud must change their bid by one, up or down. During play, tap **Cloud** next to that player and pick the new bid. A bid of 0 can only go up, and there is only one cloud per round. The scoreboard marks bids changed by the cloud.

Optional rules can be switched on or off during a game under **Menu → Rules**, for example if you forgot to enable the cloud when starting.

## Development

```sh
npm start   # serves ./site on http://localhost:8080
npm test    # unit tests for the scoring logic (Node 20+)
```

| Path | What it holds |
|---|---|
| `site/index.html` | App shell |
| `site/js/game.js` | Pure game logic: rounds, dealer order, validation, scoring |
| `site/js/app.js` | UI: views, routing, dialogs |
| `site/js/chart.js` | SVG score chart |
| `site/js/i18n.js` | Translations |
| `site/sw.js` | Service worker for offline use |
| `tests/` | `node:test` unit tests |

## Deployment

`.github/workflows/pages.yml` runs the tests on every push to `main`. It then publishes the `site/` folder to the `gh-pages` branch, which GitHub Pages serves.

If the site doesn't appear, open **Settings → Pages** and set **Source** to **Deploy from a branch**, **Branch** `gh-pages`, folder `/ (root)`.
