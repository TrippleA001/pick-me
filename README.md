# Pick Me

A word duel. You and your opponent get **the same seven letters**, you both get
**twenty seconds**, and you both lay a word down. The two words meet: the higher
score takes the round, and the loser's word is knocked off the board. The winner
of the round deals damage equal to the gap, and the first player whose health
runs out loses the match.

The name is the joke. Nobody picks anything here — you bring the best word you
can find in twenty seconds and you live with it.

## Rules

| Rule | Detail |
| --- | --- |
| Letters | The same seven tiles for both players, drawn from a seeded rack |
| Time | 20 seconds a round. No take-backs |
| Word length | Two letters minimum, seven maximum |
| Score | Standard tile values, plus 50 for using all seven (a bingo) |
| Blanks | Any letter, worth nothing on its own |
| The clash | Higher score wins the round and keeps its word on the board |
| Damage | Winner deals the score gap, at least 3, so nothing is ever free |
| A draw | The player who owns the turn takes the round. Ties still bleed |
| Health | 60 each, so a match is a handful of rounds, not a war |
| Turn owner | Alternates every round — winning the turn matters |

## The opponent

The bot is the same seven letters played at three levels of nerve:

- **Rookie** — plays between 35% and 70% of the best available score. It will
  miss the bingo and it will let you take rounds off it.
- **Club** — plays at least 80% of the best available score. It does not hand
  rounds over, but it does not always find the top word.
- **Pro** — plays the best word on the board, every time. It is the oracle. If
  you beat Pro it is because you found the best word yourself, and then some.

Every round ends with a look back at what the best word was and what you missed,
and every match ends with a study card: the best word of the match, the points
you left on the table, and the two-letter words worth drilling. That is the part
that carries over into the rest of your week.

## Word list

`data/enable1.txt` is the [ENABLE](https://en.wikipedia.org/wiki/ENABLE) list —
51,948 of its words can be built from a seven-tile rack. ENABLE is a
North-American ("TWL-style") list, so the two-letter words it accepts are its
own; it does not contain every word some other list would. Both you and the bot
are judged by the same list, so the duel is fair. If you play a word the game
refuses, it is the list talking, not the bot.

## Playing

You are dealt seven tiles. Tap them to lay a word down — a `*` tile is a blank
and asks which letter it is standing in for. Press **Play** before the clock
runs out, or the round is recorded as a zero and you take it on the chin.

A daily duel at Pro difficulty replays the same racks for everyone, so the same
words are available to every player all day.

## Leaderboard

Runs are saved to start.ng once you sign in, and ranked by **Beat Pro** — the
number of matches you have won against the Pro opponent, then your **Best word**
and your **Best round**. Career bests are kept in `localStorage` and sent as a
whole, so the board always shows the best you have done.

## Building

The game is a static site. The built output is committed at the repo root, where
start.ng looks for it first; the Vite source sits in `app/`.

```sh
cd app
pnpm install
pnpm ship     # type-check, build, then copy dist/ to the repo root
```

`pnpm dev` runs the source with a local server. `pnpm ship` is what updates the
published game, because start.ng serves the committed files and never builds
anything itself.

## Layout

```
index.html, assets/       the built game start.ng serves
data/enable1.txt          the word list
startng.json              leaderboard columns
cover.png                 the card on the start.ng homepage
app/                      the Vite + TypeScript source
```
