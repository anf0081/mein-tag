// Übersetzungen der Oberfläche. Schlüssel = deutscher Text, wie er in der App steht.
// Neue Texte: hier ergänzen (en = Englisch, pt = Portugiesisch, informelles „tu“).
const E = {}, P = {};
const add = (de, en, pt) => { E[de] = en; P[de] = pt; };

// ---------- Navigation, Kopfzeilen, Login ----------
add('Mein Tag', 'My Day', 'O Meu Dia');
add('Chat', 'Chat', 'Chat');
add('Übersicht', 'Overview', 'Visão geral');
add('Über dich', 'About you', 'Sobre ti');
add('Hauptnavigation', 'Main navigation', 'Navegação principal');
add('Menü', 'Menu', 'Menu');
add('Alles auf einen Blick', 'Everything at a glance', 'Tudo num relance');
add('Passwort', 'Password', 'Palavra-passe');
add("Los geht's", "Let's go", 'Vamos lá');
add('Schön, dass du da bist. Einmal das Passwort, dann bleibst du angemeldet.', 'Good to see you. Enter your password once and you stay signed in.', 'Que bom ver-te. Introduz a palavra-passe uma vez e ficas com sessão iniciada.');
add('Steht in deiner .env-Datei auf dem Server.', 'It is in your .env file on the server.', 'Está no ficheiro .env no servidor.');
add('Bitte neu anmelden', 'Please sign in again', 'Inicia sessão novamente');
add('Falsches Passwort', 'Wrong password', 'Palavra-passe errada');

// ---------- Chat ----------
add('Vorschläge', 'Suggestions', 'Sugestões');
add('Brief', 'Brief', 'Resumo');
add('Was steht heute an?', "What's on today?", 'O que há para hoje?');
add('Onboarding', 'Onboarding', 'Introdução');
add('Meine Woche', 'My week', 'A minha semana');
add('Wie sieht meine Woche aus?', 'What does my week look like?', 'Como é a minha semana?');
add('Nachricht', 'Message', 'Mensagem');
add('Schreib mir…', 'Write to me…', 'Escreve-me…');
add('Senden', 'Send', 'Enviar');
add('Spracheingabe', 'Voice input', 'Entrada de voz');
add('Gespeichert', 'Saved', 'Guardado');
add('Morgenbrief', 'Morning brief', 'Resumo da manhã');
add('Hilfreich?', 'Helpful?', 'Foi útil?');
add('Passt', 'Good', 'Está bem');
add('Besser machen', 'Improve', 'Melhorar');
add('Schreibt…', 'Typing…', 'A escrever…');
add('Heute', 'Today', 'Hoje');
add('Gestern', 'Yesterday', 'Ontem');
add('Morgen', 'Tomorrow', 'Amanhã');
add('Soll ich dich morgens mit deinem Tagesplan wecken?', 'Shall I wake you with your day plan in the morning?', 'Queres que te acorde de manhã com o plano do dia?');
add('Ja, gern', 'Yes, please', 'Sim, por favor');
add('Guten Morgen', 'Good morning', 'Bom dia');

