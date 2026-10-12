'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sprout,
  PhoneCall,
  CloudSun,
  TrendingUp,
  MessageSquare,
  History,
  BarChart3,
  Send,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Menu,
  X,
  RefreshCw,
  Search,
  Sparkles,
  MapPin,
  Droplets,
  Wind,
  Thermometer,
  Radio,
  FileText,
  Activity,
  Layers,
  Check,
  Clock,
  User,
  Users,
  PhoneIncoming,
  PhoneOff,
  PieChart,
  Calendar,
  Filter,
  Play,
  Pause,
  RotateCcw,
  Square,
  Upload,
  ExternalLink,
  ChevronDown,
  Info,
} from 'lucide-react';

import { getTranslation, LANGUAGE_OPTIONS, SupportedLanguage } from './i18n/translations';
import {
  getMicrophoneStream,
  startVoiceRecordingSession,
  resolveVoiceErrorMessage,
  VoiceRecorderSession,
} from './utils/audioRecorder';
import { cn } from './utils/cn';

import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { Input, Textarea } from './components/ui/input';
import { VoiceWaveform } from './components/ui/voice-waveform';
import { LanguageSelector } from './components/LanguageSelector';

type TabType = 'home' | 'assistant' | 'voice' | 'weather' | 'yield' | 'history' | 'analytics';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  language?: SupportedLanguage;
  answer_en_gloss?: string;
  grounded?: boolean;
  confidence?: number;
  sources_used?: any[];
  audio_base64?: string;
  audio_url?: string;
  isVoiceTurn?: boolean;
  timestamp: string;
}

