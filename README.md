# Mein Tag

**Eine persönliche KI-Assistenz für deinen Alltag – selbst gehostet, als installierbare Android-Web-App.**

*English summary: Mein Tag is a self-hosted personal assistant PWA (UI in German, English and Portuguese). You chat with it like with a friend; it manages to-dos, routines, birthdays, trips and goals, syncs with Google Calendar and Google Tasks, and sends you a morning brief with your day plan, weather and news via push notification. Runs on Node.js 22+ with zero npm dependencies. Uses Claude (Anthropic) or DeepSeek as the AI.*

---

Du chattest mit deiner Assistenz wie mit einer guten Freundin: warm, mit Humor, aber sachlich und auf Augenhöhe. Sie kennt deine Termine, Aufgaben, Fristen, Routinen, Geburtstage (Geschenk, Karte oder Anruf?), Reisen und Packlisten, Arzttermine, Haustiere und deine Ziele, Hobbys und Gewohnheiten. Jeden Morgen bekommst du einen Brief mit allem, was heute ansteht.

## Funktionen

- **Chat** mit Onboarding, das dich Schritt für Schritt kennenlernt (Abschnitte für Kinder, Tiere, Zuhause usw. lassen sich überspringen). Alles lässt sich per Nachricht eintragen und ändern, auch per Spracheingabe.
- **Morgenbrief** als Push: Wetter von heute, Top 3, alle Termine und Aufgaben des Tages, Tagesplan, ein kurzer Blick auf deine Ziele und Routinen, eine Vorausschau und Nachrichten (Welt, Deutschland, Portugal – übersetzt in deine Sprache). Mit 👍/👎 lernt die Assistenz deinen Stil.
- **Übersicht** mit Tagesansicht (vor- und zurückblättern, Abgehaktes bleibt bis zum nächsten Tag sichtbar), Aufgaben der nächsten 7 Tage samt fälliger Routinen, „Später“, „Ohne Datum“, allen Routinen und erledigten Aufgaben. Alles lässt sich bearbeiten, Rückgängig per Strg/Cmd+Z.
- **Begleitung**: Erinnerungen zu einer Uhrzeit, Hinweise zu fälligen Aufgaben, Abend-Check-in, Wochenplanung, Fokus-Modus.
- **Google Kalender** (lesen, anlegen, ändern, löschen) und **Google Aufgaben** (Zwei-Wege-Sync mit „Alle Aufgaben“ plus Liste „Heute“ für das Homescreen-Widget).
- **Alles nach deinem Ort**: Stellst du deinen Ort ein, richten sich Wetter, Unwetterwarnungen, Feiertage, Zeitzone und die Nachrichten des Landes automatisch danach.
- **Wetter** für deinen Ort und weitere Orte (open-meteo.com, kostenlos).
- **Feiertage**: Portugal inkl. Madeira/Azoren und einiger Gemeinden, Deutschland bundesweit, alle anderen Länder landesweit über [date.nager.at](https://date.nager.at).
- **Unwetterwarnungen** als Push, jeweils vom zuständigen Wetterdienst:
  - Deutschland: DWD (über die freie [Bright-Sky-API](https://brightsky.dev), genau für den Ort)
  - Portugal: IPMA (Festland nach Bezirk, Madeira, Porto Santo)
  - USA: National Weather Service (genau für den Ort)
  - Vereinigtes Königreich: Met Office (nach Region)
  - Österreich, Schweiz, Luxemburg, Belgien, Irland und weitere europäische Länder: [MeteoAlarm](https://meteoalarm.org) (nach dem Namen der Region)
  - Brasilien: INMET (nach Bundesstaat, noch experimentell)
- **Nachrichten**: die großen öffentlichen Nachrichtenangebote der deutsch-, englisch- und portugiesischsprachigen Länder (tagesschau, ORF, SRF, RTP, g1, Agência Brasil, BBC, RTÉ, NPR, CBC, ABC, RNZ, DW), automatisch passend zu deinem Land. Weitere Quellen aus der Liste oder beliebige eigene RSS-Feeds lassen sich unter **Über dich** hinzufügen.
- **KI-Anbieter** in der App umschaltbar: Claude (Anthropic) oder DeepSeek, Modell pro Aufgabe wählbar, Kostenübersicht pro Monat.
- **Datenschutz**: Alle Daten liegen in einer Datei auf deinem Server. Tägliches Backup, Löschen auf Knopfdruck.

**Sprachen:** Deutsch, Englisch und Portugiesisch. Die Sprache unter **Über dich** gilt für die Oberfläche, die Assistenz und die Benachrichtigungen. Vor dem Login richtet sich die Oberfläche nach der Sprache des Browsers.

## Was du brauchst

- Einen kleinen Linux-Server (z. B. Ubuntu-VPS) mit **Node.js 22+**
- Eine **(Sub-)Domain** mit HTTPS (Push-Benachrichtigungen funktionieren nur über HTTPS)
- Einen API-Schlüssel von **Anthropic** ([console.anthropic.com](https://console.anthropic.com)) oder **DeepSeek** ([platform.deepseek.com](https://platform.deepseek.com))
- Optional: ein Google-Konto für Kalender und Aufgaben

Die App ist für **eine Person pro Installation** gedacht (ein Passwort, ein Profil). Wer sie nutzen möchte, installiert sich eine eigene Instanz.

## Installation auf einem Server (Ubuntu)

1. **Code holen und installieren**
   ```bash
   sudo apt-get install -y git rsync
   git clone https://github.com/anf0081/mein-tag.git
   cd mein-tag
   bash deploy/install.sh
   ```
   Das Skript legt einen Systembenutzer `meintag` an, kopiert die App nach `/opt/meintag` und richtet den Dienst ein.

2. **Einstellungen**: `sudo nano /opt/meintag/.env`
   Mindestens: `APP_PASSWORD` (lang und zufällig) und `ANTHROPIC_API_KEY` *oder* `AI_PROVIDER=deepseek` mit `DEEPSEEK_API_KEY`. Für die Datenschutzseite außerdem `PRIVACY_OPERATOR` und `PRIVACY_CONTACT`.
   Danach: `sudo systemctl restart meintag`

3. **HTTPS**
   - Mit **Caddy** (holt das Zertifikat automatisch):
     ```bash
     sudo apt-get install -y caddy
     sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
     sudo nano /etc/caddy/Caddyfile   # Domain eintragen
     sudo systemctl reload caddy
     ```
   - Läuft schon **nginx**: `deploy/nginx-meintag.conf` nach `/etc/nginx/sites-available/` kopieren, Domain eintragen, aktivieren, dann `sudo certbot --nginx -d deine-domain`.
   - Ports 80 und 443 öffnen, Port 8080 bleibt zu.

4. **Auf dem Handy installieren**: In Chrome deine Domain öffnen, anmelden, Menü ⋮ → **App installieren**. Unter **Über dich** die Benachrichtigungen einschalten und das Onboarding im Chat starten.

**Update**: `cd mein-tag && git pull && bash deploy/install.sh` – deine `.env` und deine Daten in `/opt/meintag/data` bleiben erhalten.

**Logs**: `sudo journalctl -u meintag -f`

**Backup wiederherstellen**: Die App legt täglich ein Backup in `/opt/meintag/data/backups/` ab (14 Tage). `sudo systemctl stop meintag`, gewünschte Datei nach `/opt/meintag/data/state.json` kopieren, `sudo chown meintag:meintag` darauf, `sudo systemctl start meintag`.

## Google Kalender und Aufgaben verbinden

In der App unter **Über dich → Verbunden → Verbinden**. Der Dialog führt durch die einmalige Einrichtung in der [Google Cloud Console](https://console.cloud.google.com):

1. Projekt anlegen, **Google Calendar API** und **Google Tasks API** aktivieren.
2. OAuth-Zustimmungsbildschirm einrichten (Typ „Extern“) und die App veröffentlichen, damit die Verbindung nicht nach 7 Tagen abläuft. Als Datenschutz-Link kannst du `https://deine-domain/datenschutz` angeben.
3. Anmeldedaten → OAuth-Client vom Typ **Webanwendung** mit der Weiterleitungs-Adresse, die dir die App anzeigt.
4. Client-ID und Clientschlüssel in der App einfügen, „Weiter zu Google“, Zugriff erlauben.

Die Warnung „Google hat diese App nicht überprüft“ ist bei einer eigenen App normal: *Erweitert → Weiter zu …*.

Für das Homescreen-Widget nimmst du das **Google-Aufgaben-Widget** und wählst die Liste „Heute“.

## Lokal ausprobieren

```bash
cp .env.example .env     # APP_PASSWORD, API-Schlüssel; dazu COOKIE_SECURE=0 und TRUST_PROXY=0
npm start                # http://127.0.0.1:8080
npm run cli              # Chat im Terminal
npm test                 # Tests (ohne Netzwerk)
```

## Kosten

Die KI wird nach Verbrauch abgerechnet. Mit DeepSeek sind das typischerweise wenige Cent bis ein, zwei Euro im Monat, mit Claude Sonnet etwas mehr. Die App zeigt die geschätzten Kosten unter **Über dich**. Wetter, Nachrichten, Warnungen und Push sind kostenlos.

## Datenschutz und Sicherheit

- Alle Daten liegen in `data/state.json` auf deinem Server (Dateirechte 600). API-Schlüssel, die du in der App einträgst, werden dort gespeichert und nie wieder an den Browser zurückgegeben.
- Chat-Inhalte gehen an den gewählten KI-Anbieter, Kalender- und Aufgabendaten an Google. Ortskoordinaten gehen an open-meteo.com (Wetter, Ortssuche) sowie – je nach Land – an api.brightsky.dev (DWD) oder api.weather.gov (NWS). Bei den übrigen Warndiensten, Nachrichten und Feiertagen werden nur allgemeine Listen abgerufen.
- Zugang per Passwort, Sitzung 90 Tage, Login-Versuche begrenzt. Auf dem Sperrbildschirm steht nur ein neutraler Text.
- Die Datenschutzseite unter `/datenschutz` füllt sich aus `PRIVACY_OPERATOR`, `PRIVACY_CONTACT` und `PRIVACY_SERVER_LOCATION` in der `.env`.
- Committe niemals deine `.env` oder den Ordner `data/` (beides steht in `.gitignore`).

## Aufbau

Keine npm-Abhängigkeiten, nur Node.js-Bordmittel.

| Datei | Aufgabe |
|---|---|
| `src/index.js` | Start, Migrationen |
| `src/web.js` | HTTP-Server, Login, API, Datenschutzseite |
| `src/bot.js`, `src/schedule.js` | Nachrichtenfluss, Zeitplan für Brief, Erinnerungen, Check-ins |
| `src/chat.js`, `src/tools.js` | KI-Chat mit Werkzeugen zum Speichern |
| `src/brief.js` | Morgenbrief |
| `src/claude.js` | KI-Anbieter (Claude, DeepSeek) |
| `src/tasks.js`, `src/calendar.js` | Google Aufgaben und Kalender |
| `src/push.js` | Web Push (VAPID, RFC 8291) |
| `src/weather.js`, `src/news.js`, `src/warnings.js`, `src/holidays.js` | Wetter, Nachrichten, Unwetterwarnungen (DWD, IPMA), Feiertage |
| `public/i18n.js`, `public/i18n-dict.js`, `src/i18n.js` | Übersetzung der Oberfläche und der Benachrichtigungen |
| `public/` | App-Oberfläche (PWA) |
| `deploy/` | systemd-Dienst, Caddy/nginx, Installationsskript |

## Mitmachen

Fehler und Ideen gern als Issue. Pull Requests bitte mit Test (`npm test`). Weitere Warndienste (z. B. Kanada, Australien, Neuseeland) oder Nachrichtenquellen sind sehr willkommen (`src/holidays.js`, `src/warnings.js`), ebenso weitere Sprachen (`public/i18n-dict.js`).

## Lizenz

[MIT](LICENSE)
