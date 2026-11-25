"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Square,
  Users,
  Trophy,
  Eye,
  EyeOff,
  Gamepad2,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  GripVertical,
  SlidersHorizontal,
  Lock,
  Unlock,
  Maximize2,
  Target,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getUniquePlayerColor } from "@/lib/colorsplayer";
import { INITIAL_GAMES, type CatalogGame } from "@/features/games/catalog";
import { QUESTIONS } from "@/lib/questions";
import {
  JUSTE_CHIFFRE_QUESTIONS,
  type JusteChiffreQuestion,
} from "@/lib/juste-chiffre-questions";
import type {
  GameSession,
  PlayerScore,
  PlayerSession,
  SessionStatus,
} from "@/types/game.types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GRAND_QUIZ_UUID = "6e6d7179-3a56-4d94-9c1d-19ac06a34aaa";
const QUESTION_DURATION_SECONDS = 12;
const QUESTIONS_PER_GAME = 15;

const JUSTE_CHIFFRE_MIN = 1;
const JUSTE_CHIFFRE_MAX = 1000;
const JUSTE_CHIFFRE_DURATION_SECONDS = 20;

const GRID_COLUMNS = 12;
const ROW_UNIT_PX = 44;
const ROW_GAP_PX = 20;
const LAYOUT_STORAGE_KEY = "admin_console_grid_layout_v1";

type WidgetId = "controls" | "qr" | "catalog" | "players";

interface GridWidgetItem {
  id: WidgetId;
  col: number;
  colSpan: number;
  row: number;
  rowSpan: number;
  minColSpan: number;
  minRowSpan: number;
}

const DEFAULT_GRID_LAYOUT: Record<WidgetId, GridWidgetItem> = {
  controls: {
    id: "controls",
    col: 0,
    colSpan: 5,
    row: 0,
    rowSpan: 6,
    minColSpan: 3,
    minRowSpan: 5,
  },
  qr: {
    id: "qr",
    col: 5,
    colSpan: 3,
    row: 0,
    rowSpan: 6,
    minColSpan: 2,
    minRowSpan: 4,
  },
  players: {
    id: "players",
    col: 8,
    colSpan: 4,
    row: 0,
    rowSpan: 13,
    minColSpan: 3,
    minRowSpan: 6,
  },
  catalog: {
    id: "catalog",
    col: 0,
    colSpan: 8,
    row: 6,
    rowSpan: 7,
    minColSpan: 4,
    minRowSpan: 5,
  },
};

function clampLayoutItem(item: GridWidgetItem): GridWidgetItem {
  const minColSpan = Math.max(2, Math.min(GRID_COLUMNS, item.minColSpan));
  const minRowSpan = Math.max(3, item.minRowSpan);
  const colSpan = Math.max(minColSpan, Math.min(GRID_COLUMNS, item.colSpan));
  const col = Math.max(0, Math.min(GRID_COLUMNS - colSpan, item.col));
  const row = Math.max(0, item.row);
  const rowSpan = Math.max(minRowSpan, item.rowSpan);
  return {
    ...item,
    col,
    colSpan,
    row,
    rowSpan,
    minColSpan,
    minRowSpan,
  };
}

function loadSavedGridLayout(): Record<WidgetId, GridWidgetItem> {
  if (typeof window === "undefined") {
    return DEFAULT_GRID_LAYOUT;
  }
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_GRID_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<Record<WidgetId, Partial<GridWidgetItem>>>;
    return {
      controls: clampLayoutItem({
        ...DEFAULT_GRID_LAYOUT.controls,
        ...parsed.controls,
        id: "controls",
      }),
      qr: clampLayoutItem({
        ...DEFAULT_GRID_LAYOUT.qr,
        ...parsed.qr,
        id: "qr",
      }),
      catalog: clampLayoutItem({
        ...DEFAULT_GRID_LAYOUT.catalog,
        ...parsed.catalog,
        id: "catalog",
      }),
      players: clampLayoutItem({
        ...DEFAULT_GRID_LAYOUT.players,
        ...parsed.players,
        id: "players",
      }),
    };
  } catch {
    return DEFAULT_GRID_LAYOUT;
  }
}

function saveGridLayout(layout: Record<WidgetId, GridWidgetItem>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Ignore storage errors
  }
}

function isUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

function isJusteChiffreGame(game?: CatalogGame | null): boolean {
  if (!game) return false;
  const slug = (game.slug ?? "").toLowerCase();
  const title = (game.title ?? "").toLowerCase();
  return (
    slug.includes("juste-chiffre") ||
    slug.includes("juste_chiffre") ||
    slug.includes("estimation") ||
    slug.includes("juste-prix") ||
    slug.includes("proche") ||
    title.includes("juste chiffre") ||
    title.includes("estimation") ||
    title.includes("juste prix") ||
    title.includes("proche")
  );
}

function ensureJusteChiffreCatalog(list: CatalogGame[]): CatalogGame[] {
  const hasJc = list.some((g) => isJusteChiffreGame(g));
  if (hasJc) return list;

  const jcFromInitial = INITIAL_GAMES.find((g) => isJusteChiffreGame(g));
  if (jcFromInitial) {
    return [...list, jcFromInitial];
  }

  return [
    ...list,
    {
      id: "juste-chiffre",
      slug: "juste-chiffre",
      title: "Le Juste Chiffre",
      tagline: "Trouvez ou approchez le nombre entre 1 et 1000",
      min_players: 1,
      max_players: 12,
      is_active: true,
    } as CatalogGame,
  ];
}

function generateSessionCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateSeriesSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shuffleWithSeed<T>(items: T[], seedKey: string): T[] {
  const copy = [...items];
  let seed = hashStringToSeed(seedKey) || 1;
  const nextRand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const itemI = copy[i];
    const itemJ = copy[j];
    if (itemI !== undefined && itemJ !== undefined) {
      copy[i] = itemJ;
      copy[j] = itemI;
    }
  }
  return copy;
}

function pickSeriesQuestions<T>(source: T[], count: number, seedKey: string): T[] {
  if (!Array.isArray(source) || source.length === 0) return [];
  const targetCount = Math.min(count, source.length);
  return shuffleWithSeed(source, seedKey).slice(0, targetCount);
}

function formatPlayerAnswer(rawAnswer: unknown): string | null {
  if (rawAnswer === null || rawAnswer === undefined) return null;
  if (typeof rawAnswer === "string" || typeof rawAnswer === "number") {
    const text = String(rawAnswer).trim().toUpperCase();
    return text.length > 0 ? text : null;
  }
  if (typeof rawAnswer === "object") {
    const obj = rawAnswer as {
      choice?: unknown;
      option?: unknown;
      answer?: unknown;
      selected?: unknown;
      value?: unknown;
      letter?: unknown;
    };
    const candidate =
      obj.choice ??
      obj.option ??
      obj.answer ??
      obj.selected ??
      obj.value ??
      obj.letter;
    if (typeof candidate === "string" || typeof candidate === "number") {
      const text = String(candidate).trim().toUpperCase();
      return text.length > 0 ? text : null;
    }
  }
  return null;
}