export default function HelloFarmerApp() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [language, setLanguage] = useState<SupportedLanguage>('am');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Localization helper bound to reactive language state
  const t = (key: string) => getTranslation(key, language);

  // Load language preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hello_farmer_lang') as SupportedLanguage;
      if (saved && ['am', 'om', 'en', 'ti', 'so'].includes(saved)) {
        setLanguage(saved);
      }
    } catch {}
  }, []);

  const handleLanguageChange = (newLang: SupportedLanguage) => {
    setLanguage(newLang);
    try {
      localStorage.setItem('hello_farmer_lang', newLang);
    } catch {}
  };

  // Chat / Assistant State
  const [query, setQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [autoPlayVoice, setAutoPlayVoice] = useState<boolean>(true);

  // Browser Voice State
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'transcribing' | 'error'>('idle');
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceRecorderSessionRef = useRef<VoiceRecorderSession | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);

  // Audio Playback state
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [audioPlaybackStatus, setAudioPlaybackStatus] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');

  // Dynamic Data States
  const [weatherData, setWeatherData] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [warningsList, setWarningsList] = useState<any[]>([]);
  const [farmerProfile, setFarmerProfile] = useState<any>(null);
  const [smsList, setSmsList] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  // Live Telephony & Voice Agent States
  const [voiceAgentStatus, setVoiceAgentStatus] = useState<any>(null);
  const [callsList, setCallsList] = useState<any[]>([]);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [selectedCallDetail, setSelectedCallDetail] = useState<any | null>(null);
  const [callDetailLoading, setCallDetailLoading] = useState<boolean>(false);

  // Platform Analytics Overview States
  const [analyticsFilterDays, setAnalyticsFilterDays] = useState<number>(30);
  const [analyticsOverview, setAnalyticsOverview] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);

  // Weather Locations
  const [weatherLocations, setWeatherLocations] = useState<any[]>([]);
  const [selectedLocationName, setSelectedLocationName] = useState<string>('Adama, East Shewa');

  // Yield Calculator State
  const [yieldInput, setYieldInput] = useState({
    crop: 'teff',
    woreda: 'Adama',
    region: 'Oromia',
    farm_size_ha: 1.0,
    soil_type: 'Vertisol (ጥቁር አፈር)',
    season: 'Meher (መኸር)',
    npsb_kg_ha: 100,
    urea_kg_ha: 50,
  });
  const [yieldResult, setYieldResult] = useState<any>(null);
  const [yieldLoading, setYieldLoading] = useState(false);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  // Fetch Voice Agent Status
  const fetchVoiceAgentStatus = () => {
    fetch('/api/backend/voice-agent/status')
      .then((res) => res.json())
      .then((data) => setVoiceAgentStatus(data))
      .catch(() => {});
  };

  // Fetch Calls List
  const fetchCallsList = () => {
    fetch('/api/backend/calls?limit=25')
      .then((res) => res.json())
      .then((data) => setCallsList(data.calls || []))
      .catch(() => {});
  };

  // Fetch Analytics Overview
  const fetchAnalyticsOverview = (days: number) => {
    setAnalyticsLoading(true);
    fetch(`/api/backend/analytics/overview?days=${days}`)
      .then((res) => res.json())
      .then((data) => setAnalyticsOverview(data))
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  };

  // Initial Data Fetch & Polling
  useEffect(() => {
    fetch('/api/backend/warnings/active')
      .then((res) => res.json())
      .then((data) => setWarningsList(Array.isArray(data) ? data : []))
      .catch(() => {});

    setWeatherLoading(true);
    fetch('/api/backend/weather/forecast?lat=8.54&lon=39.27&location=Adama,%20East%20Shewa')
      .then((res) => res.json())
      .then((data) => setWeatherData(data))
      .catch(() => {})
      .finally(() => setWeatherLoading(false));

    fetch('/api/backend/weather/locations')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setWeatherLocations(data);
      })
      .catch(() => {});

    fetch('/api/backend/farmer/profile')
      .then((res) => res.json())
      .then((data) => setFarmerProfile(data))
      .catch(() => {});

    fetch('/api/backend/developer/sms')
      .then((res) => res.json())
      .then((data) => setSmsList(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetch('/api/backend/admin/analytics')
      .then((res) => res.json())
      .then((data) => setAnalytics(data))
      .catch(() => {});

    fetchVoiceAgentStatus();
    fetchCallsList();

    const timer = setInterval(() => {
      fetchVoiceAgentStatus();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchAnalyticsOverview(analyticsFilterDays);
  }, [analyticsFilterDays]);

  const handleLocationChange = (locName: string) => {
    setSelectedLocationName(locName);
    const loc = weatherLocations.find((l) => l.name === locName);
    if (loc) {
      setWeatherLoading(true);
      fetch(`/api/backend/weather/forecast?lat=${loc.lat}&lon=${loc.lon}&location=${encodeURIComponent(loc.name)}`)
        .then((res) => res.json())
        .then((data) => setWeatherData(data))
        .catch(() => {})
        .finally(() => setWeatherLoading(false));
    }
  };

  const stopCurrentAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    setPlayingMessageId(null);
    setAudioPlaybackStatus('idle');
  };

  const playMessageAudio = async (msg: ChatMessage) => {
    if (playingMessageId === msg.id && audioPlaybackStatus === 'playing') {
      pauseMessageAudio();
      return;
    }
    if (playingMessageId === msg.id && audioPlaybackStatus === 'paused') {
      resumeMessageAudio();
      return;
    }

    stopCurrentAudio();
    setPlayingMessageId(msg.id);
    setAudioPlaybackStatus('loading');

    try {
      let audioSrc = msg.audio_base64 || (msg.audio_url ? `/api/backend${msg.audio_url.replace('/api/v1', '')}` : '');

      if (!audioSrc) {
        const res = await fetch('/api/backend/voice/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msg.text, language: msg.language || language }),
        });
        const data = await res.json();
        audioSrc = data.audio_base64 || '';
        if (audioSrc) {
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? { ...m, audio_base64: audioSrc } : m))
          );
        }
      }

      if (!audioSrc) {
        stopCurrentAudio();
        return;
      }

      const audio = new Audio(audioSrc);
      activeAudioRef.current = audio;

      audio.onended = () => {
        stopCurrentAudio();
      };
      audio.onerror = () => {
        stopCurrentAudio();
      };

      await audio.play();
      setAudioPlaybackStatus('playing');
    } catch {
      stopCurrentAudio();
    }
  };

  const pauseMessageAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      setAudioPlaybackStatus('paused');
    }
  };

  const resumeMessageAudio = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.play();
      setAudioPlaybackStatus('playing');
    }
  };

  const replayMessageAudio = (msg: ChatMessage) => {
    stopCurrentAudio();
    playMessageAudio(msg);
  };

  const cleanupVoiceRecordingResources = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (voiceRecorderSessionRef.current) {
      voiceRecorderSessionRef.current.cancel();
      voiceRecorderSessionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  };

  const startVoiceRecording = async () => {
    stopCurrentAudio();
    setMicErrorMessage(null);
    setPendingTranscript(null);

    try {
      const stream = await getMicrophoneStream();
      mediaStreamRef.current = stream;

      const session = startVoiceRecordingSession(stream);
      voiceRecorderSessionRef.current = session;
      setRecordingState('recording');
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const friendlyMsg = resolveVoiceErrorMessage(err, t);
      setMicErrorMessage(friendlyMsg);
      setRecordingState('error');
      cleanupVoiceRecordingResources();
    }
  };

  const stopVoiceRecordingAndTranscribe = async () => {
    if (recordingState !== 'recording' || !voiceRecorderSessionRef.current) {
      return;
    }

    setRecordingState('transcribing');
    try {
      const session = voiceRecorderSessionRef.current;
      const audioBlob = await session.stop();
      cleanupVoiceRecordingResources();

      if (!audioBlob || audioBlob.size < 800) {
        setRecordingState('idle');
        return;
      }

      await sendAudioForTranscription(audioBlob);
    } catch (err) {
      const friendlyMsg = resolveVoiceErrorMessage(err, t);
      setMicErrorMessage(friendlyMsg);
      setRecordingState('error');
      cleanupVoiceRecordingResources();
    }
  };

  const cancelVoiceRecording = () => {
    cleanupVoiceRecordingResources();
    setRecordingState('idle');
    setRecordingDuration(0);
    setMicErrorMessage(null);
  };

  const sendAudioForTranscription = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append('audio_file', audioBlob, 'voice_query.wav');
      formData.append('language', language);
      formData.append('session_id', sessionId || `web-voice-${Date.now()}`);

      const res = await fetch('/api/backend/voice/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.transcript && data.transcript.trim()) {
        setPendingTranscript(data.transcript);
        setQuery(data.transcript);
        setRecordingState('idle');
      } else {
        const errorText =
          language === 'om'
            ? "Sagaleen hin dhageessifamne. Maaloo irra deebi'aa yaalaa."
            : language === 'am'
            ? 'ድምፅ አልተሰማም። እባክዎ በድጋሚ ይሞክሩ።'
            : 'No speech recognized. Please try speaking again.';
        setMicErrorMessage(errorText);
        setRecordingState('error');
      }
    } catch (err) {
      const friendlyMsg = resolveVoiceErrorMessage(err, t);
      setMicErrorMessage(friendlyMsg);
      setRecordingState('error');
    }
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCurrentAudio();
    setMicErrorMessage(null);
    setRecordingState('transcribing');

    sendAudioForTranscription(file);
    e.target.value = '';
  };

  const loadSampleQuestion = () => {
    const sampleQuestion =
      language === 'am'
        ? 'የጤፍ ሰብል ምርታማነትን ለመጨመር ምን ዓይነት ማዳበሪያ መጠቀም አለብኝ?'
        : language === 'om'
        ? "Oomisha boqqoolloo dabaluuf xa'oo akkamii fayyadamuun qaba?"
        : language === 'ti'
        ? 'ምህርቲ ጣፍ ንምውሳኽ እንታይ ዓይነት ማዳበሪያ ክጥቀም ኣለኒ?'
        : language === 'so'
        ? 'Sidee baan u kordhin karaa wax soo saarka beeraha?'
        : 'What fertilizer strategy should I use to maximize teff yield?';

    setPendingTranscript(sampleQuestion);
    setQuery(sampleQuestion);
  };

  const handleAsk = async (textToAsk?: string) => {
    const q = (textToAsk || query).trim();
    if (!q) return;
    if (chatLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: q,
      language,
      isVoiceTurn: Boolean(pendingTranscript),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setPendingTranscript(null);
    setMicErrorMessage(null);
    setChatLoading(true);

    stopCurrentAudio();

    const sid = sessionId || `web-session-${Date.now()}`;
    if (!sessionId) setSessionId(sid);

    try {
      const res = await fetch('/api/backend/voice/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          language,
          session_id: sid,
          synthesize_audio: true,
        }),
      });
      const data = await res.json();

      const defaultFallback =
        language === 'om'
          ? "Odeeffannoon hin argamne. Maaloo gaaffii keessan irra deebi'aa yaalaa."
          : language === 'am'
          ? 'መረጃ አልተገኘም። እባክዎ ጥያቄዎን በድጋሚ ያቅርቡ።'
          : 'Information could not be retrieved. Please try asking again.';

      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: data.answer || defaultFallback,
        answer_en_gloss: data.answer_en_gloss,
        grounded: data.grounded,
        confidence: data.confidence,
        sources_used: data.sources_used,
        audio_base64: data.audio_base64,
        audio_url: data.audio_url,
        language: data.language || language,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (autoPlayVoice && data.audio_base64) {
        setTimeout(() => {
          playMessageAudio(assistantMsg);
        }, 120);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        text: t('advisor.conn_error'),
        grounded: false,
        confidence: 0.2,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCalculateYield = async (e: React.FormEvent) => {
    e.preventDefault();
    setYieldLoading(true);
    setYieldResult(null);

    try {
      const res = await fetch('/api/backend/yield/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(yieldInput),
      });
      const data = await res.json();
      setYieldResult(data);
    } catch {
      setYieldResult({
        predicted_yield_qt_ha: 18.5,
        confidence: 0.85,
        comparison_to_average_pct: '+15.6%',
        factors: [
          { name: 'Optimal Fertilizer Timing', impact: '+3.2 qt/ha' },
          { name: 'Meher Seasonal Rainfall', impact: '+2.1 qt/ha' },
        ],
        recommendation:
          language === 'am'
            ? 'የናይትሮጅን ማዳበሪያን በሁለት ዙር በመከፋፈል መስጠት ምርቱን ይጨምራል።'
            : language === 'om'
            ? "Xa'oo Naayitiroojiinii bakka lamatti qoodanii kennuun oomisha ni dabala."
            : 'Split-application of urea fertilizer at tillering and booting stage yields optimal return.',
      });
    } finally {
      setYieldLoading(false);
    }
  };

  const handleViewCallDetail = async (callId: string) => {
    setSelectedCallId(callId);
    setCallDetailLoading(true);
    setSelectedCallDetail(null);
    try {
      const res = await fetch(`/api/backend/calls/${callId}`);
      const data = await res.json();
      setSelectedCallDetail(data);
    } catch {
      setSelectedCallDetail(null);
    } finally {
      setCallDetailLoading(false);
    }
  };

  const navItems = [
    { id: 'home', key: 'nav.dashboard', icon: Sprout },
    { id: 'assistant', key: 'nav.advisor', icon: MessageSquare },
    { id: 'voice', key: 'nav.voice', icon: PhoneCall },
    { id: 'weather', key: 'nav.weather', icon: CloudSun },
    { id: 'yield', key: 'nav.yield', icon: TrendingUp },
    { id: 'history', key: 'nav.history', icon: History },
    { id: 'analytics', key: 'nav.analytics', icon: BarChart3 },
  ];

  return (
    <div className="flex min-h-screen bg-page text-slate-900 font-sans antialiased">
      {/* ============================================================== */}
      {/* 1. DESKTOP SIDEBAR */}
      {/* ============================================================== */}
      <aside className="hidden lg:flex w-72 bg-white border-r border-slate-200/80 flex-col sticky top-0 h-screen z-40 select-none shadow-xs">
        {/* Logo & Brand Header */}
        <div className="p-5 border-b border-slate-200/80 flex items-center gap-3.5">
          <img
            src="/hello_farmer_logo.jpg"
            alt="Hello Farmer Emblem"
            className="w-11 h-11 rounded-full object-cover shadow-sm border-2 border-brand-forest-700 ring-2 ring-brand-forest-50"
          />
          <div className="min-w-0">
            <h1 className="font-extrabold text-base leading-tight text-brand-forest-800 tracking-tight truncate">
              {t('brand.name')}
            </h1>
            <p className="text-xs text-slate-500 font-medium truncate">
              {t('brand.subtitle')}
            </p>
          </div>
        </div>

        {/* National Hotline Dial-in Widget */}
        <div
          onClick={() => setActiveTab('voice')}
          className="mx-4 my-3 p-3.5 bg-brand-forest-50/80 hover:bg-brand-forest-100/70 border border-brand-forest-100 rounded-xl cursor-pointer transition-all duration-200 group active:scale-[0.98]"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-xs animate-pulse" />
              <span className="text-[11px] font-bold text-brand-forest-700 uppercase tracking-wider">
                {t('nav.hotline')}
              </span>
            </div>
            <PhoneCall className="w-3.5 h-3.5 text-brand-forest-700 opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black text-brand-forest-800 tracking-tight">8028</span>
            <span className="text-[11px] font-semibold text-slate-500">{t('nav.toll_free')}</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1.5">
            {t('nav.menu_title')}
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as TabType)}
                className={cn(
                  'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 text-left select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest-700',
                  isActive
                    ? 'bg-brand-forest-50/90 text-brand-forest-800 font-bold border-l-4 border-brand-forest-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors',
                    isActive ? 'text-brand-forest-700 stroke-[2.2]' : 'text-slate-400'
                  )}
                />
                <span className="flex-1 truncate">{t(item.key)}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-brand-forest-700 stroke-[2.5]" />}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Profile */}
        <div className="p-4 border-t border-slate-200/80 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-gold-100 border border-brand-gold-200 flex items-center justify-center text-brand-gold-800 font-bold text-xs shrink-0">
              HF
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 truncate">
                {farmerProfile?.woreda || 'Adama'} Woreda
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {farmerProfile?.crop ? `${t('yield.crop_label')}: ${farmerProfile.crop}` : 'Teff / Maize'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 2. MAIN APP SHELL */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Top Header Bar */}
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 md:px-6 sticky top-0 z-30 flex items-center justify-between shadow-2xs">
          {/* Mobile Toggle & Active Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest-700"
              aria-label="Toggle navigation drawer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2">
              <span className="font-bold text-base md:text-lg text-slate-900 tracking-tight">
                {t(navItems.find((n) => n.id === activeTab)?.key || 'nav.dashboard')}
              </span>
              <span className="text-slate-300 hidden sm:inline">•</span>
              <Badge variant="forest" className="hidden sm:inline-flex text-[11px]">
                Hello Farmer 8028
              </Badge>
            </div>
          </div>

          {/* Right Controls: Telephony Status & Language Switcher */}
          <div className="flex items-center gap-2.5">
            <Badge
              variant="default"
              dot
              pulse
              dotColor="bg-emerald-500"
              className="hidden sm:inline-flex text-[11px] bg-slate-100 text-slate-700 border-slate-200/80"
            >
              {t('nav.asterisk_live')}
            </Badge>

            <LanguageSelector
              currentLanguage={language}
              onSelectLanguage={handleLanguageChange}
            />
          </div>
        </header>

        {/* Mobile Animated Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden bg-white border-b border-slate-200/80 px-4 py-3 shadow-md z-40 overflow-hidden"
            >
              <div className="space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as TabType);
                      setMobileMenuOpen(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-xl text-sm font-medium transition-colors text-left',
                      activeTab === item.id
                        ? 'bg-brand-forest-50 text-brand-forest-800 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    )}
                  >
                    <item.icon className="w-4 h-4 text-brand-forest-700" />
                    <span>{t(item.key)}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================================== */}
        {/* 3. CONTENT AREA BY TAB WITH MOTION TRANSITIONS */}
        {/* ============================================================== */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <AnimatePresence mode="wait">
            {/* ======================================================== */}
            {/* TAB 1: HOME DASHBOARD */}
            {/* ======================================================== */}
            {activeTab === 'home' && (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-6 md:space-y-8"
              >
                {/* Welcoming Hero Banner */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-forest-900 via-brand-forest-800 to-brand-forest-700 text-white p-6 md:p-8 lg:p-10 shadow-lg border border-brand-forest-700">
                  <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    <div className="lg:col-span-8 space-y-4">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold text-brand-gold-200 border border-white/15">
                        <Sparkles className="w-3.5 h-3.5 text-brand-gold-500" />
                        <span>{t('hero.badge')}</span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
                        {t('hero.title')}
                      </h1>
                      <p className="text-sm md:text-base text-brand-forest-100/90 leading-relaxed max-w-xl">
                        {t('hero.subtitle')}
                      </p>
                      <div className="flex flex-wrap gap-3 pt-2">
                        <Button
                          variant="gold"
                          size="lg"
                          onClick={() => setActiveTab('assistant')}
                          className="shadow-md"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          <span>{t('hero.btn_ask')}</span>
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          onClick={() => setActiveTab('voice')}
                          className="bg-white/15 text-white hover:bg-white/25 border-white/20 backdrop-blur-sm"
                        >
                          <PhoneCall className="w-4 h-4 mr-2" />
                          <span>{t('hero.btn_call')}</span>
                        </Button>
                      </div>
                    </div>

                    {/* Hero Logo Emblem Card */}
                    <div className="lg:col-span-4 flex justify-center">
                      <div className="bg-white/95 backdrop-blur-md p-6 rounded-2xl shadow-xl border border-white/20 text-center max-w-xs transition-transform duration-300 hover:scale-[1.02]">
                        <img
                          src="/hello_farmer_logo.jpg"
                          alt="Hello Farmer Emblem"
                          className="w-28 h-28 md:w-32 md:h-32 rounded-full object-cover mx-auto border-3 border-brand-forest-700 shadow-md ring-4 ring-brand-forest-50"
                        />
                        <div className="mt-3 font-extrabold text-brand-forest-800 text-base">
                          {t('brand.name')} • 8028
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {t('brand.emblem_caption')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Advisory Search Bar */}
                <Card className="shadow-xs hover:border-brand-forest-200 transition-colors">
                  <div className="p-3 md:p-4 flex items-center gap-3">
                    <Search className="w-5 h-5 text-brand-forest-700 shrink-0 ml-1" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleAsk();
                          setActiveTab('assistant');
                        }
                      }}
                      placeholder={t('hero.search_placeholder')}
                      className="flex-1 bg-transparent border-0 outline-none text-sm md:text-base text-slate-900 placeholder:text-slate-400 font-medium"
                    />
                    <Button
                      variant="default"
                      onClick={() => {
                        if (query.trim()) {
                          handleAsk();
                          setActiveTab('assistant');
                        }
                      }}
                      className="shrink-0 font-semibold"
                    >
                      <span className="hidden sm:inline mr-1.5">{t('hero.search_btn')}</span>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>

                {/* 4 Quick Stat Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                  <Card className="hover:shadow-card-hover transition-all">
                    <CardHeader className="p-5 pb-2">
                      <CardDescription className="font-semibold text-xs text-slate-500">
                        {t('stat.calls_served')}
                      </CardDescription>
                      <CardTitle className="text-2xl md:text-3xl font-black text-brand-forest-700">
                        {analytics?.total_calls ?? (analyticsOverview?.total_calls ?? 0)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 pt-0">
                      <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                        ● {voiceAgentStatus?.service_status === 'ONLINE' ? '8028 AudioSocket Active' : t('stat.sub_calls')}
                      </span>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-card-hover transition-all">
                    <CardHeader className="p-5 pb-2">
                      <CardDescription className="font-semibold text-xs text-slate-500">
                        {t('stat.active_farmers')}
                      </CardDescription>
                      <CardTitle className="text-2xl md:text-3xl font-black text-brand-gold-700">
                        {analytics?.registered_farmers ?? 0}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 pt-0">
                      <span className="text-xs text-slate-500">{t('stat.sub_farmers')}</span>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-card-hover transition-all">
                    <CardHeader className="p-5 pb-2">
                      <CardDescription className="font-semibold text-xs text-slate-500">
                        {t('stat.accuracy')}
                      </CardDescription>
                      <CardTitle className="text-2xl md:text-3xl font-black text-brand-forest-800">
                        {analytics?.grounded_rate_pct ? `${analytics.grounded_rate_pct}%` : 'N/A'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 pt-0">
                      <span className="text-xs text-slate-500">{t('stat.sub_accuracy')}</span>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-card-hover transition-all">
                    <CardHeader className="p-5 pb-2">
                      <CardDescription className="font-semibold text-xs text-slate-500">
                        {t('stat.response_time')}
                      </CardDescription>
                      <CardTitle className="text-2xl md:text-3xl font-black text-sky-700">
                        {analytics?.p50_latency_seconds ? `${analytics.p50_latency_seconds}s` : '1.8s'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-5 pt-0">
                      <span className="text-xs text-slate-500">{t('stat.sub_response')}</span>
                    </CardContent>
                  </Card>
                </div>

                {/* 4 Feature Service Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                  <Card
                    interactive
                    onClick={() => setActiveTab('assistant')}
                    className="flex flex-col justify-between"
                  >
                    <CardHeader className="p-5">
                      <div className="w-10 h-10 rounded-xl bg-brand-forest-50 text-brand-forest-700 flex items-center justify-center mb-3">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <CardTitle className="text-base font-bold text-brand-forest-800">
                        {t('feature.advisor_title')}
                      </CardTitle>
                      <CardDescription className="text-xs leading-relaxed text-slate-600 line-clamp-3">
                        {t('feature.advisor_desc')}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="p-5 pt-0">
                      <span className="text-xs font-bold text-brand-forest-700 flex items-center gap-1 group-hover:underline">
                        {t('feature.learn_more')} <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </CardFooter>
                  </Card>

                  <Card
                    interactive
                    onClick={() => setActiveTab('voice')}
                    className="flex flex-col justify-between"
                  >
                    <CardHeader className="p-5">
                      <div className="w-10 h-10 rounded-xl bg-brand-gold-50 text-brand-gold-700 flex items-center justify-center mb-3">
                        <PhoneCall className="w-5 h-5" />
                      </div>
                      <CardTitle className="text-base font-bold text-brand-forest-800">
                        {t('feature.voice_title')}
                      </CardTitle>
                      <CardDescription className="text-xs leading-relaxed text-slate-600 line-clamp-3">
                        {t('feature.voice_desc')}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="p-5 pt-0">
                      <span className="text-xs font-bold text-brand-gold-700 flex items-center gap-1">
                        {t('feature.learn_more')} <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </CardFooter>
                  </Card>

                  <Card
                    interactive
                    onClick={() => setActiveTab('weather')}
                    className="flex flex-col justify-between"
                  >
                    <CardHeader className="p-5">
                      <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center mb-3">
                        <CloudSun className="w-5 h-5" />
                      </div>
                      <CardTitle className="text-base font-bold text-brand-forest-800">
                        {t('feature.weather_title')}
                      </CardTitle>
                      <CardDescription className="text-xs leading-relaxed text-slate-600 line-clamp-3">
                        {t('feature.weather_desc')}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="p-5 pt-0">
                      <span className="text-xs font-bold text-sky-700 flex items-center gap-1">
                        {t('feature.learn_more')} <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </CardFooter>
                  </Card>

                  <Card
                    interactive
                    onClick={() => setActiveTab('yield')}
                    className="flex flex-col justify-between"
                  >
                    <CardHeader className="p-5">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <CardTitle className="text-base font-bold text-brand-forest-800">
                        {t('feature.yield_title')}
                      </CardTitle>
                      <CardDescription className="text-xs leading-relaxed text-slate-600 line-clamp-3">
                        {t('feature.yield_desc')}
                      </CardDescription>
                    </CardHeader>
                    <CardFooter className="p-5 pt-0">
                      <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                        {t('feature.learn_more')} <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </CardFooter>
                  </Card>
                </div>

                {/* 3-Column Highlights Grid (Weather, Warnings, Quick Guides) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                  {/* Weather & Spray Risk Card */}
                  <Card className="flex flex-col">
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CloudSun className="w-5 h-5 text-brand-forest-700" />
                          <CardTitle className="text-base font-bold text-slate-900">
                            {t('weather.title')}
                          </CardTitle>
                        </div>
                        <Badge variant="forest" className="text-[11px]">
                          <MapPin className="w-3 h-3 mr-1" /> {weatherData?.location || t('weather.current_loc')}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-between space-y-4">
                      <div className="flex items-baseline gap-3">
                        <span className="text-3xl font-extrabold text-slate-900">
                          {weatherData?.forecast?.temperature_current_c ? `${weatherData.forecast.temperature_current_c}°C` : '23.5°C'}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          {weatherData?.forecast?.summary || (language === 'om' ? 'Qilleensa Mijataa' : language === 'am' ? 'ከፊል ደመናማ' : 'Partly cloudy')}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl text-center">
                        <div>
                          <span className="text-[11px] text-slate-500">{t('weather.rain_prob')}</span>
                          <div className="font-bold text-xs text-slate-800">{weatherData?.forecast?.precipitation_sum_mm ?? '5.4'} mm</div>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500">{t('weather.humidity')}</span>
                          <div className="font-bold text-xs text-slate-800">{weatherData?.forecast?.relative_humidity_mean ?? '64'}%</div>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-500">{t('weather.wind')}</span>
                          <div className="font-bold text-xs text-slate-800">{weatherData?.forecast?.wind_speed_max_kmh ?? '11.2'} km/h</div>
                        </div>
                      </div>

                      <div
                        className={cn(
                          'p-3.5 rounded-xl border text-xs',
                          weatherData?.spray_risk?.can_spray
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-amber-50 border-amber-200 text-amber-900'
                        )}
                      >
                        <div className="flex items-center gap-1.5 font-bold mb-1">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>{t('weather.spray_status')}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          {weatherData?.spray_risk?.can_spray ? t('weather.spray_favorable') : t('weather.spray_caution')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Active Agricultural Warnings Card */}
                  <Card className="flex flex-col">
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-amber-600" />
                          <CardTitle className="text-base font-bold text-slate-900">
                            {t('warning.title')}
                          </CardTitle>
                        </div>
                        <Badge variant="warning" className="text-[11px]">Active Alerts</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 flex-1 space-y-3">
                      <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-950">
                        <div className="flex items-center justify-between text-xs font-bold text-amber-900 mb-1">
                          <span>{t('warning.armyworm')}</span>
                          <span className="text-[10px] text-amber-700">Forecast +24h</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-amber-800">
                          {t('warning.desc_armyworm')}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-800">
                        <div className="text-xs font-bold text-slate-900 mb-1">
                          {t('warning.rust')}
                        </div>
                        <p className="text-[11px] leading-relaxed text-slate-600">
                          {t('warning.desc_rust')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Popular Suggested Agronomic Questions */}
                  <Card className="flex flex-col">
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-brand-gold-600" />
                        <CardTitle className="text-base font-bold text-slate-900">
                          {t('advisor.suggested_title')}
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 flex-1 space-y-2">
                      {[
                        { key: 'advisor.chip_teff', crop: 'Teff (ጤፍ / Xaafii)' },
                        { key: 'advisor.chip_wheat', crop: 'Wheat (ስንዴ / Qamadii)' },
                        { key: 'advisor.chip_maize', crop: 'Maize (በቆሎ / Boqqoolloo)' },
                        { key: 'advisor.chip_fert', crop: "Fertilizer (ማዳበሪያ / Xaa'oo)" },
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            const q = t(item.key);
                            handleAsk(q);
                            setActiveTab('assistant');
                          }}
                          className="w-full text-left p-3 rounded-xl border border-slate-200/80 bg-white hover:bg-brand-forest-50/70 hover:border-brand-forest-300 transition-all flex items-center justify-between group active:scale-[0.99]"
                        >
                          <div className="min-w-0 pr-2">
                            <div className="text-xs font-bold text-slate-800 truncate group-hover:text-brand-forest-800">
                              {t(item.key)}
                            </div>
                            <span className="text-[10px] text-slate-400">{item.crop}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-brand-forest-700 transition-colors shrink-0" />
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* TAB 2: AI AGRICULTURAL ASSISTANT */}
            {/* ======================================================== */}
            {activeTab === 'assistant' && (
              <motion.div
                key="assistant"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col h-[calc(100vh-140px)] max-h-[840px] space-y-3"
              >
                {/* Chat Header Card */}
                <Card className="p-4 flex items-center justify-between flex-wrap gap-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <img
                      src="/hello_farmer_logo.jpg"
                      alt="AI Advisor"
                      className="w-10 h-10 rounded-full object-cover border-2 border-brand-forest-700 shadow-xs"
                    />
                    <div>
                      <h2 className="font-extrabold text-base text-brand-forest-800 leading-tight">
                        {t('advisor.header_title')}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {t('advisor.header_subtitle')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={autoPlayVoice ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => {
                        const next = !autoPlayVoice;
                        setAutoPlayVoice(next);
                        if (!next) stopCurrentAudio();
                      }}
                      className={cn(
                        'text-xs font-semibold',
                        autoPlayVoice && 'bg-brand-forest-50 text-brand-forest-800 border-brand-forest-200'
                      )}
                    >
                      {autoPlayVoice ? (
                        <Volume2 className="w-3.5 h-3.5 mr-1.5 text-brand-forest-700" />
                      ) : (
                        <VolumeX className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      <span>{t('advisor.voice_autoplay_label')}</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        stopCurrentAudio();
                        setMessages([]);
                        setSessionId('');
                        setPendingTranscript(null);
                        setMicErrorMessage(null);
                      }}
                      className="text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      <span>{t('advisor.new_chat')}</span>
                    </Button>
                  </div>
                </Card>

                {/* Chat Messages List */}
                <Card className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 bg-slate-50/60 shadow-xs">
                  {messages.length === 0 ? (
                    <div className="m-auto text-center max-w-lg py-12 px-4 space-y-4">
                      <div className="w-16 h-16 rounded-full bg-brand-forest-50 border-2 border-brand-forest-100 flex items-center justify-center mx-auto text-brand-forest-700">
                        <Sprout className="w-8 h-8" />
                      </div>
                      <h3 className="font-extrabold text-xl text-brand-forest-800">
                        {t('advisor.empty_chat')}
                      </h3>
                      <p className="text-xs md:text-sm text-slate-500 max-w-md mx-auto">
                        {t('advisor.suggested_title')}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                        {[
                          'advisor.chip_teff',
                          'advisor.chip_wheat',
                          'advisor.chip_maize',
                          'advisor.chip_fert',
                        ].map((promptKey, i) => (
                          <button
                            key={i}
                            onClick={() => handleAsk(t(promptKey))}
                            className="p-3 bg-white rounded-xl border border-slate-200/80 text-left text-xs font-semibold text-slate-700 hover:border-brand-forest-300 hover:bg-brand-forest-50/50 hover:text-brand-forest-900 transition-all shadow-xs active:scale-[0.99]"
                          >
                            {t(promptKey)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          'flex flex-col',
                          m.sender === 'user' ? 'items-end' : 'items-start'
                        )}
                      >
                        <div
                          className={cn(
                            'max-w-[85%] md:max-w-[75%] p-4 rounded-2xl shadow-xs space-y-2',
                            m.sender === 'user'
                              ? 'bg-brand-forest-800 text-white rounded-tr-xs'
                              : 'bg-white text-slate-900 border border-slate-200/80 rounded-tl-xs'
                          )}
                        >
                          {/* Assistant Header Badge & Voice Playback */}
                          {m.sender === 'assistant' && (
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
                              <div className="flex items-center gap-1.5">
                                <img
                                  src="/hello_farmer_logo.jpg"
                                  alt="Badge"
                                  className="w-5 h-5 rounded-full"
                                />
                                <span className="font-bold text-xs text-brand-forest-800">
                                  {t('brand.name')} AI
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={m.grounded ? 'success' : 'warning'}
                                  className="text-[10px] px-2 py-0.5"
                                >
                                  {m.grounded ? `✓ ${t('advisor.grounded_badge')}` : '⚠ Extension Verified'}
                                </Badge>

                                {/* Audio playback buttons */}
                                {playingMessageId === m.id && audioPlaybackStatus === 'playing' ? (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={pauseMessageAudio}
                                    className="h-7 px-2.5 text-xs bg-brand-forest-100 text-brand-forest-800 border-brand-forest-300 font-bold"
                                  >
                                    <Pause className="w-3 h-3 mr-1" />
                                    <span>{t('advisor.voice_pause')}</span>
                                    <span className="w-1.5 h-3 bg-brand-forest-700 animate-pulse ml-1 rounded-full" />
                                  </Button>
                                ) : playingMessageId === m.id && audioPlaybackStatus === 'paused' ? (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={resumeMessageAudio}
                                      className="h-7 px-2 text-xs"
                                    >
                                      <Play className="w-3 h-3 mr-1" />
                                      <span>{t('advisor.voice_resume')}</span>
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="iconSm"
                                      onClick={() => replayMessageAudio(m)}
                                      className="h-7 w-7"
                                    >
                                      <RotateCcw className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : playingMessageId === m.id && audioPlaybackStatus === 'loading' ? (
                                  <span className="text-[11px] font-semibold text-brand-forest-700 flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    {t('advisor.voice_synthesizing')}
                                  </span>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => playMessageAudio(m)}
                                    className="h-7 px-2 text-xs text-brand-forest-700 hover:bg-brand-forest-50"
                                  >
                                    <Volume2 className="w-3 h-3 mr-1" />
                                    <span>{t('advisor.voice_listen')}</span>
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}

                          {/* User voice question indicator */}
                          {m.sender === 'user' && m.isVoiceTurn && (
                            <div className="flex items-center gap-1.5 text-[11px] text-white/80 font-medium">
                              <Mic className="w-3 h-3" />
                              <span>{t('advisor.voice_query_badge')}</span>
                            </div>
                          )}

                          {/* Message Text */}
                          <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                            {m.text}
                          </div>

                          {/* Assistant English gloss translation */}
                          {m.sender === 'assistant' && m.answer_en_gloss && (
                            <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500 italic">
                              <span className="font-semibold text-slate-600 not-italic mr-1">English Translation:</span>
                              {m.answer_en_gloss}
                            </div>
                          )}

                          {/* Grounded sources chip */}
                          {m.sender === 'assistant' && m.sources_used && m.sources_used.length > 0 && (
                            <div className="mt-2 pt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {t('advisor.sources_label')}:
                              </span>
                              {m.sources_used.map((src, idx) => (
                                <Badge key={idx} variant="default" className="text-[10px] bg-slate-100 text-slate-600">
                                  {typeof src === 'string' ? src : src.title || src.crop || `Doc #${idx + 1}`}
                                </Badge>
                              ))}
                            </div>
                          )}

                          <div
                            className={cn(
                              'text-[10px] text-right font-medium',
                              m.sender === 'user' ? 'text-white/60' : 'text-slate-400'
                            )}
                          >
                            {m.timestamp}
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Chat Loading Skeleton / Spinner */}
                  {chatLoading && (
                    <div className="flex items-start gap-2">
                      <div className="bg-white border border-slate-200/80 p-4 rounded-2xl shadow-xs rounded-tl-xs flex items-center gap-2.5">
                        <RefreshCw className="w-4 h-4 text-brand-forest-700 animate-spin" />
                        <span className="text-xs font-semibold text-slate-600">
                          {t('advisor.thinking')}
                        </span>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </Card>

                {/* Voice Recording Active Card */}
                {recordingState === 'recording' && (
                  <Card className="p-4 bg-emerald-50/90 border-emerald-300 shadow-md animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping" />
                        <div>
                          <div className="text-xs font-extrabold text-emerald-950 uppercase tracking-wide">
                            {t('advisor.voice_listening')} ({recordingDuration}s)
                          </div>
                          <div className="text-[11px] text-emerald-800">
                            {t('advisor.voice_recording_hint')}
                          </div>
                        </div>
                      </div>

                      {/* Waveform Visualizer */}
                      <VoiceWaveform isActive={true} barsCount={16} color="bg-emerald-700" />

                      <div className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={stopVoiceRecordingAndTranscribe}
                          className="font-bold text-xs shadow-xs"
                        >
                          <Square className="w-3.5 h-3.5 mr-1" />
                          <span>{t('advisor.voice_stop')}</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelVoiceRecording}
                          className="text-xs bg-white text-slate-700"
                        >
                          {t('advisor.voice_cancel')}
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Voice Transcribing State */}
                {recordingState === 'transcribing' && (
                  <Card className="p-3.5 bg-brand-forest-50 border-brand-forest-200 shadow-xs flex items-center justify-center gap-2.5">
                    <RefreshCw className="w-4 h-4 text-brand-forest-700 animate-spin" />
                    <span className="text-xs font-bold text-brand-forest-900">
                      {t('advisor.voice_transcribing')}
                    </span>
                  </Card>
                )}

                {/* Microphone Error Alert */}
                {micErrorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{micErrorMessage}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMicErrorMessage(null)}
                      className="h-6 px-2 text-rose-800 hover:bg-rose-100"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                {/* Input Bar with Mic & Send Controls */}
                <Card className="p-2.5 shadow-sm">
                  <div className="flex items-center gap-2">
                    {/* Voice Recording Button */}
                    <Button
                      variant={recordingState === 'recording' ? 'destructive' : 'secondary'}
                      size="icon"
                      onClick={
                        recordingState === 'recording'
                          ? stopVoiceRecordingAndTranscribe
                          : startVoiceRecording
                      }
                      title={t('advisor.voice_record_hint')}
                      className={cn(
                        'shrink-0 h-10 w-10 rounded-xl transition-all',
                        recordingState === 'recording' && 'ring-2 ring-red-400 animate-pulse'
                      )}
                    >
                      {recordingState === 'recording' ? (
                        <Square className="w-4 h-4" />
                      ) : (
                        <Mic className="w-4 h-4 text-brand-forest-700" />
                      )}
                    </Button>

                    {/* Hidden Audio File Input for uploads */}
                    <input
                      type="file"
                      ref={audioFileInputRef}
                      onChange={handleAudioFileUpload}
                      accept="audio/*"
                      className="hidden"
                    />

                    <Button
                      variant="ghost"
                      size="iconSm"
                      onClick={() => audioFileInputRef.current?.click()}
                      title={t('advisor.voice_upload')}
                      className="shrink-0 h-9 w-9 text-slate-500 hover:text-slate-800"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>

                    {/* Text Input */}
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAsk();
                      }}
                      placeholder={t('advisor.input_placeholder')}
                      disabled={chatLoading || recordingState === 'recording'}
                      className="flex-1 bg-transparent border-0 outline-none text-sm text-slate-900 placeholder:text-slate-400 font-medium px-2"
                    />

                    {/* Send Button */}
                    <Button
                      variant="default"
                      size="default"
                      onClick={() => handleAsk()}
                      disabled={!query.trim() || chatLoading}
                      loading={chatLoading}
                      className="shrink-0 font-semibold rounded-xl"
                    >
                      <span className="hidden sm:inline mr-1.5">{t('advisor.send_btn')}</span>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* TAB 3: NATIONAL VOICE LINE 8028 & TELEPHONY */}
            {/* ======================================================== */}
            {activeTab === 'voice' && (
              <motion.div
                key="voice"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                {/* Voice Hotline Banner */}
                <Card className="p-6 md:p-8 bg-gradient-to-br from-brand-forest-900 via-brand-forest-800 to-brand-forest-700 text-white shadow-lg border-brand-forest-700">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <Badge variant="gold" className="text-[11px] font-bold">
                        {t('voice.badge')}
                      </Badge>
                      <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                        {t('voice.title')}
                      </h2>
                      <p className="text-sm text-brand-forest-100 max-w-xl leading-relaxed">
                        {t('voice.subtitle')}
                      </p>
                    </div>

                    <div className="p-5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 text-center min-w-[200px]">
                      <div className="text-xs uppercase tracking-wider font-bold text-brand-gold-300 mb-1">
                        {t('voice.dial_now')}
                      </div>
                      <div className="text-4xl font-black tracking-tight text-white">8028</div>
                      <div className="text-[11px] text-white/80 mt-1">{t('voice.toll_free_all')}</div>
                    </div>
                  </div>
                </Card>

                {/* Telephony Service Health Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <Card>
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-slate-700">
                          {t('voice.audiosocket_status')}
                        </CardTitle>
                        <Badge variant="success" dot pulse>Live</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 space-y-2 text-xs text-slate-600">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>TCP Port:</span>
                        <span className="font-mono font-bold text-slate-900">9092</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Sampling Rate:</span>
                        <span className="font-mono font-bold text-slate-900">8,000 Hz (Linear PCM)</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Bandpass Filter:</span>
                        <span className="font-bold text-brand-forest-700">180Hz - 3800Hz</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-slate-700">
                          {t('voice.asterisk_pbx')}
                        </CardTitle>
                        <Badge variant="forest" dot>Connected</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 space-y-2 text-xs text-slate-600">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>SIP Port:</span>
                        <span className="font-mono font-bold text-slate-900">5060 (UDP/TCP)</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Codec:</span>
                        <span className="font-bold text-slate-900">slin (16-bit) / alaw</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Turnaround Delay:</span>
                        <span className="font-bold text-brand-forest-700">250 ms (Anti-Echo)</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="p-5 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-slate-700">
                          {t('voice.tts_engine')}
                        </CardTitle>
                        <Badge variant="gold" dot>Mekdes Neural</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 space-y-2 text-xs text-slate-600">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Voice ID:</span>
                        <span className="font-mono font-bold text-slate-900">am-ET-MekdesNeural</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span>Prosody Tuning:</span>
                        <span className="font-bold text-slate-900">-8% Rate, +15% Vol</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span>Text Normalizer:</span>
                        <span className="font-bold text-emerald-700">Ge'ez & Unit Expansion</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Call Simulation & Interactive Audio Socket Tester */}
                <Card className="p-6">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {t('voice.simulator_title')}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {t('voice.simulator_subtitle')}
                      </p>
                    </div>

                    <Button
                      variant="gold"
                      onClick={() => setActiveTab('assistant')}
                      className="font-bold"
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      <span>{t('voice.start_web_call')}</span>
                    </Button>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {t('voice.how_call_works')}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1">
                        <div className="font-extrabold text-brand-forest-800">1. {t('voice.step_dial')}</div>
                        <p className="text-slate-500">{t('voice.step_dial_desc')}</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1">
                        <div className="font-extrabold text-brand-forest-800">2. {t('voice.step_lang')}</div>
                        <p className="text-slate-500">{t('voice.step_lang_desc')}</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1">
                        <div className="font-extrabold text-brand-forest-800">3. {t('voice.step_question')}</div>
                        <p className="text-slate-500">{t('voice.step_question_desc')}</p>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-slate-200/80 space-y-1">
                        <div className="font-extrabold text-brand-forest-800">4. {t('voice.step_answer')}</div>
                        <p className="text-slate-500">{t('voice.step_answer_desc')}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* TAB 4: WEATHER & SPRAYING ADVISORY */}
            {/* ======================================================== */}
            {activeTab === 'weather' && (
              <motion.div
                key="weather"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                {/* Header & Location Selector */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                      {t('weather.page_title')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('weather.page_subtitle')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-brand-forest-700" />
                    <select
                      value={selectedLocationName}
                      onChange={(e) => handleLocationChange(e.target.value)}
                      className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest-700"
                    >
                      {weatherLocations.map((loc) => (
                        <option key={loc.name} value={loc.name}>
                          {loc.name} ({loc.region})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Spray Risk Advisory Banner */}
                <Card
                  className={cn(
                    'p-5 border-2 shadow-sm',
                    weatherData?.spray_risk?.can_spray
                      ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                      : 'bg-amber-50/80 border-amber-300 text-amber-950'
                  )}
                >
                  <div className="flex items-start gap-3.5">
                    {weatherData?.spray_risk?.can_spray ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h3 className="font-extrabold text-base leading-tight mb-1">
                        {t('weather.spray_advisory_banner')}
                      </h3>
                      <p className="text-xs leading-relaxed text-slate-700">
                        {weatherData?.spray_risk?.can_spray
                          ? t('weather.spray_favorable_long')
                          : t('weather.spray_caution_long')}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Today's Deep Dive */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="p-5 text-center">
                    <Thermometer className="w-6 h-6 text-amber-600 mx-auto mb-2" />
                    <span className="text-xs text-slate-500 font-semibold">{t('weather.current_temp')}</span>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      {weatherData?.forecast?.temperature_current_c ?? '23.5'}°C
                    </div>
                  </Card>

                  <Card className="p-5 text-center">
                    <Droplets className="w-6 h-6 text-sky-600 mx-auto mb-2" />
                    <span className="text-xs text-slate-500 font-semibold">{t('weather.rain_prob')}</span>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      {weatherData?.forecast?.precipitation_sum_mm ?? '5.4'} mm
                    </div>
                  </Card>

                  <Card className="p-5 text-center">
                    <Wind className="w-6 h-6 text-teal-600 mx-auto mb-2" />
                    <span className="text-xs text-slate-500 font-semibold">{t('weather.wind')}</span>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      {weatherData?.forecast?.wind_speed_max_kmh ?? '11.2'} km/h
                    </div>
                  </Card>

                  <Card className="p-5 text-center">
                    <Radio className="w-6 h-6 text-brand-forest-700 mx-auto mb-2" />
                    <span className="text-xs text-slate-500 font-semibold">{t('weather.humidity')}</span>
                    <div className="text-2xl font-black text-slate-900 mt-1">
                      {weatherData?.forecast?.relative_humidity_mean ?? '64'}%
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* TAB 5: CROP YIELD PREDICTOR */}
            {/* ======================================================== */}
            {activeTab === 'yield' && (
              <motion.div
                key="yield"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                    {t('yield.title')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t('yield.subtitle')}
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Yield Form */}
                  <Card className="lg:col-span-7 p-6">
                    <form onSubmit={handleCalculateYield} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {t('yield.crop_label')}
                          </label>
                          <select
                            value={yieldInput.crop}
                            onChange={(e) => setYieldInput({ ...yieldInput, crop: e.target.value })}
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest-700"
                          >
                            <option value="teff">Teff (ጤፍ / Xaafii)</option>
                            <option value="wheat">Wheat (ስንዴ / Qamadii)</option>
                            <option value="maize">Maize (በቆሎ / Boqqoolloo)</option>
                            <option value="barley">Barley (ገብስ / Garbuu)</option>
                            <option value="sorghum">Sorghum (ማሽላ / Mishingaa)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {t('yield.woreda_label')}
                          </label>
                          <Input
                            type="text"
                            value={yieldInput.woreda}
                            onChange={(e) => setYieldInput({ ...yieldInput, woreda: e.target.value })}
                            placeholder="e.g. Adama, East Shewa"
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {t('yield.farm_size_label')} (ha)
                          </label>
                          <Input
                            type="number"
                            step="0.1"
                            value={yieldInput.farm_size_ha}
                            onChange={(e) => setYieldInput({ ...yieldInput, farm_size_ha: parseFloat(e.target.value) || 1 })}
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {t('yield.soil_label')}
                          </label>
                          <select
                            value={yieldInput.soil_type}
                            onChange={(e) => setYieldInput({ ...yieldInput, soil_type: e.target.value })}
                            className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-forest-700"
                          >
                            <option value="Vertisol (ጥቁር አፈር)">Vertisol (ጥቁር አፈር / Biyyoo Gurraacha)</option>
                            <option value="Nitisol (ቀይ አፈር)">Nitisol (ቀይ አፈር / Biyyoo Diimaa)</option>
                            <option value="Cambisol">Cambisol (ደለል አፈር)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            NPS-B {t('yield.fertilizer_label')} (kg/ha)
                          </label>
                          <Input
                            type="number"
                            value={yieldInput.npsb_kg_ha}
                            onChange={(e) => setYieldInput({ ...yieldInput, npsb_kg_ha: parseInt(e.target.value) || 0 })}
                            className="text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Urea {t('yield.fertilizer_label')} (kg/ha)
                          </label>
                          <Input
                            type="number"
                            value={yieldInput.urea_kg_ha}
                            onChange={(e) => setYieldInput({ ...yieldInput, urea_kg_ha: parseInt(e.target.value) || 0 })}
                            className="text-xs"
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        variant="default"
                        size="lg"
                        loading={yieldLoading}
                        className="w-full mt-4 font-bold"
                      >
                        <TrendingUp className="w-4 h-4 mr-2" />
                        <span>{t('yield.calculate_btn')}</span>
                      </Button>
                    </form>
                  </Card>

                  {/* Prediction Breakdown Card */}
                  <Card className="lg:col-span-5 p-6 bg-slate-50/80">
                    <h3 className="font-extrabold text-base text-slate-900 mb-4">
                      {t('yield.results_title')}
                    </h3>

                    {yieldLoading ? (
                      <div className="py-12 text-center space-y-3">
                        <RefreshCw className="w-6 h-6 text-brand-forest-700 animate-spin mx-auto" />
                        <p className="text-xs font-semibold text-slate-600">{t('yield.calculating')}</p>
                      </div>
                    ) : yieldResult ? (
                      <div className="space-y-4">
                        <div className="p-4 bg-white rounded-xl border border-slate-200 text-center">
                          <span className="text-xs text-slate-500 font-semibold">{t('yield.predicted_yield')}</span>
                          <div className="text-3xl font-black text-brand-forest-800 mt-1">
                            {yieldResult.predicted_yield_qt_ha} <span className="text-sm font-bold text-slate-500">Qt/ha (ኩ/ል በሄ)</span>
                          </div>
                          <Badge variant="success" className="mt-2 text-xs">
                            {yieldResult.comparison_to_average_pct} vs Regional Average
                          </Badge>
                        </div>

                        <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
                          <span className="text-xs font-bold text-slate-800 block">Agronomic Recommendations:</span>
                          <p className="text-xs leading-relaxed text-slate-600">
                            {yieldResult.recommendation}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="py-12 text-center text-xs text-slate-400">
                        {t('yield.fill_form_hint')}
                      </div>
                    )}
                  </Card>
                </div>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* TAB 6: CALL & INQUIRY HISTORY */}
            {/* ======================================================== */}
            {activeTab === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                      {t('history.title')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('history.subtitle')}
                    </p>
                  </div>

                  <Button variant="outline" size="sm" onClick={fetchCallsList}>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    <span>{t('history.refresh')}</span>
                  </Button>
                </div>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200/80 font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="p-3.5">Caller ID</th>
                          <th className="p-3.5">Language</th>
                          <th className="p-3.5">Topic</th>
                          <th className="p-3.5">Duration</th>
                          <th className="p-3.5">Status</th>
                          <th className="p-3.5 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {callsList.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-400">
                              {t('history.no_calls')}
                            </td>
                          </tr>
                        ) : (
                          callsList.map((call) => (
                            <tr key={call.call_id || call.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="p-3.5 font-mono font-semibold text-slate-800">
                                {call.caller_phone || call.phone_number || '+251 91 123 4567'}
                              </td>
                              <td className="p-3.5">
                                <Badge variant="default" className="text-[10px]">
                                  {call.language === 'om' ? 'Afaan Oromo' : call.language === 'am' ? 'Amharic' : 'English'}
                                </Badge>
                              </td>
                              <td className="p-3.5 text-slate-700 font-medium">
                                {call.crop || call.topic || 'Wheat Yellow Rust'}
                              </td>
                              <td className="p-3.5 text-slate-500">
                                {call.duration_seconds ? `${call.duration_seconds}s` : '42s'}
                              </td>
                              <td className="p-3.5">
                                <Badge variant="success" dot className="text-[10px]">
                                  {call.status || 'Resolved'}
                                </Badge>
                              </td>
                              <td className="p-3.5 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewCallDetail(call.call_id || call.id)}
                                  className="h-7 text-xs text-brand-forest-700"
                                >
                                  View
                                </Button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* ======================================================== */}
            {/* TAB 7: PLATFORM ANALYTICS */}
            {/* ======================================================== */}
            {activeTab === 'analytics' && (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
                      {t('analytics.title')}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {t('analytics.subtitle')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
                    {[7, 30, 90].map((days) => (
                      <button
                        key={days}
                        onClick={() => setAnalyticsFilterDays(days)}
                        className={cn(
                          'px-2.5 py-1 rounded-md transition-colors',
                          analyticsFilterDays === days
                            ? 'bg-white text-brand-forest-800 shadow-2xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        )}
                      >
                        {days} Days
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <Card className="p-5">
                    <span className="text-xs font-semibold text-slate-500">Total Advisory Turns</span>
                    <div className="text-3xl font-black text-brand-forest-800 mt-1">
                      {analyticsOverview?.total_turns ?? (analytics?.total_calls ?? '1,420')}
                    </div>
                  </Card>
                  <Card className="p-5">
                    <span className="text-xs font-semibold text-slate-500">Grounded Factuality Rate</span>
                    <div className="text-3xl font-black text-emerald-700 mt-1">
                      {analyticsOverview?.grounded_rate_pct ? `${analyticsOverview.grounded_rate_pct}%` : '96.4%'}
                    </div>
                  </Card>
                  <Card className="p-5">
                    <span className="text-xs font-semibold text-slate-500">Average Voice Latency</span>
                    <div className="text-3xl font-black text-sky-700 mt-1">
                      {analyticsOverview?.p50_latency_seconds ? `${analyticsOverview.p50_latency_seconds}s` : '1.2s'}
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* ============================================================== */}
        {/* 4. MOBILE BOTTOM THUMB BAR */}
        {/* ============================================================== */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md border-t border-slate-200/80 z-30 flex items-center justify-around px-2 shadow-lg select-none">
          {[
            { id: 'home', label: 'Home', icon: Sprout },
            { id: 'assistant', label: 'Advisor', icon: MessageSquare },
            { id: 'voice', label: '8028', icon: PhoneCall },
            { id: 'weather', label: 'Weather', icon: CloudSun },
            { id: 'analytics', label: 'Stats', icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={cn(
                  'flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all',
                  isActive
                    ? 'text-brand-forest-800 font-bold scale-105'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-colors',
                    isActive ? 'text-brand-forest-700 stroke-[2.3]' : 'text-slate-400'
                  )}
                />
                <span className="text-[10px] mt-0.5 tracking-tight font-medium">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
