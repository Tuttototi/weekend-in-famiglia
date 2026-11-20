# Weekend in famiglia

## Modalità locale
Apri la web app tramite il link privato del sito oppure esegui un server HTTP puntato a dist. Il profilo in alto indica l’autore delle modifiche sul dispositivo e i dati restano nel browser. Esporta il file Excel prima di passare alla modalità condivisa.

## Modalità condivisa con Firebase
1. In Firebase Console crea il progetto, registra una app Web e crea il database Cloud Firestore. Abilita Email/Password in Authentication.
2. In Authentication crea un account per ciascun familiare. In Firestore crea per ciascun utente il documento familyMembers/{UID}, con nome nel campo stringa name e permesso nel campo booleano editor.
3. Copia la configurazione Web in dist/firebase-config.js assegnandola a window.FAMILY_FIREBASE. La configurazione client non include password o chiavi di servizio.
4. Dal progetto sorgente installa le dipendenze con npm ci. Esegui npm run build, poi npx firebase-tools login e npx firebase-tools deploy --only hosting,firestore:rules --project ID_PROGETTO. Condividi l’indirizzo Hosting con i familiari abilitati.
5. Accedi come editor. Se hai già lavorato in locale, importa il file Excel esportato per recuperare i dati del calendario.

## Dati iniziali
Il 18 dicembre 2026 con Toti è un riferimento illustrativo. Conferma il venerdì e l'ordine dalla rotazione effettiva. Il calendario usa giorni interi: da venerdì a domenica in rotazione e da lunedì a giovedì con Giovanna nelle settimane ordinarie. Gli eventi iniziali riprendono la foto e l'esempio di Natale. Il vecchio file di famiglia può essere mappato sul modello Excel e importato. Lo storico Excel è consultabile a parte e le importazioni sono registrate come nuove modifiche.
