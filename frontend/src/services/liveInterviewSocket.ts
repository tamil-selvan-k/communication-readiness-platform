import { API_ORIGIN } from './api';

/** Who transcribes speech: the server (Deepgram) or the browser (Web Speech API). */
export type LiveSttMode = 'deepgram' | 'client';

export type LiveInterviewMessage =
  | {
      type: 'ready';
      stt: LiveSttMode;
      // Server's current position — used to resync after a reconnect
      turnNumber?: number;
      totalTurns?: number | null;
      questionText?: string;
      difficulty?: 'EASY' | 'MEDIUM' | 'ADVANCED';
    }
  | { type: 'transcript_interim'; text: string; isFinal?: boolean }
  | { type: 'status'; stage: 'evaluating' | 'generating' | string }
  | { type: 'text_chunk'; text?: string; chunk?: string }
  | { type: 'text_end' }
  | { type: 'turn_result'; data: LiveTurnResult }
  | { type: 'clarification'; question: string; message?: string }
  | { type: 'tts_audio'; audio: string; mimeType?: string; isFinal?: boolean }
  | { type: 'interview_complete'; report: LiveInterviewReport }
  | { type: 'terminated'; reason: string }
  | { type: 'proctor_warning'; tabSwitches: number; limit: number }
  // fatal: the server ended the connection on purpose (auth, finished interview) — don't reconnect
  | { type: 'error'; message: string; fatal?: boolean };

/** Measured in the browser while the candidate answers. */
export interface DeliveryMetrics {
  durationSec?: number;        // first → last voice activity
  pauseCount?: number;         // silences of 2.5 s or more mid-answer
  longestPauseSec?: number;
  responseLatencySec?: number; // listening started → first words
}

/** Final diagnostic report built by the server (superset of DiagnosticReport). */
export interface LiveInterviewReport {
  id: string;
  date: string;
  sessionType: 'MOCK_INTERVIEW';
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  fluencyScore: number;
  clarityScore: number;
  averageWpm: number;
  paceLabel: string | null;
  totalFillerWords: number;
  fillerWordBreakdown: Record<string, number>;
  skillBreakdown: { skill: string; score: number; status: 'STRONG' | 'MODERATE' | 'NEEDS_WORK'; recommendation: string }[];
  actionableNextSteps: string[];
  tabSwitches: number;
  isFlagged: boolean;
  questionsAnswered: number;
  questionsPlanned: number;
  longPauses: number;
  averageResponseLatencySec: number | null;
  scoringMethod: string[];
  turns: {
    turn: number;
    question: string;
    difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
    technicalScore: number;
    communicationScore: number;
    overallScore: number;
    wpm: number | null;
    fillerCount: number;
    pauseCount: number | null;
    feedback: string;
    pointsCovered: string[];
    pointsMissed: string[];
  }[];
}

export interface LiveTurnResult {
  transcript: string;
  technicalScore: number;
  communicationScore: number;
  overallScore: number;
  feedback: string;
  strengths: string;
  weaknesses: string;
  nextDifficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  nextQuestionText: string;
  conversationalResponse: string;
  fluencyScore?: number;
  clarityScore?: number;
  // paceWpm is null when the answer was too short to measure
  audioMetrics?: {
    paceWpm?: number | null;
    paceLabel?: string | null;
    fillerCount?: number;
    pauseCount?: number | null;
    responseLatencySec?: number | null;
  };
  // Rubric for this question: which key points the answer covered
  keyPoints?: { covered: string[]; missed: string[] };
  // Present on the last turn: the interview is complete
  report?: LiveInterviewReport;
}

export interface AudioStartMetadata {
  questionText: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  turnNumber: number;
  studentId: string;
  domain?: string;
}

type MessageHandler = (message: LiveInterviewMessage) => void;

/**
 * Browser-side transport for the real-time interview gateway. Audio is sent as
 * binary MediaRecorder chunks; all transcripts, LLM tokens, results, and TTS
 * audio come back on this same socket.
 */
