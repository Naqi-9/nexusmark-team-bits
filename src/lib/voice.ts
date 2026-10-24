/** Pure helpers for the voice assistant (kept free of browser APIs so they can be unit tested). */

export type VoiceTarget = 'content_calendar' | 'content_studio' | 'content_library' | 'deliverables';

export type VoiceCommand =
  | { type: 'navigate'; target: VoiceTarget; label: string }
  | { type: 'stop' }
  | { type: 'none' };

const OPEN = /\b(open|go to|show( me)?|take me to|switch to|launch)\b/i;

/**
 * Recognises a short spoken navigation command. Anything longer or not matching goes to the AI as a normal question.
 * Only matches short utterances so a real question that mentions "calendar" is never hijacked.
 */
export function parseVoiceCommand(transcript: string): VoiceCommand {
  const t = (transcript || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return { type: 'none' };
  if (/^(stop|stop listening|stop voice|end voice|goodbye|good bye|that is all|that's all|cancel)$/.test(t)) return { type: 'stop' };
  if (t.split(' ').length > 8) return { type: 'none' };
  if (OPEN.test(t)) {
    if (/\bcalendar\b/.test(t)) return { type: 'navigate', target: 'content_calendar', label: 'Content Calendar' };
    if (/\b(studio|magic design|design)\b/.test(t)) return { type: 'navigate', target: 'content_studio', label: 'Content Studio' };
    if (/\blibrary\b/.test(t)) return { type: 'navigate', target: 'content_library', label: 'Content Library' };
    if (/\b(deliverables?|saved)\b/.test(t)) return { type: 'navigate', target: 'deliverables', label: 'Deliverables' };
  }
  return { type: 'none' };
}

export const VOICE_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'ur-PK', label: 'Urdu (Pakistan)' },
  { code: 'hi-IN', label: 'Hindi' },
  { code: 'ar-SA', label: 'Arabic' },
  { code: 'es-ES', label: 'Spanish' },
  { code: 'fr-FR', label: 'French' },
] as const;
