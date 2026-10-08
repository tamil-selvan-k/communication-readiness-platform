/**
 * OpenAI Whisper Audio Recording & Transcription Service
 * Captures raw microphone audio chunks via MediaRecorder and transcribes
 * with OpenAI Whisper (large-v3 / whisper-1) for near-perfect technical accuracy.
 */

export const STORAGE_KEY_WHISPER = 'crp_openai_api_key';
export const STORAGE_KEY_TTS_VOICE = 'crp_openai_tts_voice';
export const STORAGE_KEY_TTS_MODEL = 'crp_openai_tts_model';

export type OpenAITTSVoice = 'nova' | 'onyx' | 'alloy' | 'echo' | 'shimmer' | 'fable';

export interface OpenAIVoiceOption {
  id: OpenAITTSVoice;
  name: string;
  description: string;
  gender: 'Female' | 'Male' | 'Neutral' | 'British';
  sampleText: string;
}

export const OPENAI_VOICES: OpenAIVoiceOption[] = [
  {
    id: 'nova',
    name: 'Nova',
    description: 'Crisp, professional, and engaging female interviewer',
    gender: 'Female',
    sampleText: 'Hello! I will be your interviewer today. Let us discuss your background and technical projects.'
  },
  {
    id: 'onyx',
    name: 'Onyx',
    description: 'Deep, authoritative, and focused male interviewer',
    gender: 'Male',
    sampleText: 'Welcome to your technical assessment. I will be evaluating your architecture and reasoning skills.'
  },
  {
    id: 'alloy',
    name: 'Alloy',
    description: 'Balanced, neutral, and versatile modern tone',
    gender: 'Neutral',
    sampleText: 'Welcome to the interview session. Please speak clearly and take your time to structure your thoughts.'
  },
  {
    id: 'echo',
    name: 'Echo',
    description: 'Warm, conversational, and natural male voice',
    gender: 'Male',
    sampleText: 'Great to have you here. Let us walk through your practical software engineering experience.'
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    description: 'Clear, articulate, and poised female voice',
    gender: 'Female',
    sampleText: 'Hello. I look forward to hearing your insights on system design and software principles.'
  },
  {
    id: 'fable',
    name: 'Fable',
    description: 'Dynamic British accent with expressive pacing',
    gender: 'British',
    sampleText: 'Good day. We will explore your technical decisions and trade-offs in today’s mock interview.'
  }
];

export type VoiceCategory = 'US_NATURAL' | 'UK_BRITISH' | 'INDIAN_ENGLISH' | 'AUS_ENGLISH' | 'OPENAI_NEURAL';

export interface InterviewerVoiceProfile {
  id: string;
  name: string;
  tagline: string;
  gender: 'Female' | 'Male' | 'Neutral';
  accent: 'US English' | 'British' | 'Indian English' | 'Australian English' | 'Neutral';
  category: VoiceCategory;
  isOpenAI: boolean;
  openAIVoiceId?: OpenAITTSVoice;
  browserVoiceKeywords: string[];
  sampleText: string;
}