// ---------- Übersicht ----------
add('Vorheriger Tag', 'Previous day', 'Dia anterior');
add('Nächster Tag', 'Next day', 'Dia seguinte');
add('Zurück zu heute', 'Back to today', 'Voltar a hoje');
add('Lädt …', 'Loading …', 'A carregar …');
add('Für diesen Tag steht nichts an.', 'Nothing planned for this day.', 'Nada previsto para este dia.');
add('An diesem Tag wurde nichts abgehakt.', 'Nothing was ticked off on this day.', 'Nada foi concluído neste dia.');
add('Termin · ganztägig', 'Appointment · all day', 'Compromisso · dia inteiro');
add('Erinnerung', 'Reminder', 'Lembrete');
add('Routine', 'Routine', 'Rotina');
add('Erledigt', 'Done', 'Feito');
add('Kommende Termine', 'Upcoming appointments', 'Próximos compromissos');
add('Google Kalender ist noch nicht verbunden.', 'Google Calendar is not connected yet.', 'O Google Calendar ainda não está ligado.');
add('Aufgaben · nächste 7 Tage', 'Tasks · next 7 days', 'Tarefas · próximos 7 dias');
add('Aufgaben der nächsten 7 Tage', 'Tasks for the next 7 days', 'Tarefas dos próximos 7 dias');
add('Nichts fällig. Genieß den Tag!', 'Nothing due. Enjoy your day!', 'Nada pendente. Aproveita o dia!');
add('Später', 'Later', 'Mais tarde');
add('Ohne Datum', 'No date', 'Sem data');
add('Alle Routinen', 'All routines', 'Todas as rotinas');
add('Liste leeren', 'Clear list', 'Limpar lista');
add('Heute fällig', 'Due today', 'Para hoje');
add('Morgen fällig', 'Due tomorrow', 'Para amanhã');
add('Überfällig seit gestern', 'Overdue since yesterday', 'Atrasado desde ontem');
add('Unwetterwarnung', 'Weather warning', 'Aviso meteorológico');
add('Aufgabe', 'Task', 'Tarefa');
add('Neue Aufgabe', 'New task', 'Nova tarefa');
add('Was ist zu tun?', 'What needs doing?', 'O que há para fazer?');
add('Fällig am (optional)', 'Due on (optional)', 'Prazo (opcional)');
add('Fällig am', 'Due on', 'Prazo');
add('Uhrzeit für Hinweis (optional)', 'Time for reminder (optional)', 'Hora do lembrete (opcional)');
add('Aufgabe bearbeiten', 'Edit task', 'Editar tarefa');
add('Routine bearbeiten', 'Edit routine', 'Editar rotina');
add('Bearbeiten', 'Edit', 'Editar');
add('Text', 'Text', 'Texto');
add('Datum entfernen', 'Remove date', 'Remover data');
add('Alle', 'Every', 'A cada');
add('Einheit', 'Unit', 'Unidade');
add('Tage', 'days', 'dias');
add('Wochen', 'weeks', 'semanas');
add('Monate', 'months', 'meses');
add('Jahre', 'years', 'anos');
add('Nächstes Mal', 'Next time', 'Próxima vez');
add('Priorität hoch', 'High priority', 'Prioridade alta');
add('Priorität normal', 'Normal priority', 'Prioridade normal');
add('Priorität niedrig', 'Low priority', 'Prioridade baixa');
add('Diese Aufgabe löschen?', 'Delete this task?', 'Apagar esta tarefa?');
add('Diese Routine löschen?', 'Delete this routine?', 'Apagar esta rotina?');
// Präfixe vor „: …“ (Name folgt)
add('Wieder öffnen', 'Reopen', 'Reabrir');
add('Routine erledigt', 'Routine done', 'Rotina feita');
add('Routine bearbeiten', 'Edit routine', 'Editar rotina');
add('Entfernen', 'Remove', 'Remover');
add('Vergessen', 'Forget', 'Esquecer');
add('Feiertag', 'Holiday', 'Feriado');
add('Geburtstag', 'Birthday', 'Aniversário');
add('Reise beginnt', 'Trip starts', 'Viagem começa');
add('Rückreise', 'Return trip', 'Regresso');
add('Tagesansicht', 'Day view', 'Vista do dia');

