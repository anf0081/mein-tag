// Flexible Onboarding-Bereiche. Claude führt sie nacheinander als lockeres Gespräch.
export const SECTIONS = [
  { id: 'basics', title: 'Basics', goal: 'Ihr Name, Wohnort (für Wetter), bevorzugte Uhrzeit für den Morgenbrief, Sprache/Ton, wie sie dich nennen möchte (assistant_name), und ob du lieber weiblich, männlich oder divers sein sollst (update_profile assistant_gender: f|m|d). Erwähne kurz, dass sie unter „Über dich“ ein Profilbild für sich und eins für dich hochladen kann.' },
  { id: 'ueber_dich', title: 'Über dich', goal: 'Lerne sie persönlich kennen, damit du alles auf sie zuschneiden kannst: ihr eigener Geburtstag (update_profile birthday), was sie beruflich macht oder gerade aufbaut, was ihr Freude und Kraft gibt, Werte oder Praxis (z. B. spirituell), Lieblingsdinge (Essen, Musik, Orte), was ihr im Alltag schwerfällt und wobei Unterstützung wirklich hilft, wie sie angesprochen werden möchte. Frag neugierig und locker, höchstens 2 Fragen pro Nachricht, nichts davon ist Pflicht. Speichere alles in update_profile about_me als Stichpunkte (immer der vollständige Text inkl. bisheriger Punkte).' },
  { id: 'tagesablauf', title: 'Tagesablauf', goal: 'Typischer Tag und Woche: feste Zeiten, Arbeitsblöcke, Fokuszeiten, Zeiten die tabu sind. Speichere als profile.daily_schedule.' },
  { id: 'menschen', title: 'Wichtige Menschen & Geburtstage', goal: 'Frag aktiv nach den wichtigsten Geburtstagen: Kinder, Eltern, Geschwister, Partner, enge Freundinnen und Freunde, Patenkinder. Pro Person: Name, Beziehung, Geburtstag (Jahr optional, dann kann ich das Alter sagen) und ob sie ein Geschenk bekommt (gift, dann frag, wie viele Tage vorher es wegen Versand besorgt werden muss), eine Karte/Nachricht (card) oder nur einen Anruf (call). Gern auch Geschenkideen als notes. Sammle in Runden von 3 bis 5 Personen und frag danach, ob noch jemand fehlt. Speichere jede Person sofort mit upsert_person. Erkläre kurz, dass ich rechtzeitig erinnere und Aufgaben dafür auch in Google Aufgaben anlege.' },
  { id: 'ziele_routinen', title: 'Ziele, Routinen & Hobbys', goal: 'Was ist ihr wirklich wichtig? Höhere Ziele und Werte, Praktiken, Routinen (z. B. morgens/abends), Hobbys und Dinge, die sie gern kultivieren oder wieder aufnehmen würde. Pro Punkt: Warum ist es ihr wichtig, wie oft/wie lange, bevorzugte Tageszeit, was steht im Weg. Speichere mit upsert_entity (kind="ziel" | "routine" | "hobby"); feste Rhythmen zusätzlich mit add_recurring. Zeige echtes Interesse, frag nach dem Warum, aber dräng nicht. Ziel ist, diese Dinge realistisch in den Tagesplan einzubauen.' },
  { id: 'kinder', title: 'Kinder & Familie', goal: 'Gibt es Kinder? Pro Kind: Name, Alter/Geburtstag, Schule/Betreuung, feste Termine, wiederkehrende Aufgaben. Nutze upsert_entity (kind="kind") und upsert_person für Geburtstage.' },
  { id: 'tiere', title: 'Haustiere & Tiere', goal: 'Gibt es Haustiere oder Nutztiere (Hund, Hühner, ...)? Pro Tier/Gruppe: Name/Art, Futter (wie lange reicht ein Sack), Pflege (z. B. Stall ausmisten), Tierarzt/Impfungen. Lege wiederkehrende Aufgaben mit add_recurring an. Nutze upsert_entity (kind="tier").' },
  { id: 'zuhause_land', title: 'Zuhause & Land', goal: 'Wohnung, Haus, Garten, Grundstück, laufende Projekte, regelmäßige Aufgaben je Jahreszeit, offene Todos. Nutze upsert_entity (kind="ort") sowie add_todo/add_recurring.' },
  { id: 'feste', title: 'Feiertage & Feste', goal: 'Welche Feiertage/Feste sind wichtig (Weihnachten, Ostern, Jahrestage, ...)? Was muss jeweils vorbereitet werden und wie früh? Nutze upsert_holiday mit lead_days.' },
  { id: 'gesundheit', title: 'Gesundheit & Vorsorge', goal: 'Welche Arzt-/Vorsorgetermine gibt es regelmäßig (Zahnarzt, Kontrolle, Impfungen, ...)? Wann war der letzte? Schlage übliche Intervalle als VORSCHLAG vor und lege nur nach Bestätigung add_recurring an. Keine medizinischen Ratschläge, nur Terminerinnerungen.' },
  { id: 'reisen', title: 'Reisen & Packen', goal: 'Anstehende Flüge/Reisen (Datum, Ziel), Packgewohnheiten, Standard-Packliste. Nutze upsert_trip.' },
  { id: 'news_brief', title: 'Nachrichten & Brief', goal: 'Welche Themen sollen im Morgenbrief als kurze Nachrichten vorkommen (news_topics)? Wie ausführlich? Erwähne, dass sie jederzeit per Chat Feedback geben kann und du dazulernst.' },
];

export function onboardingPrompt(state) {
  const done = state.onboarding.sections;
  const open = SECTIONS.filter((s) => !done[s.id]);
  const list = SECTIONS.map((s) => `- ${done[s.id] ? '[x]' : '[ ]'} ${s.id}: ${s.title}`).join('\n');
  const next = open[0];
  return `ONBOARDING LÄUFT (noch nicht abgeschlossen).
Bereiche:
${list}

Vorgehen: Immer EIN Bereich nach dem anderen, kurze Fragen (max. 2 pro Nachricht), locker und warm, im Ton deiner Persönlichkeit. Wenn die Person Details nennt, speichere sie SOFORT mit den Tools. Wenn ein Bereich nicht zutrifft oder sie ihn überspringen will, ist das völlig okay: markiere ihn trotzdem mit complete_onboarding_section.
Wenn ein Bereich fertig ist, rufe complete_onboarding_section auf und leite zum nächsten über.
${next ? `Aktueller Bereich: ${next.id} (${next.title}). Ziel: ${next.goal}` : 'Alle Bereiche sind durch: rufe finish_onboarding auf und fasse kurz zusammen, was du weißt und wie der Alltag mit dir funktioniert (Morgenbrief, Chat-Befehle, Feedback).'}
${state.onboarding.started ? '' : 'Das ist die allererste Nachricht: begrüße die Person herzlich, erkläre in 2–3 Sätzen was du kannst und starte mit Bereich basics.'}`;
}