export const INTERVIEWER_VOICES: InterviewerVoiceProfile[] = [
  // 🇺🇸 US Natural Voices (100% Free · Built-in)
  {
    id: 'aria',
    name: 'Aria',
    tagline: 'Crisp, articulate US Female · Modern Tech Interviewer',
    gender: 'Female',
    accent: 'US English',
    category: 'US_NATURAL',
    isOpenAI: false,
    browserVoiceKeywords: ['Aria', 'Jenny', 'Zira', 'Samantha', 'Google US English'],
    sampleText: "Hello! I will be your technical interviewer today. Let us discuss your background and technical projects."
  },
  {
    id: 'guy',
    name: 'Guy',
    tagline: 'Deep, authoritative US Male · Senior Engineering Lead',
    gender: 'Male',
    accent: 'US English',
    category: 'US_NATURAL',
    isOpenAI: false,
    browserVoiceKeywords: ['Guy', 'Christopher', 'David', 'Google US English'],
    sampleText: "Welcome to your technical assessment. I will be evaluating your architecture, scalability choices, and reasoning."
  },
  {
    id: 'jenny',
    name: 'Jenny',
    tagline: 'Warm, conversational US Female · Supportive Mentor',
    gender: 'Female',
    accent: 'US English',
    category: 'US_NATURAL',
    isOpenAI: false,
    browserVoiceKeywords: ['Jenny', 'Aria', 'Samantha'],
    sampleText: "Hi there! Take your time, structure your thoughts clearly, and walk me through your engineering solutions."
  },
  {
    id: 'christopher',
    name: 'Christopher',
    tagline: 'Calm, analytical US Male · Systems Architect',
    gender: 'Male',
    accent: 'US English',
    category: 'US_NATURAL',
    isOpenAI: false,
    browserVoiceKeywords: ['Christopher', 'David', 'Guy', 'Google US English'],
    sampleText: "Hello. Let us discuss your hands-on experience with backend performance, data modeling, and API design."
  },
  // 🇬🇧 British Voices (100% Free · Built-in)
  {
    id: 'ryan',
    name: 'Ryan',
    tagline: 'Executive UK Male · Structured Technical Interviewer',
    gender: 'Male',
    accent: 'British',
    category: 'UK_BRITISH',
    isOpenAI: false,
    browserVoiceKeywords: ['Ryan', 'George', 'Google UK English Male', 'Oliver'],
    sampleText: "Good day. In today's assessment, we shall explore your practical engineering decisions and technical trade-offs."
  },
  {
    id: 'sonia',
    name: 'Sonia',
    tagline: 'Poised, articulate UK Female · Professional Recruiter',
    gender: 'Female',
    accent: 'British',
    category: 'UK_BRITISH',
    isOpenAI: false,
    browserVoiceKeywords: ['Sonia', 'Libby', 'Google UK English Female', 'Hazel'],
    sampleText: "Hello. I look forward to examining how you approach real-world engineering challenges and team collaboration."
  },
  {
    id: 'oliver',
    name: 'Oliver',
    tagline: 'Direct, clear UK Male · Engineering Manager',
    gender: 'Male',
    accent: 'British',
    category: 'UK_BRITISH',
    isOpenAI: false,
    browserVoiceKeywords: ['Oliver', 'George', 'Ryan'],
    sampleText: "Welcome. Today we will focus on engineering trade-offs, concurrency management, and system resilience."
  },
  // 🇮🇳 Indian English Voices (100% Free · Built-in)
  {
    id: 'neerja',
    name: 'Neerja',
    tagline: 'Fluent Indian English Female · Clear Tech Evaluator',
    gender: 'Female',
    accent: 'Indian English',
    category: 'INDIAN_ENGLISH',
    isOpenAI: false,
    browserVoiceKeywords: ['Neerja', 'Google हिन्दी', 'Heera', 'India'],
    sampleText: "Hello! Welcome to the interview. Let us delve into your technical problem solving and software foundations."
  },
  {
    id: 'prabhat',
    name: 'Prabhat',
    tagline: 'Articulate Indian English Male · Focus on Fundamentals',
    gender: 'Male',
    accent: 'Indian English',
    category: 'INDIAN_ENGLISH',
    isOpenAI: false,
    browserVoiceKeywords: ['Prabhat', 'Ravi', 'India'],
    sampleText: "Welcome. We will go through core data structures, system bottlenecks, and how you optimize your code."
  },
  // 🇦🇺 Australian English Voices (100% Free · Built-in)
  {
    id: 'natasha',
    name: 'Natasha',
    tagline: 'Conversational Australian Female · Collaborative Lead',
    gender: 'Female',
    accent: 'Australian English',
    category: 'AUS_ENGLISH',
    isOpenAI: false,
    browserVoiceKeywords: ['Natasha', 'Catherine', 'Google Australian English Female'],
    sampleText: "Hello there! Welcome to your technical assessment. Let's step through your problem-solving process together."
  },
  {
    id: 'william',
    name: 'William',
    tagline: 'Precise Australian Male · Direct & Grounded',
    gender: 'Male',
    accent: 'Australian English',
    category: 'AUS_ENGLISH',
    isOpenAI: false,
    browserVoiceKeywords: ['William', 'James', 'Google Australian English Male'],
    sampleText: "G'day. We will examine how you structure distributed systems and handle production bottlenecks."
  },
  // ⚡ OpenAI Neural Models (Optional · Requires API Key)
  {
    id: 'nova',
    name: 'Nova',
    tagline: 'OpenAI Neural Female · Dynamic & Expressive',
    gender: 'Female',
    accent: 'Neutral',
    category: 'OPENAI_NEURAL',
    isOpenAI: true,
    openAIVoiceId: 'nova',
    browserVoiceKeywords: ['Aria', 'Jenny', 'Google US English'],
    sampleText: "Welcome to your AI-proctored technical drill. Please speak at a steady pace and explain your reasoning clearly."
  },
  {
    id: 'onyx',
    name: 'Onyx',
    tagline: 'OpenAI Neural Male · Authoritative & Grounded',
    gender: 'Male',
    accent: 'Neutral',
    category: 'OPENAI_NEURAL',
    isOpenAI: true,
    openAIVoiceId: 'onyx',
    browserVoiceKeywords: ['Guy', 'David', 'Christopher'],
    sampleText: "Greetings. I will be your interviewer today. Let's analyze your algorithmic problem solving under pressure."
  },
  {
    id: 'fable',
    name: 'Fable',
    tagline: 'OpenAI Neural British · Eloquent & Engaging',
    gender: 'Male',
    accent: 'British',
    category: 'OPENAI_NEURAL',
    isOpenAI: true,
    openAIVoiceId: 'fable',
    browserVoiceKeywords: ['Ryan', 'George', 'Google UK English Male'],
    sampleText: "Good day! Let us inspect the robustness of your technical approach and system architecture."
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    tagline: 'OpenAI Neural Female · Poised & Crisp',
    gender: 'Female',
    accent: 'Neutral',
    category: 'OPENAI_NEURAL',
    isOpenAI: true,
    openAIVoiceId: 'shimmer',
    browserVoiceKeywords: ['Aria', 'Jenny'],
    sampleText: "Hello. I look forward to hearing your insights on system reliability, concurrency, and architecture trade-offs."
  }
];