// ---------- Über dich ----------
add('Profilbilder und Namen', 'Profile pictures and names', 'Fotos de perfil e nomes');
add('Du & deine Assistentin', 'You & your assistant', 'Tu e a tua assistente');
add('Du & dein Assistent', 'You & your assistant', 'Tu e o teu assistente');
add('Du & deine Assistenz', 'You & your assistant', 'Tu e a tua assistência');
add('Dein Name', 'Your name', 'O teu nome');
add('Name deiner Assistentin', "Your assistant's name", 'Nome da tua assistente');
add('Name deines Assistenten', "Your assistant's name", 'Nome do teu assistente');
add('Name deiner Assistenz', "Your assistant's name", 'Nome da tua assistência');
add('Gib ihr einen Namen', 'Give her a name', 'Dá-lhe um nome');
add('Gib ihm einen Namen', 'Give him a name', 'Dá-lhe um nome');
add('Gib einen Namen', 'Give a name', 'Dá um nome');
add('Du identifizierst dich als', 'You identify as', 'Identificas-te como');
add('Deine Assistenz ist', 'Your assistant is', 'A tua assistência é');
add('Weiblich', 'Female', 'Feminino');
add('Männlich', 'Male', 'Masculino');
add('Divers', 'Non-binary', 'Não binário');
add('Dein Profilbild', 'Your profile picture', 'A tua foto de perfil');
add('Bild deiner Assistentin', "Your assistant's picture", 'Imagem da tua assistente');
add('Bild deines Assistenten', "Your assistant's picture", 'Imagem do teu assistente');
add('Bild deiner Assistenz', "Your assistant's picture", 'Imagem da tua assistência');
add('Dein Profilbild – ansehen oder ändern', 'Your profile picture – view or change', 'A tua foto de perfil – ver ou alterar');
add('Bild deiner Assistenz – ansehen oder ändern', "Your assistant's picture – view or change", 'Imagem da tua assistência – ver ou alterar');
add('Profilbild', 'Profile picture', 'Foto de perfil');
add('Foto ändern', 'Change photo', 'Alterar foto');
add('Foto hochladen', 'Upload photo', 'Carregar foto');
add('Noch kein Bild', 'No picture yet', 'Ainda sem imagem');
add('Sprache', 'Language', 'Idioma');
add('Morgenbrief', 'Morning brief', 'Resumo da manhã');
add('Uhrzeit', 'Time', 'Hora');
add('Morgenbrief jetzt erstellen', 'Create morning brief now', 'Criar resumo agora');
add('Benachrichtigung auf diesem Gerät', 'Notifications on this device', 'Notificações neste dispositivo');
add('Test-Benachrichtigung senden', 'Send test notification', 'Enviar notificação de teste');
add('Begleitung', 'Support', 'Acompanhamento');
add('Check-in, Woche, Fokus', 'Check-in, week, focus', 'Check-in, semana, foco');
add('Hinweis bei fälligen Aufgaben', 'Reminder for due tasks', 'Aviso de tarefas pendentes');
add('Mit Uhrzeit: zur Uhrzeit. Ohne: Sammel-Hinweis', 'With a time: at that time. Without: one summary', 'Com hora: a essa hora. Sem hora: um resumo');
add('Sammel-Hinweis um', 'Summary at', 'Resumo às');
add('Abend-Check-in', 'Evening check-in', 'Check-in da noite');
add('Was hat geklappt, was wandert auf morgen?', 'What went well, what moves to tomorrow?', 'O que correu bem, o que passa para amanhã?');
add('Uhrzeit Check-in', 'Check-in time', 'Hora do check-in');
add('Wochenplanung', 'Weekly planning', 'Planeamento semanal');
add('Ausblick und Prioritäten für die Woche', 'Outlook and priorities for the week', 'Perspetiva e prioridades da semana');
add('Tag und Uhrzeit', 'Day and time', 'Dia e hora');
add('Uhrzeit Wochenplanung', 'Weekly planning time', 'Hora do planeamento semanal');
add('Sonntag', 'Sunday', 'Domingo'); add('Montag', 'Monday', 'Segunda-feira'); add('Dienstag', 'Tuesday', 'Terça-feira');
add('Mittwoch', 'Wednesday', 'Quarta-feira'); add('Donnerstag', 'Thursday', 'Quinta-feira'); add('Freitag', 'Friday', 'Sexta-feira'); add('Samstag', 'Saturday', 'Sábado');
add('Unwetter & Feiertage', 'Weather warnings & holidays', 'Avisos e feriados');
add('Unwetter und Feiertage', 'Weather warnings and holidays', 'Avisos e feriados');
add('Unwetterwarnungen (IPMA/DWD)', 'Weather warnings (IPMA/DWD)', 'Avisos meteorológicos (IPMA/DWD)');
add('Push bei Gelb, Orange oder Rot · für deine Orte gibt es keine Warnungen (nur Portugal und Deutschland)', 'Push for yellow, orange or red · no warnings for your places (Portugal and Germany only)', 'Notificação para amarelo, laranja ou vermelho · sem avisos para os teus locais (só Portugal e Alemanha)');
add('Feiertage automatisch', 'Holidays automatically', 'Feriados automáticos');
add('Für deinen Ort kenne ich keine Feiertage', "I don't know the holidays for your location", 'Não conheço os feriados do teu local');
add('Nachrichten im Brief', 'News in the brief', 'Notícias no resumo');
add('Welt', 'World', 'Mundo');
add('Deutschland', 'Germany', 'Alemanha');
add('Portugal', 'Portugal', 'Portugal');
add('Wetter-Orte', 'Weather places', 'Locais do tempo');
add('Wetter-Ort', 'Weather place', 'Local do tempo');
add('Wo bist du?', 'Where are you?', 'Onde estás?');
add('Ort, z. B. Hamburg', 'Place, e.g. London', 'Local, p. ex. Lisboa');
add('Noch kein Ort', 'No location yet', 'Ainda sem local');
add('Hier bist du · für Wetter, Warnungen und Feiertage', 'You are here · for weather, warnings and holidays', 'Estás aqui · para tempo, avisos e feriados');
add('Ändern', 'Change', 'Alterar');
add('Weiterer Ort', 'Another place', 'Outro local');
add('Weiterer Ort, z. B. Arbeitsort', 'Another place, e.g. work', 'Outro local, p. ex. trabalho');
add('Wofür', 'What for', 'Para quê');
add('Wofür, z. B. Schule', 'What for, e.g. school', 'Para quê, p. ex. escola');
add('Hinzufügen', 'Add', 'Adicionar');
add('Das habe ich gelernt', "What I've learned", 'O que aprendi');
add('Noch nichts. Sag mir einfach im Chat, was dir wichtig ist oder was ich anders machen soll.', "Nothing yet. Just tell me in the chat what matters to you or what I should do differently.", 'Ainda nada. Diz-me no chat o que é importante para ti ou o que devo fazer de outra forma.');
add('Ziele, Routinen & Hobbys', 'Goals, routines & hobbies', 'Objetivos, rotinas e passatempos');
add('Ziele, Routinen und Hobbys', 'Goals, routines and hobbies', 'Objetivos, rotinas e passatempos');
add('Ziel', 'Goal', 'Objetivo');
add('Hobby', 'Hobby', 'Passatempo');
add('Art', 'Type', 'Tipo');
add('Name', 'Name', 'Nome');
add('Details', 'Details', 'Detalhes');
add('Details (optional)', 'Details (optional)', 'Detalhes (opcional)');
add('Details, z. B. 3× pro Woche morgens', 'Details, e.g. 3× a week in the morning', 'Detalhes, p. ex. 3× por semana de manhã');
add('Neu, z. B. Yoga', 'New, e.g. yoga', 'Novo, p. ex. ioga');
add('Hinzugefügt', 'Added', 'Adicionado');
add('Verbunden', 'Connected', 'Ligado');
add('Nicht verbunden', 'Not connected', 'Não ligado');
add('Google Kalender & Aufgaben', 'Google Calendar & Tasks', 'Google Calendar e Tarefas');
add('Verbinden', 'Connect', 'Ligar');
add('Trennen', 'Disconnect', 'Desligar');
add('Zugangsdaten sind gespeichert.', 'Credentials are saved.', 'As credenciais estão guardadas.');
add(' · Listen „Alle Aufgaben“ und „Heute“ synchron', ' · lists “Alle Aufgaben” and “Heute” in sync', ' · listas “Alle Aufgaben” e “Heute” sincronizadas');
add('KI', 'AI', 'IA');
add('Modelle und Schlüssel je Anbieter', 'Models and keys per provider', 'Modelos e chaves por fornecedor');
add('Aktiver Anbieter', 'Active provider', 'Fornecedor ativo');
add('Anbieter bearbeiten', 'Edit provider', 'Editar fornecedor');
add('Einstellungen für', 'Settings for', 'Definições para');
add('In .env hinterlegt', 'Set in .env', 'Definido no .env');
add('Noch kein Schlüssel', 'No key yet', 'Ainda sem chave');
add('Schlüssel entfernen?', 'Remove key?', 'Remover chave?');
add('Preis unbekannt', 'Price unknown', 'Preço desconhecido');
add('Kosten', 'Costs', 'Custos');
add('Kosten diesen Monat', 'Costs this month', 'Custos deste mês');
add('Daten', 'Data', 'Dados');
add('Was ich weiß und wie ich arbeite', 'What I know and how I work', 'O que sei e como trabalho');
add('Onboarding & Überblick', 'Onboarding & overview', 'Introdução e resumo');
add('Verlauf zusammenfassen', 'Summarise history', 'Resumir histórico');
add('Chatverlauf behalten', 'Keep chat history', 'Guardar histórico do chat');
add('Ältere Nachrichten verschwinden aus der Ansicht. Was ich über dich weiß, bleibt.', "Older messages disappear from view. What I know about you stays.", 'As mensagens antigas desaparecem da vista. O que sei sobre ti fica.');
add('7 Tage', '7 days', '7 dias'); add('30 Tage', '30 days', '30 dias'); add('1 Jahr', '1 year', '1 ano');
add('Nie löschen', 'Never delete', 'Nunca apagar');
add('Chatverlauf wird nie gelöscht', 'Chat history is never deleted', 'O histórico nunca é apagado');
add('Alles löschen', 'Delete everything', 'Apagar tudo');
add('Alles löschen?', 'Delete everything?', 'Apagar tudo?');
add('Alles zurücksetzen und neu anfangen. Kalender und Aufgaben bei Google bleiben erhalten.', 'Reset everything and start over. Calendar and tasks at Google are kept.', 'Repor tudo e começar de novo. O calendário e as tarefas no Google mantêm-se.');
add('Das löscht Chatverlauf, Todos, Personen, Routinen, Gelerntes, Profil und Bilder unwiderruflich. Das Onboarding beginnt danach von vorn. Termine im Google Kalender und Aufgaben in Google Aufgaben bleiben dort erhalten.', 'This permanently deletes chat history, to-dos, people, routines, what I learned, profile and pictures. Onboarding then starts over. Appointments in Google Calendar and tasks in Google Tasks are kept there.', 'Isto apaga permanentemente o histórico, tarefas, pessoas, rotinas, o que aprendi, perfil e imagens. A introdução recomeça depois. Os compromissos no Google Calendar e as tarefas no Google Tasks mantêm-se.');
add('Tippe LÖSCHEN zur Bestätigung', 'Type DELETE to confirm', 'Escreve APAGAR para confirmar');
add('LÖSCHEN', 'DELETE', 'APAGAR');
add('Endgültig löschen', 'Delete permanently', 'Apagar definitivamente');
add('Abmelden', 'Sign out', 'Terminar sessão');

