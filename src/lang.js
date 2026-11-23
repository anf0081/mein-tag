export const LANGUAGES = { de: 'Deutsch', en: 'English', pt: 'Português' };
export const langName = (profile) => LANGUAGES[profile?.language] || LANGUAGES.de;
