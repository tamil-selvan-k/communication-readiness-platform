import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { VoiceOrb } from './VoiceOrb';
import { QuestionTurn } from '../../types';
import { 
  AudioRecorder, 
  transcribeWithWhisper, 
  hasWhisperApiKey,
  getOpenAITTSVoice,
  synthesizeSpeechWithOpenAI,
  OpenAITTSVoice
} from '../../services/whisperService';
import { WhisperSettingsModal } from '../common/WhisperSettingsModal';
import {
  LiveInterviewSocket,
  type DeliveryMetrics,
  type LiveInterviewMessage,
  type LiveInterviewReport,
} from '../../services/liveInterviewSocket';
import { 
  ShieldAlert, 
  Mic, 
  MicOff, 
  ChevronRight, 
  AlertTriangle, 
  MessageSquare, 
  X,
  Radio,
  RotateCcw,
  Zap,
  Clock,
  Play,
  Volume2,
  VolumeX,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Lock,
  Ban,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export const MockInterviewRoom: React.FC = () => {
  const { 
    student,
    interviewState,
    applyLiveInterviewTurn,
    completeAssessmentAwaitingEvaluation,
    confirmAbandonSession,
    activeAssignment,
    setActiveView,
    isAssignmentDisqualified,
    terminateDisqualifiedSession,
    forfeitSessionCoin,
    isEvaluationPending,
    latestReport,
    dismissNewReportNotification,
    requestExitAssessment
  } = useApp();

  const [hasSessionStarted, setHasSessionStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState<{ current: number; max: number } | null>(null);
  const [isSpeakingQuestion, setIsSpeakingQuestion] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.2);
  const [currentSpeechText, setCurrentSpeechText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [autoConversationMode] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false;
  });
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number>(1500); // 25 minutes limit
  const [showWhisperModal, setShowWhisperModal] = useState(false);
  const [hasWhisperKey, setHasWhisperKey] = useState(() => hasWhisperApiKey());
  const [selectedVoice, setSelectedVoice] = useState<OpenAITTSVoice>(() => getOpenAITTSVoice());
  const [isTranscribingWithWhisper, setIsTranscribingWithWhisper] = useState(false);
  const [showQuestionText, setShowQuestionText] = useState(false);
  const audioRecorderRef = useRef<AudioRecorder>(new AudioRecorder());
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const liveSocketRef = useRef<LiveInterviewSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamedResponseRef = useRef('');
  // True when the server has no speech-to-text, so the browser transcribes
  const clientSttRef = useRef(false);

  useEffect(() => {
    if (!hasSessionStarted || isSubmitting || timeUpRef.current) return;
    const timer = setInterval(() => {
      setSessionTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasSessionStarted, isSubmitting]);

  const formatSessionTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const prevTabSwitchesRef = useRef(interviewState.tabSwitches);
  const reportedTabSwitchesRef = useRef(interviewState.tabSwitches);
  useEffect(() => {
    while (reportedTabSwitchesRef.current < interviewState.tabSwitches) {
      reportedTabSwitchesRef.current += 1;
      liveSocketRef.current?.sendProctorEvent('TAB_SWITCH');
    }
  }, [interviewState.tabSwitches]);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);
  const restartTimeoutRef = useRef<any>(null);

  const isRecordingRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const autoModeRef = useRef(true);
  const latestSpeechRef = useRef<string>("");
  const accumulatedSpeechRef = useRef<string>("");
  const currentSessionFinalRef = useRef<string>("");
  const isVoiceDetectedRef = useRef(false);
  const hasSpokenRef = useRef(false);
  const lastVoiceActiveTimeRef = useRef<number>(0);
  // First voice activity of the current answer; with lastVoiceActiveTimeRef it gives
  // the time actually spent speaking, which the server turns into WPM.
  const speechStartTimeRef = useRef<number | null>(null);
  // When the mic opened for this answer, and long silences while answering
  // (blueprint §4.4: hesitations and dead air are part of fluency)
  const listenStartTimeRef = useRef<number>(0);
  const pauseCountRef = useRef(0);
  const longestPauseMsRef = useRef(0);
  // Report the server sends with the final turn (or when time runs out)
  const finalReportRef = useRef<LiveInterviewReport | null>(null);
  const timeUpRef = useRef(false);
  const reconnectingRef = useRef(false);
  const voiceDurationMsRef = useRef<number>(0);
  const isLiveTranscribedRef = useRef<boolean>(false);
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  const currentQuestionIdRef = useRef<string>("");

  const currentQ = interviewState.questions[interviewState.turnIndex] || interviewState.questions[0];
  const questionNumber = interviewState.turnIndex + 1;
  const totalQuestions = interviewState.totalTurns ?? interviewState.questions.length;
  const showWarning = interviewState.tabSwitches > 0 && !warningDismissed;

  const playServerAudio = (encodedAudio: string, mimeType = 'audio/mpeg') => {
    try {
      const bytes = Uint8Array.from(atob(encodedAudio), char => char.charCodeAt(0));
      const source = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      const audio = new Audio(source);
      activeAudioRef.current?.pause();
      activeAudioRef.current = audio;
      audio.onplay = () => {
        isSpeakingRef.current = true;
        setIsSpeakingQuestion(true);
      };
      audio.onended = () => {
        URL.revokeObjectURL(source);
        isSpeakingRef.current = false;
        setIsSpeakingQuestion(false);
      };
      void audio.play();
    } catch (error) {
      console.warn('[MockInterview] Invalid TTS audio frame:', error);
    }
  };

  // Silence of at least this long between bursts of speech counts as a long pause
  const LONG_PAUSE_MS = 2500;

  const deliveryMetrics = (): DeliveryMetrics => {
    const start = speechStartTimeRef.current;
    const end = lastVoiceActiveTimeRef.current;
    if (!start || end <= start) return {};
    return {
      durationSec: Math.round((end - start) / 100) / 10 + 0.3,
      pauseCount: pauseCountRef.current,
      longestPauseSec: Math.round(longestPauseMsRef.current / 100) / 10,
      responseLatencySec: listenStartTimeRef.current
        ? Math.max(0, Math.round((start - listenStartTimeRef.current) / 100) / 10)
        : undefined,
    };
  };

  // Socket dropped mid-interview (network blip, laptop sleep, proxy timeout):
  // retry with exponential backoff, pausing when the device goes offline.
  // The server keeps the full interview state so nothing is lost on reconnect.
  const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]; // ~30 s total

  const waitForOnline = (): Promise<void> =>
    new Promise(resolve => {
      if (navigator.onLine) { resolve(); return; }
      const handler = () => { window.removeEventListener('online', handler); resolve(); };
      window.addEventListener('online', handler);
    });

  const reconnectLive = async () => {
    const socket = liveSocketRef.current;
    if (!socket || reconnectingRef.current || interviewState.isCompletedAwaitingEvaluation) return;
    reconnectingRef.current = true;
    stopRecordingTurn();
    isSubmittingRef.current = false;
    setIsSubmitting(false);
    setMicPermissionError(null);

    for (let i = 0; i < RECONNECT_DELAYS.length; i++) {
      setReconnectAttempt({ current: i + 1, max: RECONNECT_DELAYS.length });
      // Hold until the browser reports network is back
      await waitForOnline();
      await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAYS[i]));
      // Don't keep retrying if the interview ended while we were waiting
      if (interviewState.isCompletedAwaitingEvaluation || timeUpRef.current) break;
      try {
        await socket.connect();
        reconnectingRef.current = false;
        setReconnectAttempt(null);
        return;
      } catch {
        // next delay
      }
    }

    // All retries exhausted — surface the error and let the user try manually
    reconnectingRef.current = false;
    setReconnectAttempt(null);
    setMicPermissionError('Could not reconnect to the interview service. Tap "Reconnect" to try again.');
  };

  const handleManualReconnect = () => {
    setMicPermissionError(null);
    reconnectingRef.current = false;
    reconnectLive();
  };

  const handleLiveMessage = (message: LiveInterviewMessage) => {
    switch (message.type) {
      case 'ready':
        // Only seen after a reconnect: ask the server's current question again and listen
        if (message.questionText) {
          speakQuestion(`Let's continue. ${message.questionText}`);
        }
        break;
      case 'transcript_interim':
        setCurrentSpeechText(message.text);
        latestSpeechRef.current = message.text;
        break;
      case 'status':
        if (message.stage === 'evaluating' || message.stage === 'generating') {
          // Deepgram has already detected the end of the utterance. Stop the
          // browser recorder so speech during evaluation cannot leak into it.
          stopRecordingTurn();
          isSubmittingRef.current = true;
          setIsSubmitting(true);
        }
        break;
      case 'text_chunk':
        streamedResponseRef.current += message.text || message.chunk || '';
        break;
      case 'text_end':
        streamedResponseRef.current = '';
        break;
      case 'tts_audio':
        playServerAudio(message.audio, message.mimeType);
        break;
      case 'clarification':
        // The turn was not consumed: re-ask, then listen again (auto mode).
        streamedResponseRef.current = '';
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setCurrentSpeechText('');
        latestSpeechRef.current = '';
        hasSpokenRef.current = false;
        speakQuestion(`${message.message ? `${message.message} ` : ''}${message.question}`);
        break;
      case 'turn_result': {
        const result = message.data;
        if (result.report) finalReportRef.current = result.report;
        applyLiveInterviewTurn({
          transcript: result.transcript,
          technicalScore: result.technicalScore,
          communicationScore: result.communicationScore,
          feedback: result.feedback,
          strengths: result.strengths,
          weaknesses: result.weaknesses,
          nextDifficulty: result.nextDifficulty,
          nextQuestionText: result.nextQuestionText,
          paceWpm: result.audioMetrics?.paceWpm ?? undefined,
          fillerCount: result.audioMetrics?.fillerCount,
          keyPointsMissed: result.keyPoints?.missed,
        });
        if (!result.nextQuestionText) {
          liveSocketRef.current?.close();
          liveSocketRef.current = null;
        }
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        setCurrentSpeechText('');
        latestSpeechRef.current = '';
        break;
      }
      case 'interview_complete':
        // Time ran out after at least one answer: the server scored what was answered
        finalReportRef.current = message.report;
        liveSocketRef.current?.close();
        liveSocketRef.current = null;
        completeAssessmentAwaitingEvaluation('MOCK_INTERVIEW', message.report);
        break;
      case 'terminated':
        liveSocketRef.current?.close();
        liveSocketRef.current = null;
        if (message.reason.startsWith('Disqualified')) {
          terminateDisqualifiedSession(activeAssignment?.id);
        } else {
          setMicPermissionError(message.reason);
          setTimeout(() => confirmAbandonSession(), 4000);
        }
        break;
      case 'proctor_warning':
        // The on-screen tab-switch banner already reflects the count
        break;
      case 'error':
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        if (liveSocketRef.current && !liveSocketRef.current.isOpen && !timeUpRef.current && !message.fatal) {
          reconnectLive();
          break;
        }
        setMicPermissionError(message.message);
        break;
    }
  };
  // The socket keeps one subscription for the whole session; route it through a
  // ref so each message is handled with the latest render's state.
  const liveHandlerRef = useRef(handleLiveMessage);
  useEffect(() => {
    liveHandlerRef.current = handleLiveMessage;
  });

  // The live gateway finishes the interview on its last turn_result; build the
  // report and settle the coin exactly as the end of a regular session does.
  useEffect(() => {
    if (interviewState.isActive && interviewState.isCompletedAwaitingEvaluation) {
      completeAssessmentAwaitingEvaluation('MOCK_INTERVIEW', finalReportRef.current);
    }
  }, [interviewState.isActive, interviewState.isCompletedAwaitingEvaluation]);

  useEffect(() => {
    autoModeRef.current = autoConversationMode;
  }, [autoConversationMode]);

  const requestFullscreen = async () => {
    try {
      if (typeof document !== 'undefined' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Denied outside a user gesture — the next click (Start / Replay) requests it again
    }
  };

  // Immediate Fullscreen trigger on mount + listen for fullscreenchange
  useEffect(() => {
    if ((navigator as any).userActivation?.isActive !== false) requestFullscreen();

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Guard against re-attending disqualified assignment
  useEffect(() => {
    if (activeAssignment && isAssignmentDisqualified(activeAssignment.id)) {
      alert("Access Revoked: You have been permanently disqualified from this interview due to exceeding the proctoring limit (4 tab switches). You cannot attend this interview again.");
      setActiveView('DASHBOARD');
    }
  }, [activeAssignment?.id]);

  // Track new tab switches so warning banner always pops up on every switch
  useEffect(() => {
    if (interviewState.tabSwitches > prevTabSwitchesRef.current) {
      setWarningDismissed(false);
      prevTabSwitchesRef.current = interviewState.tabSwitches;
    }
  }, [interviewState.tabSwitches]);

  // Immediately stop resources and exit fullscreen if 4 switches, disqualified, or completed
  useEffect(() => {
    if (interviewState.tabSwitches >= 4 || interviewState.isDisqualified || interviewState.isCompletedAwaitingEvaluation) {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      teardownAudioHardware();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, [interviewState.tabSwitches, interviewState.isDisqualified, interviewState.isCompletedAwaitingEvaluation]);

  useEffect(() => {
    return () => {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      teardownAudioHardware();
      liveSocketRef.current?.close();
      liveSocketRef.current = null;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
    };
  }, []);

  const teardownAudioHardware = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsVoiceDetected(false);
    isVoiceDetectedRef.current = false;
    setAudioVolume(0.15);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    setSilenceCountdown(null);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    audioRecorderRef.current.clear();
  };

  const stopRecordingTurn = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsVoiceDetected(false);
    isVoiceDetectedRef.current = false;
    setAudioVolume(0.15);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    setSilenceCountdown(null);

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }
  };

  // Time is up: score the answer in progress (if any) and let the server finish the
  // interview. It replies with the final turn_result, interview_complete or terminated.
  const handleTimeUp = () => {
    if (timeUpRef.current) return;
    timeUpRef.current = true;
    const transcript = clientSttRef.current ? (latestSpeechRef.current || currentSpeechText).trim() : undefined;
    const delivery = deliveryMetrics();
    stopRecordingTurn();
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      liveSocketRef.current?.finish(transcript, delivery);
    } catch {
      setMicPermissionError('Time is up, but the interview service could not be reached to score your answers.');
    }
  };

  const handleExecuteSubmit = async (textToSubmit?: string) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      // Closes the current answer; the server evaluates it and replies with
      // turn_result asynchronously. With browser STT the transcript goes along.
      const transcript = clientSttRef.current
        ? (textToSubmit || latestSpeechRef.current || currentSpeechText).trim()
        : undefined;
      const delivery = deliveryMetrics();
      const recorder = mediaRecorderRef.current;
      const hadActiveRecorder = recorder?.state === 'recording';
      if (hadActiveRecorder) {
        recorder.addEventListener('stop', () => liveSocketRef.current?.endTurn(transcript, delivery), { once: true });
      }
      stopRecordingTurn();
      if (!hadActiveRecorder) liveSocketRef.current?.endTurn(transcript, delivery);
    } catch {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
      if (liveSocketRef.current && !liveSocketRef.current.isOpen) reconnectLive();
    }
  };

  const handleSpeechInput = (transcript: string) => {
    latestSpeechRef.current = transcript;
    setCurrentSpeechText(transcript);
    hasSpokenRef.current = true;
    isLiveTranscribedRef.current = true;
  };

  const initMicrophoneStream = async (): Promise<boolean> => {
    try {
      if (!mediaStreamRef.current || !mediaStreamRef.current.active) {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            } 
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        mediaStreamRef.current = stream;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;

          if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
          }

          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          const checkVolume = () => {
            if (!mediaStreamRef.current) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const normalized = Math.min(1.0, Math.max(0.18, avg / 120));
            setAudioVolume(normalized);

            const voiceActive = avg > 16;
            setIsVoiceDetected(voiceActive);
            isVoiceDetectedRef.current = voiceActive;

            const now = Date.now();

            if (voiceActive) {
              hasSpokenRef.current = true;
              if (isRecordingRef.current && speechStartTimeRef.current === null) {
                speechStartTimeRef.current = now;
              } else if (isRecordingRef.current && lastVoiceActiveTimeRef.current > 0) {
                const silenceMs = now - lastVoiceActiveTimeRef.current;
                if (silenceMs >= LONG_PAUSE_MS) {
                  pauseCountRef.current += 1;
                  longestPauseMsRef.current = Math.max(longestPauseMsRef.current, silenceMs);
                }
              }
              lastVoiceActiveTimeRef.current = now;
              voiceDurationMsRef.current += 16;

              // Clear silence timer if user speaks again (same threshold as voice detection)
              if (avg > 16 && silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = null;
              }
            } else {
              // Voice is quiet right now
              // If candidate has spoken in this turn, session is recording, not submitting, and autoMode is on
              if (
                hasSpokenRef.current && 
                isRecordingRef.current && 
                !isSubmittingRef.current && 
                autoModeRef.current
              ) {
                const silenceDuration = now - lastVoiceActiveTimeRef.current;

                // When silence reaches 1500ms after speaking, allow 5s quiet window before auto-submission
                if (silenceDuration >= 1500 && !silenceTimerRef.current) {
                  silenceTimerRef.current = setTimeout(() => {
                    silenceTimerRef.current = null;
                    handleExecuteSubmit(latestSpeechRef.current || currentSpeechText);
                  }, 5000);
                }
              }
            }

            animationFrameRef.current = requestAnimationFrame(checkVolume);
          };
          checkVolume();
        }
      } else if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      return true;
    } catch (err: any) {
      console.warn("Audio meter setup warning:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicPermissionError("Microphone permission was denied. Please allow microphone access in your browser address bar.");
      }
      return false;
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn("Web Speech API not supported in this browser.");
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;

      // Optimize recognition dialect for higher technical precision
      let preferredLang = 'en-IN';
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const isIndia = tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('Asia/Colombo');
        if (isIndia) {
          preferredLang = 'en-IN';
        } else {
          const navLang = navigator.language || 'en-US';
          preferredLang = navLang.startsWith('en') ? navLang : 'en-US';
        }
      } catch {
        preferredLang = navigator.language || 'en-IN';
      }
      recognition.lang = preferredLang;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isRecordingRef.current = true;
        setIsRecording(true);
      };

      recognition.onresult = (event: any) => {
        let sessionFinal = '';
        let sessionInterim = '';

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            sessionFinal += text.trim() + ' ';
          } else {
            sessionInterim += text.trim() + ' ';
          }
        }

        currentSessionFinalRef.current = sessionFinal.trim();

        const combined = [
          accumulatedSpeechRef.current,
          sessionFinal.trim(),
          sessionInterim.trim()
        ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

        if (combined) {
          handleSpeechInput(combined);
          lastVoiceActiveTimeRef.current = Date.now();
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('SpeechRec error:', event.error);
        }
        if (event.error === 'not-allowed') {
          setMicPermissionError("Microphone permission was denied. Please allow microphone access in your browser address bar.");
        }
      };

      recognition.onend = () => {
        if (currentSessionFinalRef.current) {
          const prev = accumulatedSpeechRef.current.trim();
          const next = currentSessionFinalRef.current.trim();
          accumulatedSpeechRef.current = prev ? `${prev} ${next}` : next;
          currentSessionFinalRef.current = '';
        }

        if (isRecordingRef.current && !isSubmittingRef.current && !isSpeakingRef.current) {
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (isRecordingRef.current && !isSubmittingRef.current && !isSpeakingRef.current) {
              startSpeechRecognition();
            }
          }, 100);
        }
      };

      try {
        recognition.start();
      } catch (e) {
        console.warn("SpeechRec start error:", e);
      }
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("SpeechRec exception:", e);
    }
  };

  const startRecording = async () => {
    if (isSubmittingRef.current || timeUpRef.current) return;
    setMicPermissionError(null);
    speechStartTimeRef.current = null;
    lastVoiceActiveTimeRef.current = 0;
    listenStartTimeRef.current = Date.now();
    pauseCountRef.current = 0;
    longestPauseMsRef.current = 0;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeakingQuestion(false);

    await initMicrophoneStream();

    if (!mediaStreamRef.current || !liveSocketRef.current) {
      setMicPermissionError('Live interview audio is not connected. Please restart the session.');
      return;
    }

    liveSocketRef.current.startTurn({
      questionText: currentQ.questionText,
      difficulty: currentQ.difficulty,
      turnNumber: questionNumber,
      studentId: student.id,
      domain: student.track || student.programName,
    });
    isRecordingRef.current = true;
    setIsRecording(true);

    if (clientSttRef.current) {
      // The server has no speech-to-text configured: transcribe in the browser
      // and send the transcript with audio_end. No audio is streamed.
      latestSpeechRef.current = '';
      accumulatedSpeechRef.current = '';
      currentSessionFinalRef.current = '';
      startSpeechRecognition();
      return;
    }

    // Server-side STT (Deepgram): stream the original audio; transcripts come
    // back over the socket, so browser STT stays off.
    const recorder = new MediaRecorder(mediaStreamRef.current);
    recorder.ondataavailable = event => {
      if (event.data.size > 0) liveSocketRef.current?.sendAudio(event.data);
    };
    recorder.onerror = () => setMicPermissionError('The browser could not capture microphone audio.');
    recorder.start(250);
    mediaRecorderRef.current = recorder;
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
      return () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const speakWithBrowserTTS = (questionText: string, onDone: () => void) => {
    if (!('speechSynthesis' in window)) {
      onDone();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      setTimeout(() => {
        if (!isSpeakingRef.current) return;
        try {
          const utterance = new SpeechSynthesisUtterance(questionText);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;

          const voices = window.speechSynthesis.getVoices();
          const naturalVoice = voices.find(v => 
            v.lang.startsWith('en') && 
            (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('David') || v.name.includes('English') || v.name.includes('Jenny'))
          );
          if (naturalVoice) utterance.voice = naturalVoice;

          let hasEnded = false;
          const handleEnd = () => {
            if (hasEnded) return;
            hasEnded = true;
            onDone();
          };

          utterance.onstart = () => {
            isSpeakingRef.current = true;
            setIsSpeakingQuestion(true);
            setAudioVolume(0.35);
          };

          utterance.onend = handleEnd;
          utterance.onerror = (e: any) => {
            // 'interrupted' / 'canceled' are expected when speech is skipped or replaced
            if (e.error === 'interrupted' || e.error === 'canceled') {
              return;
            }
            console.warn('SpeechSynthesis error:', e.error);
            handleEnd();
          };

          const safetyTimeout = Math.min(14000, Math.max(5000, questionText.length * 80));
          setTimeout(() => {
            if (isSpeakingRef.current && !hasEnded) {
              handleEnd();
            }
          }, safetyTimeout);

          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn("Inner SpeechSynthesis speak exception:", e);
          onDone();
        }
      }, 70);
    } catch (e) {
      console.warn("SpeechSynthesis exception:", e);
      onDone();
    }
  };

  const speakQuestion = async (questionText: string) => {
    if (!questionText) return;

    stopRecordingTurn();

    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }

    if (isMuted) {
      setIsSpeakingQuestion(false);
      isSpeakingRef.current = false;
      startRecording();
      return;
    }

    isSpeakingRef.current = true;
    setIsSpeakingQuestion(true);

    const handleFinishedSpeaking = () => {
      isSpeakingRef.current = false;
      setIsSpeakingQuestion(false);
      setAudioVolume(0.15);
      if (autoModeRef.current) {
        setTimeout(() => {
          startRecording();
        }, 150);
      }
    };

    // Fallback: Browser Web Speech API
    speakWithBrowserTTS(questionText, handleFinishedSpeaking);
  };

  useEffect(() => {
    if (!hasSessionStarted) return;
    if (!currentQ?.id || !currentQ?.questionText) return;
    if (currentQuestionIdRef.current === currentQ.id) return;

    currentQuestionIdRef.current = currentQ.id;
    setCurrentSpeechText("");
    latestSpeechRef.current = "";
    accumulatedSpeechRef.current = "";
    hasSpokenRef.current = false;
    isLiveTranscribedRef.current = false;
    voiceDurationMsRef.current = 0;
    lastVoiceActiveTimeRef.current = 0;
    setSilenceCountdown(null);
    setShowQuestionText(false);

    if (isMuted) {
      startRecording();
    } else {
      speakQuestion(currentQ.questionText);
    }
  }, [currentQ?.id, currentQ?.questionText, hasSessionStarted, isMuted]);

  const handleStartSession = async () => {
    // The session API call (startInterview) navigates here before its response arrives.
    // If sessionId is still undefined the WebSocket URL would be empty, causing the
    // "Unable to connect" error. Show a friendly message so the user just retries.
    if (!interviewState.sessionId) {
      setMicPermissionError('Session is still setting up — please wait a moment and try again.');
      return;
    }
    setIsStartingSession(true);
    try {
      requestFullscreen();
      setDrawerOpen(false);
      await initMicrophoneStream();
      const socket = new LiveInterviewSocket(interviewState.sessionId, localStorage.getItem('auth_token'));
      await socket.connect();
      liveSocketRef.current = socket;
      clientSttRef.current = socket.sttMode === 'client';
      const browserCanTranscribe = Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
      if (clientSttRef.current && !browserCanTranscribe) {
        socket.close();
        liveSocketRef.current = null;
        throw new Error('This browser cannot transcribe speech. Please open the interview in Google Chrome or Microsoft Edge.');
      }
      socket.onMessage(message => liveHandlerRef.current(message));
      setHasSessionStarted(true);
    } catch (error) {
      console.error('[MockInterview] Live connection error:', error);
      setMicPermissionError(error instanceof Error ? error.message : 'Unable to connect to the live interview service.');
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleSkipQuestionAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeakingQuestion(false);
    startRecording();
  };

  const handleReplayQuestion = () => {
    speakQuestion(currentQ.questionText);
  };

  const orbState = isSpeakingQuestion 
    ? 'speaking' 
    : isRecording 
      ? 'listening' 
      : isSubmitting 
        ? 'thinking' 
        : 'idle';

  if (interviewState.isCompletedAwaitingEvaluation) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6 animate-in fade-in duration-300">
        
        {/* Top Header Exit */}
        <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-neutral-200/90 shadow-2xs">
          <button
            onClick={() => setActiveView('DASHBOARD')}
            className="flex items-center space-x-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors bg-neutral-50 hover:bg-neutral-100 px-3.5 py-2 rounded-xl border border-neutral-200 shadow-2xs group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-neutral-500 group-hover:-translate-x-0.5 transition-transform" />
            <span>Return to Dashboard</span>
          </button>

          <span className="px-3 py-1 text-xs font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Assessment Completed</span>
          </span>
        </div>

        {/* Main Completion Card */}
        <div className="bg-white border border-neutral-200 rounded-3xl p-8 sm:p-12 shadow-xs text-center space-y-6">
          
          {/* Animated Check & Sparkle Icon */}
          <div className="relative inline-flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-neutral-900 text-amber-300 flex items-center justify-center shadow-xs animate-bounce">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>

          {/* Primary User Notice */}
          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              Thanks for completing the assessment!
            </h2>
            <p className="text-sm font-medium text-neutral-600">
              You'll receive the results shortly.
            </p>
          </div>

          {/* Live Evaluation Telemetry Status Card */}
          <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl p-5 max-w-xl mx-auto text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-mono">
                Evaluation Details
              </span>
              {isEvaluationPending ? (
                <span className="inline-flex items-center space-x-1.5 text-xs font-mono font-semibold text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  <span>AI Calculating Feedback...</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 text-xs font-mono font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Results Ready</span>
                </span>
              )}
            </div>

            <p className="text-xs text-neutral-600">
              {isEvaluationPending
                ? "Evaluating speaking pace, technical answers, and clarity."
                : "Your interview report has been generated."}
            </p>

            {/* Quick Metrics Pills */}
            <div className="pt-2 grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                <p className="text-[10px] text-neutral-400 font-mono uppercase">Turns Answered</p>
                <p className="text-xs font-bold text-neutral-800 mt-0.5">
                  {interviewState.questions.length} / {interviewState.questions.length}
                </p>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                <p className="text-[10px] text-neutral-400 font-mono uppercase">Proctoring</p>
                <p className="text-xs font-bold text-emerald-700 mt-0.5">
                  {interviewState.tabSwitches} Infractions (Clean)
                </p>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-neutral-200">
                <p className="text-[10px] text-neutral-400 font-mono uppercase">Credits Status</p>
                <p className="text-xs font-bold text-amber-900 mt-0.5">
                  Restored + Bonus
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveView('DASHBOARD')}
              className="flex items-center space-x-2 bg-neutral-900 hover:bg-black text-white px-6 py-3 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Dashboard</span>
            </button>

            {!isEvaluationPending && latestReport && (
              <button
                type="button"
                onClick={() => {
                  dismissNewReportNotification?.();
                  setActiveView('REPORT_VIEW');
                }}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer animate-in zoom-in-95"
              >
                <span>View Results Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>

          <p className="text-[11px] text-neutral-400">
            You can safely return to your dashboard now. A notification indicator will appear when your results are ready.
          </p>

        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen px-4 sm:px-8 lg:px-10 py-3 sm:py-4 flex flex-col space-y-3 sm:space-y-4 animate-in fade-in duration-200">
      
      {/* Header Bar: Full controls in Lobby, Timer only once Live */}
      {!hasSessionStarted ? (
        <div className="space-y-3">
          {/* Top Bar 1: Exit to Dashboard, Coins, Fullscreen, Tab Switches, Session ID */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-neutral-200/90 shadow-2xs">
            <button
              onClick={requestExitAssessment}
              className="flex items-center space-x-2 text-xs font-semibold text-neutral-600 hover:text-neutral-900 transition-colors bg-neutral-50 hover:bg-neutral-100 px-3.5 py-2 rounded-xl border border-neutral-200 shadow-2xs group cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-neutral-500 group-hover:-translate-x-0.5 transition-transform" />
              <span>Exit to Dashboard</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-300 rounded-xl shadow-2xs">
                <span>🪙</span>
                <span>{student?.coins ?? 5} Coins</span>
                <span className="text-[10px] text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded font-normal hidden sm:inline">(1 at stake)</span>
              </span>

              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-medium bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Fullscreen Mode Active</span>
              </span>

              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-medium bg-amber-50 text-amber-800 border border-amber-300 rounded-xl">
                <span>Tab Switches: {interviewState.tabSwitches} / 4</span>
              </span>

              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-medium bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-xl uppercase">
                <span>SESSION #{interviewState.sessionId?.slice(0, 14) || 'ses_live'}</span>
              </span>
            </div>
          </div>

          {/* Top Bar 2: Technical Mock Interview Room & Controls */}
          <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-sm font-semibold tracking-tight text-neutral-900">Technical Mock Interview Room</h2>
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-neutral-100 text-neutral-600 rounded border border-neutral-200 font-mono">
                    Turn {questionNumber} of {totalQuestions}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 font-mono">
                    <Zap className="w-3 h-3 mr-1" /> HANDS-FREE MODE
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">Hands-free voice interaction: Speaks Question → Listens → Submits on pause</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
              <div className="flex items-center space-x-1.5 bg-neutral-900 text-white px-3.5 py-1.5 rounded-xl text-xs font-mono font-medium shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-neutral-300" />
                <span>Timer: {formatSessionTime(sessionTimeLeft)} / 25:00</span>
              </div>

              <button
                onClick={() => {
                  if (!isMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    setIsSpeakingQuestion(false);
                  }
                  setIsMuted(!isMuted);
                }}
                title={isMuted ? 'Unmute Interviewer Voice' : 'Mute Interviewer Voice'}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                  isMuted 
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-500' 
                    : 'bg-neutral-50 border-neutral-200 text-neutral-800 hover:bg-neutral-100'
                }`}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-neutral-400" /> : <Volume2 className="w-3.5 h-3.5 text-neutral-700" />}
                <span className="font-mono hidden md:inline">{isMuted ? 'Voice Off' : 'Voice On'}</span>
              </button>

              <div className="flex items-center space-x-1.5 bg-neutral-50 border border-neutral-200 px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-700 font-mono">
                <ShieldAlert className="w-3.5 h-3.5 text-neutral-500" />
                <span>Tab Switches: {interviewState.tabSwitches} / 4</span>
              </div>

              <button
                onClick={() => setDrawerOpen(!drawerOpen)}
                className="flex items-center space-x-1.5 bg-white hover:bg-neutral-50 border border-neutral-200 text-neutral-700 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Transcript</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Live Session: ONLY the running timer is displayed */
        <div className="flex items-center justify-center">
          <div className="flex items-center space-x-2 bg-neutral-900 text-white px-4 py-1.5 rounded-full text-xs font-mono font-medium shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-neutral-300" />
            <span>Timer: {formatSessionTime(sessionTimeLeft)} / 25:00</span>
          </div>
        </div>
      )}
      
      {/* Tab Switch Infraction Popup Warning Modal (Switches 1, 2, 3) */}
      {showWarning && interviewState.tabSwitches < 4 && (
        <div className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className={`max-w-md w-full bg-white dark:bg-[#18181b] rounded-3xl p-6 sm:p-8 text-center space-y-5 shadow-2xl border-2 animate-in zoom-in-95 duration-150 ${
            interviewState.tabSwitches === 3 
              ? 'border-rose-400 ring-4 ring-rose-500/10' 
              : 'border-amber-400 ring-4 ring-amber-500/10'
          }`}>
            <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center border ${
              interviewState.tabSwitches === 3
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-600 dark:text-amber-400'
            }`}>
              <AlertTriangle className={`w-8 h-8 ${interviewState.tabSwitches === 3 ? 'animate-bounce' : ''}`} />
            </div>

            <div className="space-y-2">
              <span className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider ${
                interviewState.tabSwitches === 3
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800/60'
                  : 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200 border border-amber-300 dark:border-amber-800/60'
              }`}>
                {interviewState.tabSwitches === 3
                  ? 'Critical Final Warning'
                  : `Proctoring Alert · Strike ${interviewState.tabSwitches} of 4`}
              </span>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                {interviewState.tabSwitches === 3
                  ? 'One Strike Remaining'
                  : 'Tab Switch Detected'}
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-sm mx-auto">
                {interviewState.tabSwitches === 3
                  ? 'WARNING: You have switched tabs 3 times. Exactly ONE more tab switch will permanently terminate this session with a score of 0 and forfeit your session coin.'
                  : `Please stay on this interview screen. You have ${4 - interviewState.tabSwitches} strike(s) remaining before automatic termination and permanent disqualification.`}
              </p>
            </div>

            <button
              onClick={() => setWarningDismissed(true)}
              className={`w-full py-3.5 rounded-xl text-xs font-bold text-white transition-all shadow-md cursor-pointer ${
                interviewState.tabSwitches === 3
                  ? 'bg-rose-600 hover:bg-rose-700 active:scale-98'
                  : 'bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900 active:scale-98'
              }`}
            >
              I Acknowledge & Return to Interview
            </button>
          </div>
        </div>
      )}

      {/* Mandatory Fullscreen Blocker Overlay */}
      {!isFullscreen && !(interviewState.tabSwitches >= 4 || interviewState.isDisqualified) && (
        <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] rounded-3xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center border border-amber-200 dark:border-amber-900/60">
              <Maximize2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 font-mono uppercase tracking-wider border border-amber-200/60 dark:border-amber-800/60">
                Mandatory Fullscreen Mode
              </span>
              <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Fullscreen Required for Interview
              </h2>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Whenever you enter an interview session, full screen is required by proctoring policy. Your focus and tab activity are actively monitored. Exceeding 4 tab switches will terminate your session permanently.
              </p>
            </div>
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={requestFullscreen}
                className="w-full py-3.5 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Enter Fullscreen to Proceed</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  requestExitAssessment();
                }}
                className="w-full py-2 text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Immediate Session Termination & Permanent Disqualification Modal */}
      {(interviewState.tabSwitches >= 4 || interviewState.isDisqualified) && (
        <div className="fixed inset-0 z-50 bg-neutral-950/95 backdrop-blur-lg flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] rounded-3xl p-8 max-w-lg w-full text-center space-y-6 shadow-2xl border-2 border-rose-300 dark:border-rose-900/60 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 rounded-3xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center border border-rose-200 dark:border-rose-900/60">
              <ShieldAlert className="w-10 h-10 animate-bounce" />
            </div>
            <div className="space-y-2">
              <span className="px-3.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-600 text-white uppercase tracking-wider">
                Disqualified · 4 Tab Switches Exceeded
              </span>
              <h2 className="text-2xl font-black tracking-tight text-rose-950 dark:text-rose-100">
                Interview Session Terminated
              </h2>
              <p className="text-xs text-rose-900 dark:text-rose-200 leading-relaxed max-w-md mx-auto">
                You have switched tabs <strong>4 times</strong> during this proctored session. In accordance with strict placement proctoring rules, this session has ended immediately with a score of <strong>0 / 100</strong>.
              </p>
            </div>

            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 rounded-2xl p-4 text-left text-xs text-rose-900 dark:text-rose-200 space-y-2">
              <div className="flex items-center space-x-2 font-bold">
                <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Permanent Disqualification Notice:</span>
              </div>
              <p className="text-[11px] text-rose-700 dark:text-rose-300 leading-relaxed">
                You are <strong>permanently disqualified from attending this interview again</strong>. This assessment has been locked and access has been revoked on your candidate portal.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                teardownAudioHardware();
                if (typeof document !== 'undefined' && document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                }
                setActiveView('DASHBOARD');
              }}
              className="w-full py-3.5 bg-neutral-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Exit to Student Dashboard</span>
            </button>
          </div>
        </div>
      )}

      {/* Reconnecting banner */}
      {reconnectAttempt && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex items-center justify-between text-amber-900 text-xs">
          <div className="flex items-center space-x-2">
            <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
            <span className="font-medium">
              Connection lost — reconnecting… (attempt {reconnectAttempt.current} of {reconnectAttempt.max})
            </span>
          </div>
          <span className="text-amber-600 font-mono text-[10px]">Interview state is preserved</span>
        </div>
      )}

      {micPermissionError && !reconnectAttempt && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 flex items-center justify-between text-red-900 text-xs">
          <span>{micPermissionError}</span>
          <div className="flex items-center space-x-2 ml-2 shrink-0">
            {micPermissionError.includes('Reconnect') && (
              <button
                onClick={handleManualReconnect}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer"
              >
                Reconnect
              </button>
            )}
            <button onClick={() => setMicPermissionError(null)} className="text-red-400 hover:text-red-600 font-bold">Dismiss</button>
          </div>
        </div>
      )}

      {!hasSessionStarted && activeAssignment && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-purple-900 shadow-2xs">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 animate-pulse"></span>
            <div>
              <span className="font-semibold text-purple-950">Assigned Drill: </span>
              <span className="font-medium">{activeAssignment.title}</span>
              <span className="text-purple-700 ml-1.5">· Assigned by {activeAssignment.assignedByName}</span>
              {activeAssignment.customInstructions && (
                <p className="text-[11px] text-purple-600 mt-0.5">Focus: {activeAssignment.customInstructions}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <span className="px-2.5 py-0.5 rounded font-mono text-[10px] bg-purple-200/70 text-purple-900 font-semibold">
              Due: {activeAssignment.dueDate}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${activeAssignment.isMandatory ? 'bg-amber-100 text-amber-900' : 'bg-neutral-100 text-neutral-700'}`}>
              {activeAssignment.isMandatory ? 'Mandatory' : 'Optional'}
            </span>
          </div>
        </div>
      )}


      {/* Central Interactive Area: Zero Layout Shift & Smooth Cross-fade */}
      <div className="w-full flex-1 flex flex-col items-center justify-center relative min-h-[68vh] py-2">
        {!hasSessionStarted ? (
          <div className="w-full max-w-lg mx-auto bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col items-center text-center space-y-5 animate-in fade-in duration-200">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-neutral-950 flex items-center justify-center text-white shadow-lg">
              <Mic className="w-8 h-8 sm:w-9 sm:h-9 text-emerald-400 animate-pulse" />
            </div>
            <div className="max-w-md text-center space-y-1.5">
              <h3 className="text-lg font-bold text-neutral-900">Audio Ready for Conversational Mode</h3>
              <p className="text-xs text-neutral-500 leading-relaxed">
                Click below to start. The interviewer will read the question aloud, then immediately open your microphone. From then on, the entire interview runs hands-free!
              </p>
            </div>
            <div className="pt-2">
              <button
                disabled={isStartingSession || !interviewState.sessionId}
                onClick={handleStartSession}
                className="inline-flex items-center space-x-2.5 bg-neutral-900 hover:bg-black text-white px-8 py-3.5 rounded-xl text-sm font-semibold transition-all shadow-md active:scale-98 cursor-pointer disabled:opacity-75"
              >
                {isStartingSession ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Connecting Hardware...</span>
                  </>
                ) : !interviewState.sessionId ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Setting up session...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white text-white" />
                    <span>Start Live Interview Session</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full flex-1 flex flex-col items-center justify-between py-2 animate-in fade-in duration-300">
            <div className="flex-1 flex flex-col items-center justify-center py-2 w-full">
              <VoiceOrb 
                state={orbState}
                volume={audioVolume}
                size={380}
              />

              {isTranscribingWithWhisper && (
                <div className="inline-flex items-center space-x-2 text-xs font-mono text-neutral-700 bg-neutral-100 border border-neutral-200 px-3.5 py-1.5 rounded-full animate-pulse shadow-2xs mt-4">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                  <span>Refining speech with OpenAI Whisper...</span>
                </div>
              )}

              {/* Live transcript — student can see what the interviewer is hearing */}
              {isRecording && (
                <div className="w-full max-w-xl mt-5 min-h-[52px] flex flex-col items-center">
                  {currentSpeechText ? (
                    <div className="w-full bg-neutral-950/90 border border-neutral-700 rounded-2xl px-4 py-3 text-center">
                      <p className="text-xs text-neutral-400 font-mono mb-1 uppercase tracking-wider">Interviewer hearing:</p>
                      <p className="text-sm text-white leading-relaxed">{currentSpeechText}</p>
                    </div>
                  ) : (
                    <div className="inline-flex items-center space-x-2 text-xs text-neutral-500 font-mono">
                      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse"></span>
                      <span>Listening — speak clearly into your microphone</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isSpeakingQuestion && (
              <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
                <button
                  disabled={isSubmitting}
                  onClick={() => handleExecuteSubmit()}
                  className="flex items-center space-x-2 bg-neutral-900 hover:bg-black text-white px-7 py-3 rounded-xl text-xs font-semibold transition-all shadow-md disabled:opacity-40 cursor-pointer active:scale-98"
                >
                  <span>{isSubmitting ? 'Evaluating...' : 'Done Speaking (Submit Answer)'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs animate-in slide-in-from-bottom duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
            <h4 className="text-xs font-semibold tracking-tight text-neutral-900 uppercase font-mono">Turn-by-Turn Session Transcript</h4>
            <button onClick={() => setDrawerOpen(false)} className="text-neutral-400 hover:text-neutral-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3 mt-3 max-h-60 overflow-y-auto pr-1 text-xs">
            {interviewState.questions.slice(0, interviewState.turnIndex + 1).map((q: QuestionTurn) => (
              <div key={q.id} className="p-3 bg-neutral-50 rounded-xl space-y-1.5 border border-neutral-100">
                <p className="font-semibold text-neutral-900">Interviewer: "{q.questionText}"</p>
                {q.studentAnswer && (
                  <p className="text-neutral-600 pl-3 border-l-2 border-neutral-300">
                    Student: "{q.studentAnswer}"
                  </p>
                )}
                {q.technicalScore !== undefined && (
                  <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-neutral-500 font-mono pt-1">
                    <span>Technical: {q.technicalScore}/100</span>
                    {q.communicationScore !== undefined && (<><span>•</span><span>Communication: {q.communicationScore}/100</span></>)}
                    <span>•</span>
                    <span>WPM: {q.wpm ?? '—'}</span>
                    <span>•</span>
                    <span>Fillers: {q.fillerWords ?? 0}</span>
                  </div>
                )}
                {q.keyPointsMissed && q.keyPointsMissed.length > 0 && (
                  <p className="text-[10px] text-amber-700 leading-relaxed">
                    Missed: {q.keyPointsMissed.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <WhisperSettingsModal 
        isOpen={showWhisperModal}
        onClose={() => setShowWhisperModal(false)}
        onKeyUpdated={(hasKey) => setHasWhisperKey(hasKey)}
        onVoiceUpdated={(voice) => setSelectedVoice(voice)}
      />

    </div>
  );
};