// ---------- Allgemein ----------
add('Abbrechen', 'Cancel', 'Cancelar');
add('Speichern', 'Save', 'Guardar');
add('Löschen', 'Delete', 'Apagar');
add('Schließen', 'Close', 'Fechar');
add('Kopieren', 'Copy', 'Copiar');
add('Google einrichten', 'Set up Google', 'Configurar Google');
add('Client-ID', 'Client ID', 'ID do cliente');
add('Clientschlüssel', 'Client secret', 'Segredo do cliente');
add('Weiter zu Google', 'Continue to Google', 'Continuar para o Google');

// ---------- Hinweise (Toasts) ----------
add('Abgehakt, nächster Termin ist eingeplant.', 'Done, next one is scheduled.', 'Feito, a próxima já está agendada.');
add('Alles gelöscht. Frischer Start!', 'Everything deleted. Fresh start!', 'Tudo apagado. Novo começo!');
add('Aufgabe gespeichert', 'Task saved', 'Tarefa guardada');
add('Benachrichtigungen auf diesem Gerät aus', 'Notifications off on this device', 'Notificações desligadas neste dispositivo');
add('Benachrichtigungen sind an. Bis morgen früh!', 'Notifications are on. See you tomorrow morning!', 'As notificações estão ligadas. Até amanhã de manhã!');
add('Benachrichtigungen sind blockiert. Erlaube sie in den Android-Einstellungen für Chrome.', 'Notifications are blocked. Allow them in the Android settings for Chrome.', 'As notificações estão bloqueadas. Permite-as nas definições do Android para o Chrome.');
add('Bitte einen Text eingeben', 'Please enter a text', 'Escreve um texto');
add('Bitte genau LÖSCHEN eintippen', 'Please type exactly DELETE', 'Escreve exatamente APAGAR');
add('Bitte von Hand kopieren', 'Please copy by hand', 'Copia à mão');
add('Adresse kopiert', 'Address copied', 'Endereço copiado');
add('Dieser Browser kann keine Benachrichtigungen. Öffne die App über Chrome.', "This browser can't show notifications. Open the app in Chrome.", 'Este navegador não mostra notificações. Abre a app no Chrome.');
add('Entfernt', 'Removed', 'Removido');
add('Erledigt. Stark!', 'Done. Nice!', 'Feito. Boa!');
add('Foto entfernt', 'Photo removed', 'Foto removida');
add('Foto gespeichert', 'Photo saved', 'Foto guardada');
add('Gelöscht', 'Deleted', 'Apagado');
add('Google getrennt', 'Google disconnected', 'Google desligado');
add('Mikrofon ist blockiert. Erlaube es in den Chrome-Einstellungen.', 'Microphone is blocked. Allow it in the Chrome settings.', 'O microfone está bloqueado. Permite-o nas definições do Chrome.');
add('Modell gespeichert', 'Model saved', 'Modelo guardado');
add('Nichts zum Rückgängigmachen', 'Nothing to undo', 'Nada para desfazer');
add('Ort hinzugefügt', 'Place added', 'Local adicionado');
add('Schlüssel entfernt', 'Key removed', 'Chave removida');
add('Schlüssel gespeichert', 'Key saved', 'Chave guardada');
add('Wieder offen', 'Reopened', 'Reaberto');
add('Rückgängig', 'Undo', 'Desfazer');
add('Google ist verbunden! Deine Aufgaben werden jetzt abgeglichen.', 'Google is connected! Your tasks are now being synced.', 'O Google está ligado! As tuas tarefas estão a ser sincronizadas.');
add('Verbindung abgebrochen', 'Connection cancelled', 'Ligação cancelada');
add('Das hat zu lange gedauert, bitte nochmal verbinden', 'That took too long, please connect again', 'Demorou demasiado, liga novamente');
add('Bitte zuerst die Zugangsdaten eintragen', 'Please enter the credentials first', 'Introduz primeiro as credenciais');
add('Google hat die Verbindung abgelehnt. Stimmt die Weiterleitungs-Adresse im Google-Client?', 'Google refused the connection. Is the redirect address in the Google client correct?', 'O Google recusou a ligação. O endereço de redirecionamento no cliente Google está correto?');
add('Google-Verbindung trennen? Deine Termine und Aufgaben bei Google bleiben erhalten.', 'Disconnect Google? Your appointments and tasks at Google are kept.', 'Desligar o Google? Os teus compromissos e tarefas no Google mantêm-se.');
// Präfixe gespeicherter Aktionen im Chat („… : Name“)
add('Aufgabe gespeichert', 'Task saved', 'Tarefa guardada');
add('Aufgabe', 'Task', 'Tarefa');
add('Aufgabe geändert', 'Task changed', 'Tarefa alterada');
add('Aufgabe gelöscht', 'Task deleted', 'Tarefa apagada');
add('Person', 'Person', 'Pessoa');
add('Person entfernt', 'Person removed', 'Pessoa removida');
add('Wiederkehrend', 'Recurring', 'Recorrente');
add('Wiederkehrende Aufgabe entfernt', 'Recurring task removed', 'Tarefa recorrente removida');
add('Routine geändert', 'Routine changed', 'Rotina alterada');
add('Fest', 'Celebration', 'Festa');
add('Fest entfernt', 'Celebration removed', 'Festa removida');
add('Reise', 'Trip', 'Viagem');
add('Reise entfernt', 'Trip removed', 'Viagem removida');
add('Profil', 'Profile', 'Perfil');
add('Gemerkt', 'Noted', 'Anotado');
add('Fortschritt', 'Progress', 'Progresso');
add('Termin', 'Appointment', 'Compromisso');
add('Termin geändert', 'Appointment changed', 'Compromisso alterado');
add('Termin gelöscht', 'Appointment deleted', 'Compromisso apagado');
add('Erinnerung gelöscht', 'Reminder deleted', 'Lembrete apagado');
add('Fokus', 'Focus', 'Foco');
add('Fokus beendet', 'Focus ended', 'Foco terminado');
add('Wetter-Ort entfernt', 'Weather place removed', 'Local do tempo removido');
add('Nachrichten', 'News', 'Notícias');
add('Ort', 'Place', 'Local');
add('Aktiv', 'Active', 'Ativo');
add('Hat nicht geklappt', "Didn't work", 'Não funcionou');
add('Foto ging nicht', "Photo didn't work", 'A foto falhou');

