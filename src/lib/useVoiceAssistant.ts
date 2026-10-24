import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browser voice assistant: speech-to-text (Web Speech API) and text-to-speech (speechSynthesis).
 * No API key and no server cost. Works in Chrome, Edge and Safari over HTTPS or localhost.
 * Firefox has no speech recognition, so `supported` is false there and the UI hides the microphone.
 */
type SpeechRecognitionLike = {
  lang: string; continuous: boolean; interimResults: boolean;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null; onstart: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow the microphone in your browser address bar and try again.',
  'service-not-allowed': 'Microphone access was blocked. Allow the microphone in your browser address bar and try again.',
  'audio-capture': 'No microphone was found on this device.',
  network: 'Speech recognition needs an internet connection.',
  'language-not-supported': 'This browser does not support speech recognition for the selected language.',
};

export function useVoiceAssistant(opts: { lang: string; onFinalTranscript: (text: string) => void }) {
  const { lang } = opts;
  const onFinalRef = useRef(opts.onFinalTranscript);
  onFinalRef.current = opts.onFinalTranscript;

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListening = useRef(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = Boolean(getRecognitionCtor());
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const stop = useCallback(() => {
    wantListening.current = false;
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false); setInterim('');
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) { setError('Voice input is not supported in this browser. Use Chrome, Edge or Safari.'); return; }
    if (wantListening.current) return;
    setError(null);
    // Do not listen to our own voice.
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);

    const rec = new Ctor();
    rec.lang = lang; rec.continuous = false; rec.interimResults = true;
    let finalText = '';
    rec.onstart = () => { setListening(true); };
    rec.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interimText += r[0].transcript;
      }
      setInterim(interimText || finalText);
    };
    rec.onerror = (e: any) => {
      if (e?.error === 'no-speech' || e?.error === 'aborted') return;
      wantListening.current = false;
      setError(ERROR_TEXT[e?.error] || 'Voice input stopped unexpectedly. Please try again.');
    };
    rec.onend = () => {
      const heard = finalText.trim();
      wantListening.current = false;
      setListening(false); setInterim('');
      if (heard) onFinalRef.current(heard);
    };
    recRef.current = rec;
    wantListening.current = true;
    try { rec.start(); } catch { wantListening.current = false; setError('Could not start the microphone. Please try again.'); }
  }, [lang, ttsSupported]);

  const cancelSpeech = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [ttsSupported]);

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (!ttsSupported || !text.trim()) { onDone?.(); return; }
    window.speechSynthesis.cancel();
    // Long replies are spoken in sentence-sized chunks; some browsers cut off long utterances.
    const chunks = text.match(/[^.!?\n]+[.!?]*/g)?.map(c => c.trim()).filter(Boolean) || [text];
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase() === lang.toLowerCase()) || voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    setSpeaking(true);
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = lang; if (voice) u.voice = voice; u.rate = 1;
      if (i === chunks.length - 1) {
        u.onend = () => { setSpeaking(false); onDone?.(); };
        u.onerror = () => { setSpeaking(false); onDone?.(); };
      }
      window.speechSynthesis.speak(u);
    });
  }, [lang, ttsSupported]);

  useEffect(() => () => {
    wantListening.current = false;
    try { recRef.current?.abort(); } catch { /* ignore */ }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  return { supported, ttsSupported, listening, interim, speaking, error, start, stop, speak, cancelSpeech, clearError: () => setError(null) };
}
