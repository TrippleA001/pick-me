/**
 * start.ng integration.
 *
 * The connect page (https://start.ng/connect) is a hidden page the game talks
 * to with postMessage. It only answers games served from *.start.ng, so every
 * call here resolves to null when the game is opened locally or as a file —
 * the game has to stay playable without a player.
 */

const START_NG = "https://start.ng";

export interface PlayerStyle {
  body?: string;
  primaryColor?: string;
  secondaryColor?: string;
  skinColor?: string;
  hairColor?: string;
  hair?: string;
  hat?: string;
  accessory?: string;
}

export interface StartNgPlayer {
  id?: number;
  name: string;
  account?: string;
  style?: PlayerStyle | null;
  face?: string;
}

interface WhoAmIReply {
  user: StartNgPlayer | null;
  guest: StartNgPlayer | null;
}

export interface BoardEntry {
  rank: number;
  player_id: number;
  name: string;
  color?: string;
  score: number;
  stats: Record<string, number>;
}

export interface ScoreSaved {
  ok?: boolean;
  error?: string;
  result?: {
    best: number;
    improved: boolean;
    rank: number;
    stats: Record<string, number>;
  };
}

let frame: Promise<HTMLIFrameElement> | null = null;

function connectFrame(): Promise<HTMLIFrameElement> {
  if (!frame) {
    frame = new Promise<HTMLIFrameElement>((resolve, reject) => {
      const el = document.createElement("iframe");
      el.src = `${START_NG}/connect`;
      el.hidden = true;
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("start.ng connect page did not load"));
      document.body.append(el);
    });
  }
  return frame;
}

async function ask<T>(message: object, replyType: string, timeoutMs = 5000): Promise<T | null> {
  let el: HTMLIFrameElement;
  try {
    el = await connectFrame();
  } catch {
    return null;
  }

  return new Promise<T | null>((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply: T | null) => {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(reply);
    };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    function onMessage(event: MessageEvent) {
      // Checking the origin is what makes the reply trustworthy.
      if (event.origin !== START_NG) return;
      if (event.source !== el.contentWindow) return;
      const data = event.data as { type?: string; requestId?: string } | null;
      if (!data || data.type !== replyType || data.requestId !== requestId) return;
      done(data as T);
    }
    window.addEventListener("message", onMessage);
    el.contentWindow?.postMessage({ ...message, requestId }, START_NG);
  });
}

export function whoAmI(): Promise<WhoAmIReply | null> {
  return ask<WhoAmIReply>({ type: "startng:whoami" }, "startng:user");
}

export function saveScore(stats: Record<string, number>): Promise<ScoreSaved | null> {
  return ask<ScoreSaved>({ type: "startng:score", stats }, "startng:scoreSaved");
}

export async function readBoard(limit = 10): Promise<BoardEntry[] | null> {
  const reply = await ask<{ ok?: boolean; entries?: BoardEntry[] }>(
    { type: "startng:leaderboard", limit },
    "startng:leaderboardData",
  );
  // null means start.ng did not answer, which is not the same as an empty board.
  if (!reply) return null;
  return reply.entries ?? [];
}

export function signInUrl(): string {
  const back = location.origin + location.pathname;
  return `${START_NG}/?return_to=${encodeURIComponent(back)}`;
}