const dayWord = { en: { Tage: 'days', Wochen: 'weeks', Monate: 'months', Jahre: 'years' }, pt: { Tage: 'dias', Wochen: 'semanas', Monate: 'meses', Jahre: 'anos' } };
const every1 = { en: { 'n Tag': 'every day', 'n Monat': 'every month', 's Jahr': 'every year', ' Woche': 'every week' }, pt: { 'n Tag': 'todos os dias', 'n Monat': 'todos os meses', 's Jahr': 'todos os anos', ' Woche': 'todas as semanas' } };
const gender = { en: { weiblich: 'female', männlich: 'male', divers: 'non-binary' }, pt: { weiblich: 'feminino', männlich: 'masculino', divers: 'não binário' } };
const placeDe = (s, l) => (l === 'en'
  ? s.replace('Deutschland (bundesweite Feiertage)', 'Germany (nationwide holidays)').replace('Azoren', 'Azores').replace(' und ', ' and ')
  : s.replace('Deutschland (bundesweite Feiertage)', 'Alemanha (feriados nacionais)').replace('Azoren', 'Açores').replace(' und ', ' e '));
const news = (s, l) => s.replace(/\bWelt\b/g, l === 'en' ? 'World' : 'Mundo').replace(/\bDeutschland\b/g, l === 'en' ? 'Germany' : 'Alemanha');