function formatNumericGuess(rawGuess: unknown): number | null {
  if (rawGuess === null || rawGuess === undefined) return null;
  const candidate =
    typeof rawGuess === "object"
      ? (rawGuess as { guess?: unknown; value?: unknown; answer?: unknown })
          .guess ??
        (rawGuess as { guess?: unknown; value?: unknown; answer?: unknown })
          .value ??
        (rawGuess as { guess?: unknown; value?: unknown; answer?: unknown })
          .answer
      : rawGuess;
  const num =
    typeof candidate === "number"
      ? candidate
      : typeof candidate === "string" && candidate.trim() !== ""
      ? Number(candidate.trim())
      : NaN;
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < JUSTE_CHIFFRE_MIN || rounded > JUSTE_CHIFFRE_MAX) return null;
  return rounded;
}

function resolveQuestionCorrectLetter(question: unknown): string | null {
  if (!question || typeof question !== "object") return null;
  const q = question as Record<string, unknown>;
  const letters = ["A", "B", "C", "D"];

  const rawDirect =
    q.correctAnswer ??
    q.correct_answer ??
    q.answer ??
    q.correct ??
    q.goodAnswer ??
    q.rightAnswer ??
    q.solution;

  if (typeof rawDirect === "number" && rawDirect >= 0 && rawDirect < 4) {
    return letters.at(rawDirect) ?? null;
  }

  if (typeof rawDirect === "string") {
    const trimmed = rawDirect.trim();
    const upper = trimmed.toUpperCase();
    if (letters.includes(upper)) return upper;
    if (/^[0-3]$/.test(trimmed)) {
      return letters.at(Number(trimmed)) ?? null;
    }

    const options = Array.isArray(q.options)
      ? q.options
      : Array.isArray(q.choices)
      ? q.choices
      : Array.isArray(q.answers)
      ? q.answers
      : null;

    if (options) {
      const idx = options.findIndex(
        (opt) =>
          typeof opt === "string" &&
          opt.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (idx >= 0 && idx < 4) {
        return letters.at(idx) ?? null;
      }
    }
  }

  const rawIndex =
    q.correctIndex ?? q.correct_index ?? q.answerIndex ?? q.rightIndex;
  if (typeof rawIndex === "number" && rawIndex >= 0 && rawIndex < 4) {
    return letters.at(rawIndex) ?? null;
  }

  return null;
}

function getAnswerBadgeStyle(letter: string): {
  bg: string;
  border: string;
  text: string;
} {
  switch (letter) {
    case "A":
      return { bg: "#EF4444", border: "#FCA5A5", text: "#FFFFFF" };
    case "B":
      return { bg: "#3B82F6", border: "#93C5FD", text: "#FFFFFF" };
    case "C":
      return { bg: "#EAB308", border: "#FDE047", text: "#111827" };
    case "D":
      return { bg: "#10B981", border: "#6EE7B7", text: "#FFFFFF" };
    default:
      return { bg: "#1F2937", border: "#9CA3AF", text: "#FFFFFF" };
  }
}

export default function AdminConsolePage() {
  const supabase = getSupabaseBrowserClient();

  const [games, setGames] = useState<CatalogGame[]>(() =>
    ensureJusteChiffreCatalog(INITIAL_GAMES)
  );
  const [selectedGameId, setSelectedGameId] = useState<string>(
    () => ensureJusteChiffreCatalog(INITIAL_GAMES)[0]?.id ?? ""
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string>(() =>
    generateSessionCode()
  );
  const [status, setStatus] = useState<SessionStatus>("lobby");
  const [questionIndex, setQuestionIndex] = useState<number>(-1);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(
    null
  );
  const [pausedRemainingSeconds, setPausedRemainingSeconds] = useState<
    number | null
  >(null);
  const [seriesNumber, setSeriesNumber] = useState<number>(1);
  const [seriesSeed, setSeriesSeed] = useState<string>(() =>
    generateSeriesSeed()
  );
  const [seriesQuestions, setSeriesQuestions] = useState<unknown[]>(() =>
    pickSeriesQuestions(QUESTIONS, QUESTIONS_PER_GAME, "init")
  );
  const [justeChiffreQuestions, setJusteChiffreQuestions] = useState<
    JusteChiffreQuestion[]
  >(() =>
    pickSeriesQuestions(
      JUSTE_CHIFFRE_QUESTIONS,
      QUESTIONS_PER_GAME,
      "jc-init"
    )
  );
  const [remoteCurrentQuestion, setRemoteCurrentQuestion] =
    useState<unknown>(null);
  const [showQrOnTv, setShowQrOnTv] = useState<boolean>(true);
  const [showPlayerAnswersInAdmin, setShowPlayerAnswersInAdmin] =
    useState<boolean>(true);
  const [playerAnswersById, setPlayerAnswersById] = useState<
    Record<string, string>
  >({});
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isSavingSession, setIsSavingSession] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const [players, setPlayers] = useState<PlayerSession[]>([]);
  const [scores, setScores] = useState<PlayerScore[]>([]);

  const [isEditLayoutMode, setIsEditLayoutMode] = useState<boolean>(false);
  const [layout, setLayout] = useState<Record<WidgetId, GridWidgetItem>>(() =>
    loadSavedGridLayout()
  );
  const [activeDragId, setActiveDragId] = useState<WidgetId | null>(null);
  const [activeResizeId, setActiveResizeId] = useState<WidgetId | null>(null);

  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    saveGridLayout(layout);
  }, [layout]);

  const handleResetLayout = () => {
    setLayout(DEFAULT_GRID_LAYOUT);
    saveGridLayout(DEFAULT_GRID_LAYOUT);
  };

  const startMoveWidget = (
    e: React.PointerEvent<HTMLElement>,
    widgetId: WidgetId
  ) => {
    if (!isEditLayoutMode) return;
    e.preventDefault();
    e.stopPropagation();

    const container = gridContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const colWidth = rect.width / GRID_COLUMNS;
    const rowStep = ROW_UNIT_PX + ROW_GAP_PX;
    const startX = e.clientX;
    const startY = e.clientY;
    const initialItem = layoutRef.current[widgetId];

    setActiveDragId(widgetId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaCols = Math.round((moveEvent.clientX - startX) / colWidth);
      const deltaRows = Math.round((moveEvent.clientY - startY) / rowStep);

      setLayout((prev) => {
        const current = prev[widgetId];
        return {
          ...prev,
          [widgetId]: clampLayoutItem({
            ...current,
            col: initialItem.col + deltaCols,
            row: initialItem.row + deltaRows,
          }),
        };
      });
    };

    const onPointerUp = () => {
      setActiveDragId(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const startResizeWidget = (
    e: React.PointerEvent<HTMLButtonElement>,
    widgetId: WidgetId
  ) => {
    if (!isEditLayoutMode) return;
    e.preventDefault();
    e.stopPropagation();

    const container = gridContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const colWidth = rect.width / GRID_COLUMNS;
    const rowStep = ROW_UNIT_PX + ROW_GAP_PX;
    const startX = e.clientX;
    const startY = e.clientY;
    const initialItem = layoutRef.current[widgetId];

    setActiveResizeId(widgetId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaCols = Math.round((moveEvent.clientX - startX) / colWidth);
      const deltaRows = Math.round((moveEvent.clientY - startY) / rowStep);

      setLayout((prev) => {
        const current = prev[widgetId];
        return {
          ...prev,
          [widgetId]: clampLayoutItem({
            ...current,
            colSpan: initialItem.colSpan + deltaCols,
            rowSpan: initialItem.rowSpan + deltaRows,
          }),
        };
      });
    };

    const onPointerUp = () => {
      setActiveResizeId(null);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  };

  const selectedGame =
    games.find((g) => g.id === selectedGameId) ?? games[0];

  const isGameLaunched = status === "playing" || status === "paused";
  const isJusteChiffre = isJusteChiffreGame(selectedGame);
  const activeDurationSeconds = isJusteChiffre
    ? JUSTE_CHIFFRE_DURATION_SECONDS
    : QUESTION_DURATION_SECONDS;

  const sourcePoolLength = isJusteChiffre
    ? JUSTE_CHIFFRE_QUESTIONS.length
    : QUESTIONS.length;
  const totalQuestions = Math.min(QUESTIONS_PER_GAME, sourcePoolLength);
  const isEndOfSeries =
    totalQuestions > 0 && questionIndex >= totalQuestions - 1;

  const currentJusteChiffreQuestion: JusteChiffreQuestion | null =
    isJusteChiffre && questionIndex >= 0
      ? justeChiffreQuestions.at(
          Math.min(
            questionIndex,
            Math.max(0, justeChiffreQuestions.length - 1)
          )
        ) ?? null
      : null;

  const currentQuestionObj =
    !isJusteChiffre && questionIndex >= 0
      ? remoteCurrentQuestion ??
        seriesQuestions.at(
          Math.min(questionIndex, Math.max(0, seriesQuestions.length - 1))
        ) ??
        null
      : null;

  const currentCorrectLetter = isJusteChiffre
    ? null
    : resolveQuestionCorrectLetter(currentQuestionObj);
  const currentCorrectBadgeStyle = currentCorrectLetter
    ? getAnswerBadgeStyle(currentCorrectLetter)
    : null;

  const resolveValidGameUuid = (
    candidateGame?: CatalogGame | null
  ): string | null => {
    if (isUuid(candidateGame?.id)) {
      return candidateGame.id;
    }
    const matchedBySlug = candidateGame?.slug
      ? games.find((g) => g.slug === candidateGame.slug && isUuid(g.id))
      : undefined;
    if (matchedBySlug?.id) {
      return matchedBySlug.id;
    }
    const firstDbUuidGame = games.find((g) => isUuid(g.id));
    return firstDbUuidGame?.id ?? null;
  };

  const extractAnswersFromGameState = (
    rawGameState: unknown,
    isNumericMode: boolean
  ): Record<string, string> => {
    if (!rawGameState || typeof rawGameState !== "object") return {};
    const stateObj = rawGameState as {
      answers?: unknown;
      estimates?: unknown;
      guesses?: unknown;
    };
    const sourceMap = isNumericMode
      ? stateObj.estimates ?? stateObj.guesses ?? stateObj.answers
      : stateObj.answers;

    if (!sourceMap || typeof sourceMap !== "object") return {};

    const nextAnswers: Record<string, string> = {};
    for (const [playerId, rawVal] of Object.entries(
      sourceMap as Record<string, unknown>
    )) {
      if (isNumericMode) {
        const guessNum = formatNumericGuess(rawVal);
        if (guessNum !== null) {
          nextAnswers[playerId] = String(guessNum);
        }
      } else {
        const formatted = formatPlayerAnswer(rawVal);
        if (formatted) {
          nextAnswers[playerId] = formatted;
        }
      }
    }
    return nextAnswers;
  };

  const syncQuestionStateFromGameState = (rawGameState: unknown) => {
    if (!rawGameState || typeof rawGameState !== "object") return;
    const stateObj = rawGameState as {
      currentQuestion?: unknown;
      activeQuestion?: unknown;
      seriesQuestions?: unknown;
      shuffledQuestions?: unknown;
      questions?: unknown;
    };

    if (stateObj.currentQuestion) {
      setRemoteCurrentQuestion(stateObj.currentQuestion);
    } else if (stateObj.activeQuestion) {
      setRemoteCurrentQuestion(stateObj.activeQuestion);
    }

    const listCandidate = Array.isArray(stateObj.seriesQuestions)
      ? stateObj.seriesQuestions
      : Array.isArray(stateObj.shuffledQuestions)
      ? stateObj.shuffledQuestions
      : Array.isArray(stateObj.questions)
      ? stateObj.questions
      : null;

    if (listCandidate && listCandidate.length > 0) {
      setSeriesQuestions(listCandidate);
    }
  };

  const loadPlayersAndScoresForSession = async (targetSessionId: string) => {
    if (!supabase || !isUuid(targetSessionId)) return;

    const [
      { data: playersData, error: pErr },
      { data: scoresData, error: sErr },
      { data: sessionRow },
    ] = await Promise.all([
      supabase
        .from("session_players")
        .select("*")
        .eq("session_id", targetSessionId)
        .order("id", { ascending: true }),
      supabase
        .from("player_scores")
        .select("*")
        .eq("session_id", targetSessionId),
      supabase
        .from("game_sessions")
        .select("game_state")
        .eq("id", targetSessionId)
        .maybeSingle(),
    ]);

    if (pErr) {
      setDbError(`Lecture joueurs impossible : ${pErr.message}`);
    } else if (playersData) {
      setPlayers(playersData as PlayerSession[]);
    }

    if (sErr) {
      setDbError(`Lecture scores impossible : ${sErr.message}`);
    } else if (scoresData) {
      setScores(scoresData as PlayerScore[]);
    }

    if (sessionRow) {
      const gs = (sessionRow as { game_state?: unknown }).game_state;
      setPlayerAnswersById(extractAnswersFromGameState(gs, isJusteChiffre));
      syncQuestionStateFromGameState(gs);
    }
  };

  useEffect(() => {
    if (!supabase || !sessionId || !isUuid(sessionId)) return;

    let active = true;

    const refresh = async () => {
      if (!active) return;
      await loadPlayersAndScoresForSession(sessionId);
    };

    void refresh();

    const channel = supabase
      .channel(`admin-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_players",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_scores",
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          void refresh();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          if (!active) return;
          const nextRow = payload.new as { game_state?: unknown } | undefined;
          if (nextRow && "game_state" in nextRow) {
            setPlayerAnswersById(
              extractAnswersFromGameState(nextRow.game_state, isJusteChiffre)
            );
            syncQuestionStateFromGameState(nextRow.game_state);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, sessionId, isJusteChiffre]);

  const syncSessionToDb = async (params: {
    id?: string | null;
    code: string;
    game?: CatalogGame | null;
    nextStatus: SessionStatus;
    qrVisible: boolean;
    nextQuestionIndex?: number;
    nextQuestionStartedAt?: string | null;
    nextPausedRemaining?: number | null;
    nextSeriesNumber?: number;
    nextSeriesSeed?: string;
    nextSeriesQuestions?: unknown[];
    nextJusteChiffreQuestions?: JusteChiffreQuestion[];
    resetAnswers?: boolean;
  }) => {
    if (!supabase) {
      setDbError(
        "Client Supabase non initialisé (vérifier NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)."
      );
      return;
    }

    const activeTargetGame = params.game ?? selectedGame;
    const validGameUuid = resolveValidGameUuid(activeTargetGame);
    if (!validGameUuid) {
      setDbError(
        "Aucun UUID de jeu trouvé dans la table 'games' Supabase. Vérifie les permissions SELECT sur 'games'."
      );
      return;
    }

    const effectiveQuestionIndex =
      params.nextQuestionIndex !== undefined
        ? params.nextQuestionIndex
        : questionIndex;

    const effectiveStartedAt =
      params.nextQuestionStartedAt !== undefined
        ? params.nextQuestionStartedAt
        : questionStartedAt;

    const effectivePausedRemaining =
      params.nextPausedRemaining !== undefined
        ? params.nextPausedRemaining
        : pausedRemainingSeconds;

    const effectiveSeries =
      params.nextSeriesNumber !== undefined
        ? params.nextSeriesNumber
        : seriesNumber;

    const effectiveSeed =
      params.nextSeriesSeed !== undefined ? params.nextSeriesSeed : seriesSeed;

    const effectiveSeriesQuestions =
      params.nextSeriesQuestions !== undefined
        ? params.nextSeriesQuestions
        : seriesQuestions;

    const effectiveJcQuestions =
      params.nextJusteChiffreQuestions !== undefined
        ? params.nextJusteChiffreQuestions
        : justeChiffreQuestions;

    const numericGameMode = isJusteChiffreGame(activeTargetGame);
    const isQuizGame =
      !numericGameMode &&
      (validGameUuid === GRAND_QUIZ_UUID ||
        activeTargetGame?.slug === "quiz" ||
        activeTargetGame?.title?.toLowerCase().includes("quiz"));

    const hasQuestionStarted = effectiveQuestionIndex >= 0;
    const isPaused = params.nextStatus === "paused";
    const shouldResetAnswers = params.resetAnswers !== false;

    const activeQuestionForState = hasQuestionStarted
      ? numericGameMode
        ? effectiveJcQuestions.at(
            Math.min(
              effectiveQuestionIndex,
              Math.max(0, effectiveJcQuestions.length - 1)
            )
          ) ?? null
        : effectiveSeriesQuestions.at(
            Math.min(
              effectiveQuestionIndex,
              Math.max(0, effectiveSeriesQuestions.length - 1)
            )
          ) ?? null
      : null;

    setRemoteCurrentQuestion(activeQuestionForState);

    setIsSavingSession(true);
    setDbError(null);
    try {
      const basePayload: Record<string, unknown> = {
        code: params.code,
        game_id: validGameUuid,
        status: params.nextStatus,
        show_qr: params.qrVisible,
      };

      if (numericGameMode) {
        basePayload.game_state = {
          mode: "juste-chiffre",
          minValue: JUSTE_CHIFFRE_MIN,
          maxValue: JUSTE_CHIFFRE_MAX,
          questionStarted: hasQuestionStarted,
          roundTriggered: hasQuestionStarted,
          questionIndex: effectiveQuestionIndex,
          currentQuestionIndex: effectiveQuestionIndex,
          currentQuestion: activeQuestionForState,
          targetNumber:
            (activeQuestionForState as JusteChiffreQuestion | null)?.answer ??
            null,
          questionStartedAt: hasQuestionStarted ? effectiveStartedAt : null,
          durationSeconds: JUSTE_CHIFFRE_DURATION_SECONDS,
          isPaused,
          pausedRemainingSeconds: isPaused ? effectivePausedRemaining : null,
          seriesNumber: effectiveSeries,
          seriesSeed: effectiveSeed,
          questions: effectiveJcQuestions,
          revealed: false,
          ...(shouldResetAnswers ? { estimates: {}, answers: {} } : {}),
        };
      } else if (isQuizGame) {
        basePayload.game_state = {
          questionStarted: hasQuestionStarted,
          roundTriggered: hasQuestionStarted,
          questionIndex: effectiveQuestionIndex,
          currentQuestionIndex: effectiveQuestionIndex,
          currentQuestion: activeQuestionForState,
          questionStartedAt: hasQuestionStarted ? effectiveStartedAt : null,
          durationSeconds: QUESTION_DURATION_SECONDS,
          isPaused,
          pausedRemainingSeconds: isPaused ? effectivePausedRemaining : null,
          seriesNumber: effectiveSeries,
          seriesSeed: effectiveSeed,
          seriesQuestions: effectiveSeriesQuestions,
          questions: effectiveSeriesQuestions,
          revealed: false,
          ...(shouldResetAnswers ? { answers: {} } : {}),
        };
      }

      if (params.id) {
        const { error } = await supabase
          .from("game_sessions")
          .update(basePayload)
          .eq("id", params.id);

        if (error) {
          const { error: fallbackError } = await supabase
            .from("game_sessions")
            .update({
              code: params.code,
              game_id: validGameUuid,
              status: params.nextStatus,
              show_qr: params.qrVisible,
            })
            .eq("id", params.id);

          if (fallbackError) {
            setDbError(
              `Mise à jour session impossible : ${fallbackError.message}`
            );
          }
        }
      } else {
        let insertResult = await supabase
          .from("game_sessions")
          .insert(basePayload)
          .select()
          .single<GameSession>();

        if (insertResult.error) {
          insertResult = await supabase
            .from("game_sessions")
            .insert({
              code: params.code,
              game_id: validGameUuid,
              status: params.nextStatus,
              show_qr: params.qrVisible,
            })
            .select()
            .single<GameSession>();
        }

        if (insertResult.error) {
          setDbError(
            `Création session impossible : ${insertResult.error.message}`
          );
        } else if (insertResult.data?.id) {
          setSessionId(insertResult.data.id);
          setPlayers([]);
          setScores([]);
          setPlayerAnswersById({});
          await loadPlayersAndScoresForSession(insertResult.data.id);
        }
      }
    } finally {
      setIsSavingSession(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!supabase) {
        if (!cancelled) {
          setDbError("Client Supabase non initialisé.");
        }
        return;
      }

      const { data: dbGames, error: gamesError } = await supabase
        .from("games")
        .select("id, slug, title, tagline, min_players, max_players, is_active")
        .order("title", { ascending: true });

      if (gamesError && !cancelled) {
        setDbError(`Lecture table 'games' impossible : ${gamesError.message}`);
      }

      const rows = Array.isArray(dbGames) ? (dbGames as CatalogGame[]) : [];
      const validRows = rows.filter((g) => isUuid(g.id));
      const mergedGames = ensureJusteChiffreCatalog(
        validRows.length > 0 ? validRows : INITIAL_GAMES
      );

      if (!cancelled) {
        setGames(mergedGames);
        const initialGame = mergedGames[0];
        const initialSeed = generateSeriesSeed();
        const initialPicked = pickSeriesQuestions(
          QUESTIONS,
          QUESTIONS_PER_GAME,
          `${sessionCode}-1-${initialSeed}`
        );
        const initialJcPicked = pickSeriesQuestions(
          JUSTE_CHIFFRE_QUESTIONS,
          QUESTIONS_PER_GAME,
          `${sessionCode}-jc-1-${initialSeed}`
        );
        if (initialGame) {
          setSelectedGameId(initialGame.id);
          setSeriesSeed(initialSeed);
          setSeriesQuestions(initialPicked);
          setJusteChiffreQuestions(initialJcPicked);
          await syncSessionToDb({
            id: null,
            code: sessionCode,
            game: initialGame,
            nextStatus: status,
            qrVisible: showQrOnTv,
            nextQuestionIndex: -1,
            nextQuestionStartedAt: null,
            nextPausedRemaining: null,
            nextSeriesNumber: 1,
            nextSeriesSeed: initialSeed,
            nextSeriesQuestions: initialPicked,
            nextJusteChiffreQuestions: initialJcPicked,
          });
        }
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateNewSession = async () => {
    const newCode = generateSessionCode();
    const newSeed = generateSeriesSeed();
    const newPicked = pickSeriesQuestions(
      QUESTIONS,
      QUESTIONS_PER_GAME,
      `${newCode}-1-${newSeed}`
    );
    const newJcPicked = pickSeriesQuestions(
      JUSTE_CHIFFRE_QUESTIONS,
      QUESTIONS_PER_GAME,
      `${newCode}-jc-1-${newSeed}`
    );
    const previousSessionId = sessionId;

    if (supabase && previousSessionId && isUuid(previousSessionId)) {
      await supabase
        .from("game_sessions")
        .update({
          status: "lobby",
          game_state: {
            nextSessionCode: newCode,
            replacedByCode: newCode,
          },
        })
        .eq("id", previousSessionId);
    }

    setSessionId(null);
    setSessionCode(newCode);
    setStatus("lobby");
    setQuestionIndex(-1);
    setQuestionStartedAt(null);
    setPausedRemainingSeconds(null);
    setSeriesNumber(1);
    setSeriesSeed(newSeed);
    setSeriesQuestions(newPicked);
    setJusteChiffreQuestions(newJcPicked);
    setRemoteCurrentQuestion(null);
    setPlayers([]);
    setScores([]);
    setPlayerAnswersById({});

    await syncSessionToDb({
      id: null,
      code: newCode,
      game: selectedGame,
      nextStatus: "lobby",
      qrVisible: showQrOnTv,
      nextQuestionIndex: -1,
      nextQuestionStartedAt: null,
      nextPausedRemaining: null,
      nextSeriesNumber: 1,
      nextSeriesSeed: newSeed,
      nextSeriesQuestions: newPicked,
      nextJusteChiffreQuestions: newJcPicked,
    });
  };

  const handleStatusChange = async (nextStatus: SessionStatus) => {
    const nowMs = Date.now();
    const shouldResetQuestions =
      nextStatus === "lobby" || nextStatus === "finished";

    if (shouldResetQuestions) {
      setStatus(nextStatus);
      setQuestionIndex(-1);
      setQuestionStartedAt(null);
      setPausedRemainingSeconds(null);
      setRemoteCurrentQuestion(null);
      setPlayerAnswersById({});

      await syncSessionToDb({
        id: sessionId,
        code: sessionCode,
        game: selectedGame,
        nextStatus,
        qrVisible: showQrOnTv,
        nextQuestionIndex: -1,
        nextQuestionStartedAt: null,
        nextPausedRemaining: null,
        resetAnswers: true,
      });
      return;
    }

    if (nextStatus === "paused") {
      let remaining = activeDurationSeconds;
      if (questionStartedAt) {
        const startMs = Date.parse(questionStartedAt);
        if (!Number.isNaN(startMs)) {
          const elapsed = Math.max(0, (nowMs - startMs) / 1000);
          remaining = Math.max(0, activeDurationSeconds - elapsed);
        }
      }
      setStatus("paused");
      setPausedRemainingSeconds(remaining);

      await syncSessionToDb({
        id: sessionId,
        code: sessionCode,
        game: selectedGame,
        nextStatus: "paused",
        qrVisible: showQrOnTv,
        nextPausedRemaining: remaining,
        resetAnswers: false,
      });
      return;
    }

    if (nextStatus === "playing") {
      let resumedStartedAt = questionStartedAt;
      if (
        status === "paused" &&
        pausedRemainingSeconds !== null &&
        questionIndex >= 0
      ) {
        const elapsedBeforePause =
          activeDurationSeconds - pausedRemainingSeconds;
        resumedStartedAt = new Date(
          nowMs - elapsedBeforePause * 1000
        ).toISOString();
      }

      setStatus("playing");
      setPausedRemainingSeconds(null);
      setQuestionStartedAt(resumedStartedAt);

      await syncSessionToDb({
        id: sessionId,
        code: sessionCode,
        game: selectedGame,
        nextStatus: "playing",
        qrVisible: showQrOnTv,
        nextQuestionStartedAt: resumedStartedAt,
        nextPausedRemaining: null,
        resetAnswers: false,
      });
    }
  };

  const handleRestartNewSeries = async () => {
    const nextSeries = seriesNumber + 1;
    const nextSeed = generateSeriesSeed();
    const nextPicked = pickSeriesQuestions(
      QUESTIONS,
      QUESTIONS_PER_GAME,
      `${sessionCode}-${nextSeries}-${nextSeed}`
    );
    const nextJcPicked = pickSeriesQuestions(
      JUSTE_CHIFFRE_QUESTIONS,
      QUESTIONS_PER_GAME,
      `${sessionCode}-jc-${nextSeries}-${nextSeed}`
    );
    const startedIso = new Date().toISOString();

    setStatus("playing");
    setSeriesNumber(nextSeries);
    setSeriesSeed(nextSeed);
    setSeriesQuestions(nextPicked);
    setJusteChiffreQuestions(nextJcPicked);
    setQuestionIndex(0);
    setQuestionStartedAt(startedIso);
    setPausedRemainingSeconds(null);
    setPlayerAnswersById({});

    await syncSessionToDb({
      id: sessionId,
      code: sessionCode,
      game: selectedGame,
      nextStatus: "playing",
      qrVisible: showQrOnTv,
      nextQuestionIndex: 0,
      nextQuestionStartedAt: startedIso,
      nextPausedRemaining: null,
      nextSeriesNumber: nextSeries,
      nextSeriesSeed: nextSeed,
      nextSeriesQuestions: nextPicked,
      nextJusteChiffreQuestions: nextJcPicked,
      resetAnswers: true,
    });
  };

  const handleNextQuestion = async () => {
    const nextIdx =
      questionIndex < 0
        ? 0
        : Math.min(questionIndex + 1, Math.max(0, totalQuestions - 1));
    const startedIso = new Date().toISOString();

    setStatus("playing");
    setQuestionIndex(nextIdx);
    setQuestionStartedAt(startedIso);
    setPausedRemainingSeconds(null);
    setPlayerAnswersById({});

    await syncSessionToDb({
      id: sessionId,
      code: sessionCode,
      game: selectedGame,
      nextStatus: "playing",
      qrVisible: showQrOnTv,
      nextQuestionIndex: nextIdx,
      nextQuestionStartedAt: startedIso,
      nextPausedRemaining: null,
      resetAnswers: true,
    });
  };

  const handleToggleQr = async () => {
    const nextQr = !showQrOnTv;
    setShowQrOnTv(nextQr);
    await syncSessionToDb({
      id: sessionId,
      code: sessionCode,
      game: selectedGame,
      nextStatus: status,
      qrVisible: nextQr,
      resetAnswers: false,
    });
  };

  const handleSelectGame = async (gameId: string) => {
    if (isGameLaunched) return;
    const targetGame = games.find((g) => g.id === gameId) ?? null;
    const nextSeed = generateSeriesSeed();
    const nextJcPicked = pickSeriesQuestions(
      JUSTE_CHIFFRE_QUESTIONS,
      QUESTIONS_PER_GAME,
      `${sessionCode}-jc-${seriesNumber}-${nextSeed}`
    );

    setSelectedGameId(gameId);
    setSeriesSeed(nextSeed);
    setJusteChiffreQuestions(nextJcPicked);
    setQuestionIndex(-1);
    setQuestionStartedAt(null);
    setPausedRemainingSeconds(null);
    setRemoteCurrentQuestion(null);
    setPlayerAnswersById({});
    await syncSessionToDb({
      id: sessionId,
      code: sessionCode,
      game: targetGame,
      nextStatus: status,
      qrVisible: showQrOnTv,
      nextQuestionIndex: -1,
      nextQuestionStartedAt: null,
      nextPausedRemaining: null,
      nextSeriesSeed: nextSeed,
      nextJusteChiffreQuestions: nextJcPicked,
      resetAnswers: true,
    });
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(sessionCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleToggleGameActive = (gameId: string) => {
    setGames((prev) =>
      prev.map((g) =>
        g.id === gameId ? { ...g, is_active: !g.is_active } : g
      )
    );
  };

  const getPlayerScoreValue = (playerId: string): number => {
    const match = scores.find((s) => s.player_id === playerId);
    if (!match) return 0;
    const record = match as unknown as {
      total_score?: number;
      score?: number;
    };
    return record.total_score ?? record.score ?? 0;
  };

  const handleKickPlayer = async (playerId: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    setScores((prev) => prev.filter((s) => s.player_id !== playerId));
    setPlayerAnswersById((prev) => {
      const copy = { ...prev };
      delete copy[playerId];
      return copy;
    });

    if (!supabase || !sessionId || !isUuid(sessionId)) return;

    const [{ error: sErr }, { error: pErr }] = await Promise.all([
      supabase
        .from("player_scores")
        .delete()
        .eq("session_id", sessionId)
        .eq("player_id", playerId),
      supabase
        .from("session_players")
        .delete()
        .eq("session_id", sessionId)
        .eq("id", playerId),
    ]);

    if (sErr || pErr) {
      setDbError(
        `Exclusion joueur impossible : ${sErr?.message ?? pErr?.message}`
      );
    }
  };

  const handleAdjustScore = async (playerId: string, delta: number) => {
    const current = getPlayerScoreValue(playerId);
    const nextScore = Math.max(0, current + delta);

    setScores((prev) => {
      const exists = prev.some((s) => s.player_id === playerId);
      if (exists) {
        return prev.map((s) =>
          s.player_id === playerId
            ? ({ ...s, total_score: nextScore, score: nextScore } as PlayerScore)
            : s
        );
      }
      return [
        ...prev,
        {
          id: `score-${playerId}`,
          session_id: sessionId ?? sessionCode,
          player_id: playerId,
          total_score: nextScore,
          score: nextScore,
        } as unknown as PlayerScore,
      ];
    });

    if (!supabase || !sessionId || !isUuid(sessionId)) return;

    const targetPlayer = players.find((p) => p.id === playerId);
    const { error } = await supabase.from("player_scores").upsert(
      {
        session_id: sessionId,
        player_id: playerId,
        nickname: targetPlayer?.nickname ?? "Joueur",
        avatar_id:
          (targetPlayer as unknown as { avatar_id?: string })?.avatar_id ??
          "gamepad",
        total_score: nextScore,
      },
      { onConflict: "session_id,player_id" }
    );

    if (error) {
      setDbError(`Mise à jour score impossible : ${error.message}`);
    }
  };

  const maxGridRowEnd = Math.max(
    10,
    ...Object.values(layout).map((item) => item.row + item.rowSpan)
  );
  const gridHeightPx = maxGridRowEnd * (ROW_UNIT_PX + ROW_GAP_PX);

  const renderWidgetFrame = (
    widgetId: WidgetId,
    title: string,
    icon: React.ReactNode,
    children: React.ReactNode,
    headerRight?: React.ReactNode
  ) => {
    const item = layout[widgetId];
    const leftPercent = (item.col / GRID_COLUMNS) * 100;
    const widthPercent = (item.colSpan / GRID_COLUMNS) * 100;
    const topPx = item.row * (ROW_UNIT_PX + ROW_GAP_PX);
    const heightPx =
      item.rowSpan * ROW_UNIT_PX + (item.rowSpan - 1) * ROW_GAP_PX;
    const isMoving = activeDragId === widgetId;
    const isResizing = activeResizeId === widgetId;

    return (
      <div
        key={widgetId}
        style={{
          left: `calc(${leftPercent}% + 8px)`,
          width: `calc(${widthPercent}% - 16px)`,
          top: `${topPx}px`,
          height: `${heightPx}px`,
        }}
        className={`absolute rounded-3xl bg-white/5 border transition-shadow flex flex-col overflow-hidden ${
          isEditLayoutMode
            ? "border-amber-400/60 shadow-xl"
            : "border-white/10"
        } ${isMoving || isResizing ? "z-30 ring-2 ring-amber-400" : "z-10"}`}
      >
        <div
          onPointerDown={(e) => startMoveWidget(e, widgetId)}
          style={{ touchAction: isEditLayoutMode ? "none" : "auto" }}
          className={`flex items-center justify-between gap-2 px-5 pt-4 pb-2 shrink-0 select-none ${
            isEditLayoutMode
              ? "cursor-grab active:cursor-grabbing bg-amber-400/10 border-b border-amber-400/20"
              : ""
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isEditLayoutMode && (
              <GripVertical className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span className="flex items-center gap-2 text-lg font-semibold truncate">
              {icon}
              <span className="truncate">{title}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerRight}
            {isEditLayoutMode && (
              <span className="text-[11px] font-mono text-amber-300 shrink-0">
                {item.colSpan}c × {item.rowSpan}r
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-2 flex flex-col justify-between">
          {children}
        </div>

        {isEditLayoutMode && (
          <button
            type="button"
            aria-label={`Redimensionner ${title}`}
            onPointerDown={(e) => startResizeWidget(e, widgetId)}
            style={{ touchAction: "none" }}
            className="absolute bottom-1.5 right-1.5 z-40 h-7 w-7 rounded-xl bg-amber-400 text-black flex items-center justify-center shadow-lg cursor-nwse-resize hover:bg-amber-300"
            title="Glisser pour redimensionner"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-neutral-400">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Console Animateur</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight mt-1">
              Contrôle de Partie
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEditLayoutMode((prev) => !prev)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border text-sm font-semibold transition ${
                isEditLayoutMode
                  ? "bg-amber-400 text-black border-amber-300"
                  : "bg-white/5 hover:bg-white/10 text-neutral-200 border-white/15"
              }`}
            >
              {isEditLayoutMode ? (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Grille déverrouillée</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Éditer la grille</span>
                </>
              )}
            </button>

            {isEditLayoutMode && (
              <button
                type="button"
                onClick={handleResetLayout}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-neutral-200 border border-white/15 text-sm font-semibold transition"
                title="Revenir à la disposition par défaut"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Réinitialiser</span>
              </button>
            )}

            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5">
              <span className="text-xs text-neutral-400 uppercase tracking-wider">
                Code Salle
              </span>
              <span className="font-mono text-2xl font-bold tracking-widest text-amber-400">
                {sessionCode}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition"
                title="Copier le code"
              >
                {copiedCode ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4 text-neutral-300" />
                )}
              </button>
            </div>

            <Link
              href={`/tv/${sessionCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-semibold text-sm transition"
            >
              <span>Ouvrir TV</span>
              <ExternalLink className="w-4 h-4" />
            </Link>

            <button
              type="button"
              onClick={handleCreateNewSession}
              disabled={isSavingSession}
              className="px-4 py-2.5 rounded-2xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 disabled:opacity-60 transition"
            >
              {isSavingSession ? "Enregistrement..." : "Nouvelle Salle"}
            </button>
          </div>
        </header>

        {dbError ? (
          <div className="flex items-center gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{dbError}</span>
          </div>
        ) : null}

        <div
          ref={gridContainerRef}
          style={{ height: `${gridHeightPx}px` }}
          className={`relative w-full rounded-3xl ${
            isEditLayoutMode
              ? "bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:24px_24px]"
              : ""
          }`}
        >
          {renderWidgetFrame(
            "controls",
            "État de la partie",
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />,
            <div className="flex-1 flex flex-col justify-between gap-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-neutral-400">
                  Jeu actif :{" "}
                  <span className="text-white font-medium">
                    {selectedGame?.title ?? "Aucun"}
                  </span>
                  {questionIndex >= 0
                    ? ` • Question ${questionIndex + 1} / ${totalQuestions}`
                    : ""}
                </p>

                <div className="flex items-center gap-2 shrink-0">
                  {showPlayerAnswersInAdmin &&
                    isJusteChiffre &&
                    currentJusteChiffreQuestion && (
                      <span
                        className="px-2.5 py-1 rounded-full border border-amber-300/60 bg-amber-400/20 text-amber-200 font-mono text-xs font-black flex items-center gap-1 shrink-0"
                        title="Cible à approcher (1 à 1000)"
                      >
                        <Target className="w-3.5 h-3.5 text-amber-300" />
                        <span>
                          {currentJusteChiffreQuestion.answer}
                          {currentJusteChiffreQuestion.unit
                            ? ` ${currentJusteChiffreQuestion.unit}`
                            : ""}
                        </span>
                      </span>
                    )}

                  {showPlayerAnswersInAdmin &&
                    !isJusteChiffre &&
                    currentCorrectLetter &&
                    currentCorrectBadgeStyle && (
                      <span
                        style={{
                          backgroundColor: currentCorrectBadgeStyle.bg,
                          borderColor: currentCorrectBadgeStyle.border,
                          color: currentCorrectBadgeStyle.text,
                        }}
                        className="h-7 w-7 rounded-full border-2 flex items-center justify-center font-mono text-xs font-black shadow-md shrink-0"
                        title={`Bonne réponse : ${currentCorrectLetter}`}
                      >
                        {currentCorrectLetter}
                      </span>
                    )}

                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider shrink-0 ${
                      status === "playing"
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : status === "paused"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : status === "finished"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    }`}
                  >
                    {status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Colonne gauche : Pause puis Terminer */}
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    disabled={!isGameLaunched || status !== "playing"}
                    onClick={() => void handleStatusChange("paused")}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 border border-amber-500/30 font-semibold transition"
                  >
                    <Pause className="w-4 h-4" />
                    <span>Pause</span>
                  </button>

                  <button
                    type="button"
                    disabled={!isGameLaunched}
                    onClick={() => void handleStatusChange("finished")}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-rose-300 border border-rose-500/30 font-semibold transition"
                  >
                    <Square className="w-4 h-4" />
                    <span>Terminer</span>
                  </button>
                </div>

                {/* Colonne droite : Lancer / Relancer puis Question suivante */}
                <div className="flex flex-col gap-3">
                  {isEndOfSeries ? (
                    <button
                      type="button"
                      onClick={() => void handleRestartNewSeries()}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-sky-500 hover:bg-sky-400 text-black font-semibold transition"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Relancer</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={status === "playing"}
                      onClick={() => void handleStatusChange("playing")}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/25 disabled:text-emerald-200/50 disabled:cursor-not-allowed text-black font-semibold transition"
                    >
                      <Play className="w-4 h-4" />
                      <span>Lancer</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={!isGameLaunched || isEndOfSeries}
                    onClick={() => void handleNextQuestion()}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition"
                  >
                    <SkipForward className="w-4 h-4" />
                    <span className="truncate">
                      {questionIndex < 0
                        ? "Lancer Question 1"
                        : "Question suivante"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {renderWidgetFrame(
            "qr",
            "Écran TV",
            <Eye className="w-5 h-5 text-sky-400 shrink-0" />,
            <div className="flex-1 flex flex-col justify-between gap-4">
              <p className="text-sm text-neutral-400">
                QR code de connexion sur la télévision.
              </p>

              <button
                type="button"
                onClick={() => void handleToggleQr()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/20 font-medium transition"
              >
                {showQrOnTv ? (
                  <>
                    <EyeOff className="w-4 h-4 text-amber-400" />
                    <span>Masquer QR</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 text-emerald-400" />
                    <span>Afficher QR</span>
                  </>
                )}
              </button>
            </div>
          )}

          {renderWidgetFrame(
            "catalog",
            "Catalogue des jeux",
            <Gamepad2 className="w-5 h-5 text-purple-400 shrink-0" />,
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                {isGameLaunched ? (
                  <span className="text-xs text-amber-300/90">
                    Partie en cours : sélection verrouillée
                  </span>
                ) : (
                  <span />
                )}
                <span className="text-xs text-neutral-400">
                  {games.filter((g) => g.is_active).length} / {games.length}{" "}
                  actifs
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {games.map((game) => {
                  const isSelected = game.id === selectedGame?.id;
                  const isDisabledByGameRunning = isGameLaunched && !isSelected;

                  return (
                    <div
                      key={game.id}
                      onClick={() => {
                        if (!isDisabledByGameRunning) {
                          void handleSelectGame(game.id);
                        }
                      }}
                      aria-disabled={isDisabledByGameRunning}
                      className={`rounded-2xl p-4 border transition flex flex-col justify-between gap-4 ${
                        isSelected
                          ? "bg-white/15 border-white/40 cursor-pointer"
                          : isDisabledByGameRunning
                          ? "bg-black/20 border-white/5 opacity-45 cursor-not-allowed pointer-events-none"
                          : "bg-black/30 border-white/10 hover:border-white/25 cursor-pointer"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-semibold text-base">
                            {game.title}
                          </h3>
                          <button
                            type="button"
                            disabled={isDisabledByGameRunning}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isDisabledByGameRunning) {
                                handleToggleGameActive(game.id);
                              }
                            }}
                            className="text-xs flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {game.is_active ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-300">Actif</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5 text-neutral-500" />
                                <span className="text-neutral-400">
                                  Inactif
                                </span>
                              </>
                            )}
                          </button>
                        </div>
                        {game.tagline && (
                          <p className="text-xs text-neutral-400 mt-1">
                            {game.tagline}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-neutral-400 pt-2 border-t border-white/5">
                        <span>
                          {game.min_players}–{game.max_players ?? "∞"} joueurs
                        </span>
                        {isSelected && (
                          <span className="text-amber-400 font-medium">
                            Sélectionné
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {renderWidgetFrame(
            "players",
            `Joueurs (${players.length})`,
            <Users className="w-5 h-5 text-emerald-400 shrink-0" />,
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="flex items-center justify-between gap-2 text-xs text-neutral-400 border-b border-white/10 pb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPlayerAnswersInAdmin((prev) => !prev)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 font-medium transition"
                >
                  {showPlayerAnswersInAdmin ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>Masquer réponses</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Afficher réponses</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Scores</span>
                </div>
              </div>

              {players.length === 0 ? (
                <p className="text-sm text-neutral-400 py-8 text-center my-auto">
                  Aucun joueur connecté pour le moment.
                </p>
              ) : (
                <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                  {players.map((player) => {
                    const color = getUniquePlayerColor(player.id, players);
                    const answerValue = playerAnswersById[player.id] ?? null;
                    const badgeStyle =
                      !isJusteChiffre && answerValue
                        ? getAnswerBadgeStyle(answerValue)
                        : null;

                    return (
                      <div
                        key={player.id}
                        style={{
                          backgroundColor: color.bgHex,
                          borderColor: color.borderHex,
                          color: color.textHex,
                        }}
                        className="p-3.5 rounded-2xl border-2 space-y-3 shadow-md"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              style={{ backgroundColor: color.badgeBgHex }}
                              className="text-xl flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                            >
                              {player.avatar ?? "🎮"}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold truncate flex items-center gap-1.5">
                                <span className="truncate">
                                  {player.nickname}
                                </span>
                                {player.is_host && (
                                  <span
                                    style={{ backgroundColor: color.badgeBgHex }}
                                    className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
                                  >
                                    Hôte
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] opacity-90 block">
                                {player.is_connected
                                  ? "Connecté"
                                  : "Déconnecté"}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {showPlayerAnswersInAdmin &&
                              isJusteChiffre &&
                              answerValue && (
                                <span
                                  className="px-2.5 h-8 rounded-full border-2 border-white bg-black/55 text-white flex items-center justify-center font-mono text-xs font-black shadow-md shrink-0"
                                  title={`Estimation : ${answerValue}`}
                                >
                                  {answerValue}
                                </span>
                              )}

                            {showPlayerAnswersInAdmin &&
                              !isJusteChiffre &&
                              answerValue &&
                              badgeStyle && (
                                <span
                                  style={{
                                    backgroundColor: badgeStyle.bg,
                                    borderColor: badgeStyle.border,
                                    color: badgeStyle.text,
                                  }}
                                  className="h-8 w-8 rounded-full border-2 flex items-center justify-center font-mono text-sm font-black shadow-md shrink-0"
                                  title={`Réponse : ${answerValue}`}
                                >
                                  {answerValue}
                                </span>
                              )}

                            {!player.is_host && (
                              <button
                                type="button"
                                onClick={() => void handleKickPlayer(player.id)}
                                className="px-2.5 py-1.5 rounded-xl bg-black/35 hover:bg-black/55 text-xs font-bold transition shrink-0"
                              >
                                Exclure
                              </button>
                            )}
                          </div>
                        </div>

                        <div
                          style={{ backgroundColor: color.badgeBgHex }}
                          className="flex items-center justify-between rounded-xl px-3 py-1.5"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              void handleAdjustScore(player.id, -1)
                            }
                            className="px-3 py-1 rounded-lg bg-black/30 hover:bg-black/50 text-sm font-black transition"
                          >
                            -1
                          </button>
                          <span
                            style={{ color: color.scoreHex }}
                            className="font-mono text-lg font-black text-center"
                          >
                            {getPlayerScoreValue(player.id)} pts
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleAdjustScore(player.id, 1)}
                            className="px-3 py-1 rounded-lg bg-black/30 hover:bg-black/50 text-sm font-black transition"
                          >
                            +1
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