export const STORAGE_KEY_INTERVIEWER_VOICE = 'crp_interviewer_voice_profile';

export function getSelectedInterviewerVoice(): InterviewerVoiceProfile {
  try {
    const savedId = localStorage.getItem(STORAGE_KEY_INTERVIEWER_VOICE);
    if (savedId) {
      const found = INTERVIEWER_VOICES.find(v => v.id === savedId);
      if (found) return found;
    }
  } catch {}
  return INTERVIEWER_VOICES[0]; // Aria by default
}

export function setSelectedInterviewerVoice(voiceId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_INTERVIEWER_VOICE, voiceId);
  } catch (err) {
    console.warn('[WhisperService] Failed to persist interviewer voice:', err);
  }
}

export function findBestBrowserVoice(profileId: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  const candidatePool = englishVoices.length > 0 ? englishVoices : voices;

  const profile = INTERVIEWER_VOICES.find(p => p.id === profileId);
  if (!profile) {
    return candidatePool.find(v => v.name.includes('Natural')) || candidatePool[0];
  }

  // 1. Look for direct keywords in order
  for (const keyword of profile.browserVoiceKeywords) {
    const match = candidatePool.find(v => v.name.toLowerCase().includes(keyword.toLowerCase()));
    if (match) return match;
  }

  // 2. Fallback by accent
  if (profile.accent === 'Indian English') {
    const indianMatch = candidatePool.find(v => v.lang.includes('IN') || v.name.toLowerCase().includes('india'));
    if (indianMatch) return indianMatch;
  } else if (profile.accent === 'British') {
    const ukMatch = candidatePool.find(v => v.lang.includes('GB') || v.lang.includes('UK') || v.name.toLowerCase().includes('uk') || v.name.toLowerCase().includes('british'));
    if (ukMatch) return ukMatch;
  } else if (profile.accent === 'Australian English') {
    const ausMatch = candidatePool.find(v => v.lang.includes('AU') || v.name.toLowerCase().includes('australia'));
    if (ausMatch) return ausMatch;
  }

  // 3. Fallback by gender
  if (profile.gender === 'Female') {
    const femaleMatch = candidatePool.find(v => 
      v.name.includes('Natural') || v.name.includes('Female') || v.name.includes('Zira') || v.name.includes('Samantha') || v.name.includes('Jenny')
    );
    if (femaleMatch) return femaleMatch;
  } else if (profile.gender === 'Male') {
    const maleMatch = candidatePool.find(v => 
      v.name.includes('Natural') || v.name.includes('Male') || v.name.includes('David') || v.name.includes('Guy') || v.name.includes('George')
    );
    if (maleMatch) return maleMatch;
  }

  return candidatePool.find(v => v.name.includes('Natural')) || candidatePool[0];
}

export function getOpenAITTSVoice(): OpenAITTSVoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_TTS_VOICE);
    if (saved && OPENAI_VOICES.some(v => v.id === saved)) {
      return saved as OpenAITTSVoice;
    }
  } catch {}
  return 'nova';
}

export function setOpenAITTSVoice(voice: OpenAITTSVoice): void {
  try {
    localStorage.setItem(STORAGE_KEY_TTS_VOICE, voice);
  } catch (err) {
    console.warn('[WhisperService] Failed to persist TTS voice:', err);
  }
}

export function getOpenAITTSModel(): 'tts-1' | 'tts-1-hd' {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_TTS_MODEL);
    if (saved === 'tts-1-hd') return 'tts-1-hd';
  } catch {}
  return 'tts-1';
}

export function setOpenAITTSModel(model: 'tts-1' | 'tts-1-hd'): void {
  try {
    localStorage.setItem(STORAGE_KEY_TTS_MODEL, model);
  } catch (err) {
    console.warn('[WhisperService] Failed to persist TTS model:', err);
  }
}

