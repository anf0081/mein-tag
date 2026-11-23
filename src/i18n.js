// Feste Texte, die der Server selbst schreibt (Benachrichtigungen, Hinweise im Chat), in der eingestellten Sprache.
const T = {
  'Erinnerung': { en: 'Reminder', pt: 'Lembrete' },
  'Fokus-Check': { en: 'Focus check', pt: 'Verificação de foco' },
  'Wie läuft es? Tippe zum Antworten.': { en: 'How is it going? Tap to reply.', pt: 'Como está a correr? Toca para responder.' },
  'Jetzt dran': { en: 'Up now', pt: 'Agora' },
  'Heute fällig': { en: 'Due today', pt: 'Para hoje' },
  'Überfällig': { en: 'Overdue', pt: 'Atrasado' },
  'überfällig': { en: 'overdue', pt: 'atrasado' },
  'Abend-Check-in': { en: 'Evening check-in', pt: 'Check-in da noite' },
  'Wie war dein Tag? Tippe zum Öffnen.': { en: 'How was your day? Tap to open.', pt: 'Como foi o teu dia? Toca para abrir.' },
  'Deine Woche': { en: 'Your week', pt: 'A tua semana' },
  'Kurze Wochenplanung. Tippe zum Öffnen.': { en: 'Quick weekly planning. Tap to open.', pt: 'Planeamento semanal rápido. Toca para abrir.' },
  'Warnung': { en: 'Warning', pt: 'Aviso' },
  'Unwetterwarnung': { en: 'Weather warning', pt: 'Aviso meteorológico' },
  'weitere': { en: 'more', pt: 'mais' },
  'und': { en: 'and', pt: 'e' },
  'Guten Morgen': { en: 'Good morning', pt: 'Bom dia' },
  'Dein Tagesplan ist da. Tippe zum Öffnen.': { en: 'Your day plan is ready. Tap to open.', pt: 'O teu plano do dia está pronto. Toca para abrir.' },
  'Benachrichtigungen funktionieren.': { en: 'Notifications are working.', pt: 'As notificações funcionam.' },
};
/** Übersetzer für die Sprache aus dem Profil. */
export const L = (state) => (de) => T[de]?.[state?.profile?.language] ?? de;
