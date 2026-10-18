import type { RoundResult } from "./duel";
import { twoLetterLesson } from "./words";

export interface StudyCard {
  rounds: number;
  bestWord: { word: string; score: number } | null;
  bestFound: number;
  pointsLeft: number;
  twoLetterPlayed: number;
  missed: { word: string; score: number }[];
  tips: string[];
  learning: string[];
}

export function buildStudyCard(history: RoundResult[], seed: number): StudyCard {
  let bestWord: { word: string; score: number } | null = null;
  let bestFound = 0;
  let pointsLeft = 0;
  let twoLetterPlayed = 0;
  const missedMap = new Map<string, number>();

  for (const round of history) {
    if (round.yourWord.length === 2) twoLetterPlayed += 1;

    const best = round.best;
    if (!best) continue;
    if (!bestWord || best.score > bestWord.score) {
      bestWord = { word: best.word, score: best.score };
    }
    if (round.yourScore >= best.score) {
      bestFound += 1;
      continue;
    }
    pointsLeft += best.score - round.yourScore;
    missedMap.set(best.word, best.score);
  }

  const missed = [...missedMap.entries()]
    .map(([word, score]) => ({ word, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const tips: string[] = [];
  if (pointsLeft > 0) tips.push(`You left ${pointsLeft} points behind.`);
  if (history.length > 0 && bestFound >= Math.ceil(history.length / 2)) {
    tips.push(`You found the best word in ${bestFound} of ${history.length} rounds.`);
  }
  if (pointsLeft === 0 && history.length > 0) {
    tips.push("You found the best word every round. That is the whole game.");
  }

  const learning: string[] = [];
  if (twoLetterPlayed === 0 && history.length > 0) {
    tips.push("You never played a two-letter word.");
    learning.push(...twoLetterLesson(seed, 12));
  }

  return {
    rounds: history.length,
    bestWord,
    bestFound,
    pointsLeft,
    twoLetterPlayed,
    missed,
    tips,
    learning,
  };
}