export const DICT = { en: E, pt: P };

// Muster für Texte mit Zahlen, Daten oder Namen: [RegExp, { en, pt }]. Funktionen bekommen die (bereits übersetzten) Gruppen.
export const RULES = [
  [/^(Erledigt|Später|Ohne Datum|Alle Routinen|Das habe ich gelernt) \((\d+)\)$/, { en: (a, n) => `${a} (${n})`, pt: (a, n) => `${a} (${n})` }],
  [/^Routine · (.+)$/, { en: (x) => `Routine · ${x}`, pt: (x) => `Rotina · ${x}` }],
  [/^Heute fällig um (\d\d:\d\d)$/, { en: 'Due today at $1', pt: 'Hoje às $1' }],
  [/^um (\d\d:\d\d)$/, { en: 'at $1', pt: 'às $1' }],
  [/^Überfällig seit (\d+) Tagen$/, { en: 'Overdue for $1 days', pt: 'Atrasado há $1 dias' }],
  [/^Überfällig seit (.+)$/, { en: 'Overdue since $1', pt: 'Atrasado desde $1' }],
  [/^Fällig (.+)$/, { en: 'Due $1', pt: 'Prazo: $1' }],
  [/^Erledigt (\S.+)$/, { en: 'Done $1', pt: 'Feito $1' }],
  [/^(Heute|Gestern), (\d\d:\d\d)$/, { en: (d, t) => `${d}, ${t}`, pt: (d, t) => `${d}, ${t}` }],
  [/^(.+) · zurück zu heute$/, { en: '$1 · back to today', pt: '$1 · voltar a hoje' }],
  [/^(.+) · ganztägig$/, { en: (d) => `${d} · all day`, pt: (d) => `${d} · dia inteiro` }],
  [/^Termin · (\d\d:\d\d)–(\d\d:\d\d)$/, { en: 'Appointment · $1–$2', pt: 'Compromisso · $1–$2' }],
  [/^(Heute|Morgen|Gestern) · (\d\d:\d\d)–(\d\d:\d\d)$/, { en: (d, a, b) => `${d} · ${a}–${b}`, pt: (d, a, b) => `${d} · ${a}–${b}` }],
  [/^alle (\d+) (Tage|Wochen|Monate|Jahre) · nächstes Mal (.+)$/, { en: (n, u, d) => `every ${n} ${dayWord.en[u] || u} · next ${d}`, pt: (n, u, d) => `a cada ${n} ${dayWord.pt[u] || u} · próxima ${d}` }],
  [/^jede(n Tag|n Monat|s Jahr| Woche) · nächstes Mal (.+)$/, { en: (u, d) => `${every1.en[u]} · next ${d}`, pt: (u, d) => `${every1.pt[u]} · próxima ${d}` }],
  [/^(.+) · zuletzt gemacht (.+)$/, { en: '$1 · last done $2', pt: '$1 · última vez $2' }],
  [/^zuletzt gemacht (.+)$/, { en: 'last done $1', pt: 'última vez $1' }],
  [/^(\d+) Anfragen · Schätzung nach Listenpreis\. Genaue Abrechnung bei Anthropic bzw\. DeepSeek\.$/, { en: '$1 requests · estimate at list price. Exact billing with Anthropic or DeepSeek.', pt: '$1 pedidos · estimativa a preço de tabela. Faturação exata na Anthropic ou DeepSeek.' }],
  [/^(\d+) Anfragen$/, { en: '$1 requests', pt: '$1 pedidos' }],
  [/^ca\. (.+) gesamt$/, { en: 'approx. $1 total', pt: 'aprox. $1 no total' }],
  [/^Letzter Abruf (Heute|Gestern|.+?), (\d\d:\d\d): (.+)$/s, { en: (d, t, r) => `Last fetch ${d}, ${t}: ${news(r, 'en')}`, pt: (d, t, r) => `Última atualização ${d}, ${t}: ${news(r, 'pt')}` }],
  [/^Push bei Gelb, Orange oder Rot · für (.+)$/, { en: 'Push for yellow, orange or red · for $1', pt: 'Notificação para amarelo, laranja ou vermelho · para $1' }],
  [/^Nach deinem Ort: (.+)$/, { en: (x) => `Based on your location: ${placeDe(x, 'en')}`, pt: (x) => `Conforme o teu local: ${placeDe(x, 'pt')}` }],
  [/^Dein Tagesplan von (.+)$/, { en: 'Your day plan from $1', pt: 'O teu plano do dia, por $1' }],
  [/^Dein Tagesplan$/, { en: 'Your day plan', pt: 'O teu plano do dia' }],
  [/^Test an (\d+) Geräte? gesendet, gleich müsste sie aufpoppen$/, { en: 'Test sent to $1 device(s), it should pop up shortly', pt: 'Teste enviado para $1 dispositivo(s), deve aparecer já' }],
  [/^(\d+) erledigte Aufgaben? entfernt$/, { en: '$1 completed task(s) removed', pt: '$1 tarefa(s) concluída(s) removida(s)' }],
  [/^Ab jetzt (weiblich|männlich|divers)$/, { en: (g) => `From now on ${gender.en[g] || g}`, pt: (g) => `A partir de agora ${gender.pt[g] || g}` }],
  [/^Schön, ab jetzt heiße ich (.+)!$/, { en: 'Nice, from now on my name is $1!', pt: 'Boa, a partir de agora chamo-me $1!' }],
  [/^Morgenbrief kommt jetzt um (.+) Uhr$/, { en: 'The morning brief now comes at $1', pt: 'O resumo da manhã chega agora às $1' }],
  [/^(.+) \(aktiv\)$/, { en: '$1 (active)', pt: '$1 (ativo)' }],
  [/^(.*)\((zuverlässig|günstig|stark|schnell)\)$/, { en: (a, b) => `${a}(${({ zuverlässig: 'reliable', günstig: 'cheap', stark: 'strong', schnell: 'fast' })[b]})`, pt: (a, b) => `${a}(${({ zuverlässig: 'fiável', günstig: 'barato', stark: 'forte', schnell: 'rápido' })[b]})` }],
  [/^API-Schlüssel (?:für )?(.+)$/, { en: 'API key for $1', pt: 'Chave API para $1' }],
  [/^(Schlüssel ist in der \.env hinterlegt|Schlüssel ist gespeichert|Noch kein Schlüssel)\. Schlüssel von (.+)\.$/, {
    en: (a, b) => `${({ 'Schlüssel ist in der .env hinterlegt': 'Key is set in .env', 'Schlüssel ist gespeichert': 'Key is saved', 'Noch kein Schlüssel': 'No key yet' })[a] || a}. Get a key at ${b}.`,
    pt: (a, b) => `${({ 'Schlüssel ist in der .env hinterlegt': 'A chave está no .env', 'Schlüssel ist gespeichert': 'A chave está guardada', 'Noch kein Schlüssel': 'Ainda sem chave' })[a] || a}. Obtém uma chave em ${b}.`,
  }],
  [/^Tagesansicht (.+)$/, { en: 'Day view $1', pt: 'Vista do dia $1' }],
  [/^Schlüssel von (.+)\.$/, { en: 'Get a key at $1.', pt: 'Obtém uma chave em $1.' }],
];