const CONNECT_TIMEOUT_MS = 10_000;
const CONNECT_ERROR = 'Unable to connect to the live interview service.';

export class LiveInterviewSocket {
  private socket: WebSocket | null = null;
  private readonly handlers = new Set<MessageHandler>();
  private readonly sessionId: string;
  private readonly token: string | null;
  private closedByClient = false;
  sttMode: LiveSttMode = 'deepgram';

  constructor(sessionId: string, token: string | null) {
    this.sessionId = sessionId;
    this.token = token;
  }

  /**
   * Resolves once the server has authenticated the student and sent `ready`
   * (not merely when the TCP socket opens), so auth or ownership failures
   * surface here with the server's reason.
   */
  connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve();

    // Explicit URL, else the backend origin (separately hosted frontend), else same origin
    const configuredUrl = import.meta.env.VITE_INTERVIEW_WS_URL as string | undefined;
    const origin = configuredUrl
      ? configuredUrl.replace(/\/$/, '')
      : API_ORIGIN
        ? `${API_ORIGIN.replace(/^http/, 'ws')}/api/interview/ws`
        : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/interview/ws`;
    const url = new URL(`${origin}/${encodeURIComponent(this.sessionId)}`);
    if (this.token) url.searchParams.set('token', this.token);

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url.toString());
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      this.closedByClient = false;
      let settled = false;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(message));
      };
      const timer = setTimeout(() => {
        fail(CONNECT_ERROR);
        socket.close();
      }, CONNECT_TIMEOUT_MS);

      socket.onerror = () => fail(CONNECT_ERROR);
      socket.onclose = (event) => {
        if (this.socket === socket) this.socket = null;
        if (!settled) {
          fail(event.reason || CONNECT_ERROR);
        } else if (!this.closedByClient && event.code !== 1000) {
          this.dispatch({
            type: 'error',
            message: event.reason || 'The connection to the live interview service was lost.',
            fatal: event.code >= 4000 && event.code < 5000,
          });
        }
      };
      socket.onmessage = ({ data }) => {
        if (typeof data !== 'string') return;
        let message: LiveInterviewMessage;
        try {
          message = JSON.parse(data) as LiveInterviewMessage;
        } catch {
          // Ignore malformed messages so one bad server frame cannot end an interview.
          return;
        }
        if (message.type === 'ready' && !settled) {
          settled = true;
          clearTimeout(timer);
          this.sttMode = message.stt;
          resolve();
        }
        this.dispatch(message);
      };
    });
  }

  private dispatch(message: LiveInterviewMessage): void {
    this.handlers.forEach(handler => handler(message));
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  startTurn(metadata: AudioStartMetadata): void {
    this.send({ type: 'audio_start', metadata });
  }

  sendAudio(chunk: Blob): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(chunk);
  }

  /**
   * `transcript` is required when sttMode is 'client' (browser speech recognition).
   * `delivery` carries what the browser measured while the candidate spoke; the server
   * derives WPM, pause and response-time scores from it.
   */
  endTurn(transcript?: string, delivery: DeliveryMetrics = {}): void {
    this.send({ type: 'audio_end', ...(transcript ? { transcript } : {}), ...delivery });
  }

  /** Time is up: score the answer in progress (if any) and finish the interview. */
  finish(transcript?: string, delivery: DeliveryMetrics = {}): void {
    this.send({ type: 'finish', ...(transcript ? { transcript } : {}), ...delivery });
  }

  /** Proctoring telemetry; the server disqualifies at the tab-switch limit. */
  sendProctorEvent(event: 'TAB_SWITCH' | 'FULLSCREEN_EXIT'): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.send({ type: 'proctor_event', event });
  }

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.closedByClient = true;
    this.socket?.close(1000, 'Interview ended');
    this.socket = null;
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error('Live interview connection is not open.');
    }
    this.socket.send(JSON.stringify(payload));
  }
}