export function getWhisperApiKey(): string {
  try {
    // Only a key the user entered in their own browser. A VITE_* key would be
    // compiled into the public JavaScript bundle and exposed to every visitor.
    const saved = localStorage.getItem(STORAGE_KEY_WHISPER);
    return saved ? saved.trim() : '';
  } catch {
    return '';
  }
}

export function setWhisperApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY_WHISPER, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_WHISPER);
    }
  } catch (err) {
    console.warn('[WhisperService] Failed to persist key:', err);
  }
}

export function hasWhisperApiKey(): boolean {
  return getWhisperApiKey().length > 0;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private activeMimeType = 'audio/webm';

  start(stream: MediaStream): boolean {
    this.audioChunks = [];

    // Determine optimal supported audio MIME type
    if (typeof MediaRecorder === 'undefined') {
      console.warn('[AudioRecorder] MediaRecorder not supported in this browser.');
      return false;
    }

    const preferredTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];

    let selectedType = 'audio/webm';
    for (const t of preferredTypes) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
        selectedType = t;
        break;
      }
    }
    this.activeMimeType = selectedType;

    try {
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: selectedType });
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      // Record chunks every 300ms for continuous streaming capture
      this.mediaRecorder.start(300);
      return true;
    } catch (err) {
      console.warn('[AudioRecorder] Failed to start MediaRecorder:', err);
      // Fallback without explicit mimeType
      try {
        this.mediaRecorder = new MediaRecorder(stream);
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };
        this.mediaRecorder.start(300);
        return true;
      } catch (fallbackErr) {
        console.warn('[AudioRecorder] Fallback start failed:', fallbackErr);
        return false;
      }
    }
  }

  stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        if (this.audioChunks.length > 0) {
          const blob = new Blob(this.audioChunks, { type: this.activeMimeType });
          resolve(blob);
        } else {
          resolve(null);
        }
        return;
      }

      this.mediaRecorder.onstop = () => {
        if (this.audioChunks.length > 0) {
          const blob = new Blob(this.audioChunks, { type: this.activeMimeType });
          resolve(blob);
        } else {
          resolve(null);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch {
        resolve(null);
      }
    });
  }

  clear(): void {
    this.audioChunks = [];
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.mediaRecorder = null;
  }

  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }
}

export async function transcribeWithWhisper(
  audioBlob: Blob,
  promptContext?: string
): Promise<{ text: string; success: boolean; error?: string }> {
  const apiKey = getWhisperApiKey();
  if (!apiKey) {
    return { text: '', success: false, error: 'NO_API_KEY' };
  }

  if (audioBlob.size < 500) {
    return { text: '', success: false, error: 'AUDIO_TOO_SHORT' };
  }

  const formData = new FormData();
  const extension = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
  formData.append('file', audioBlob, `turn_audio.${extension}`);
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');

  // Provide technical terminology prompt to guide Whisper's vocabulary
  const technicalPrompt = [
    "Technical software engineering interview.",
    "Candidate discusses code, architecture, system design, databases, microservices, REST APIs, GraphQL, algorithms, data structures, React, Node.js, Python, Java, Docker, Kubernetes, PostgreSQL, MongoDB, Redis, AWS, CI/CD, Git.",
    promptContext ? `Question Context: "${promptContext.slice(0, 300)}"` : ""
  ].filter(Boolean).join(' ');

  formData.append('prompt', technicalPrompt.slice(0, 900));

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = errJson?.error?.message || `HTTP ${response.status} ${response.statusText}`;
      console.warn('[Whisper API] Transcription request failed:', msg);
      return { text: '', success: false, error: msg };
    }

    const data = await response.json();
    const transcribedText = (data.text || '').trim();
    return { text: transcribedText, success: true };
  } catch (err: any) {
    console.warn('[Whisper API] Network or fetch error:', err);
    return { text: '', success: false, error: err.message || 'Network connection failed' };
  }
}

export async function synthesizeSpeechWithOpenAI(
  text: string,
  voiceOverride?: OpenAITTSVoice,
  modelOverride?: 'tts-1' | 'tts-1-hd'
): Promise<{ audioBlob: Blob | null; success: boolean; error?: string }> {
  const apiKey = getWhisperApiKey();
  if (!apiKey) {
    return { audioBlob: null, success: false, error: 'NO_API_KEY' };
  }

  const voice = voiceOverride || getOpenAITTSVoice();
  const model = modelOverride || getOpenAITTSModel();

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = errJson?.error?.message || `HTTP ${response.status} ${response.statusText}`;
      console.warn('[OpenAI TTS] Speech synthesis failed:', msg);
      return { audioBlob: null, success: false, error: msg };
    }

    const audioBlob = await response.blob();
    return { audioBlob, success: true };
  } catch (err: any) {
    console.warn('[OpenAI TTS] Network or fetch error:', err);
    return { audioBlob: null, success: false, error: err.message || 'Network connection failed' };
  }
}