// Schritte im Google-Dialog (als Ganzes, weil sie Links enthalten). IDs bleiben gleich.
export const GOOGLE_STEPS = {
  en: `<li>On <a href="https://console.cloud.google.com" target="_blank" rel="noopener">console.cloud.google.com</a>, create a project “My Day”.</li>
<li>Under <em>APIs &amp; Services → Library</em>, enable the <strong>Google Calendar API</strong> and the <strong>Google Tasks API</strong>.</li>
<li><em>Google Auth Platform</em>: enter app name and email, audience <strong>External</strong>, add yourself as a test user, then <strong>Publish app</strong>.</li>
<li><em>Clients → Create client</em>, type <strong>Web application</strong>. Under “Authorized redirect URIs” enter this address:
<span class="copy-row"><code id="redirect-uri"></code><button type="button" class="btn text small" data-action="copy-uri">Copy</button></span></li>
<li>Paste the client ID and client secret here:</li>`,
  pt: `<li>Em <a href="https://console.cloud.google.com" target="_blank" rel="noopener">console.cloud.google.com</a>, cria um projeto “O Meu Dia”.</li>
<li>Em <em>APIs e serviços → Biblioteca</em>, ativa a <strong>Google Calendar API</strong> e a <strong>Google Tasks API</strong>.</li>
<li><em>Google Auth Platform</em>: indica o nome da app e o email, público <strong>Externo</strong>, adiciona-te como utilizador de teste e depois <strong>Publicar app</strong>.</li>
<li><em>Clientes → Criar cliente</em>, tipo <strong>Aplicação Web</strong>. Em “URIs de redirecionamento autorizados” coloca este endereço:
<span class="copy-row"><code id="redirect-uri"></code><button type="button" class="btn text small" data-action="copy-uri">Copiar</button></span></li>
<li>Cola aqui o ID do cliente e o segredo do cliente:</li>`,
};
