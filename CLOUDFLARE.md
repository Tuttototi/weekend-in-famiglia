# Weekend in famiglia su Cloudflare

## Preparazione

- Prima di cambiare indirizzo, esporta i turni già salvati dal sito attuale in **Dati → Esporta Excel**. Il nuovo indirizzo ha un archivio distinto.
- Usa Node.js 22 o successivo. Dalla cartella del progetto esegui `npm ci` e `npm run build`.
- Esegui `npx wrangler login` e autorizza Wrangler dal tuo browser. Usa `npx wrangler whoami` per verificare l’account.

## Database e pubblicazione

1. Crea il database con `npx wrangler d1 create weekend-in-famiglia`. Copia il suo identificativo nel campo `database_id` di `wrangler.jsonc`, al posto dello zero iniziale. Se il database esiste già, recupera l’identificativo dal pannello **Workers & Pages → D1**.
2. Applica lo schema con `npx wrangler d1 migrations apply CALENDAR_DB --remote`.
3. Esegui `npx wrangler deploy`. Il primo deploy permette di configurare Access sul Worker. L’API del calendario accetta solo token validi dell’applicazione Access configurata e utenti presenti nell’elenco familiare.
4. Nel pannello Cloudflare apri **Workers & Pages → weekend-in-famiglia → Access**. Proteggi il Worker di produzione. Crea una policy **Allow** con gli indirizzi email dei familiari e configura **One-time PIN** come metodo di accesso se vuoi il codice via email. Prendi il valore **Application Audience (AUD)** dall’applicazione Access e l’indirizzo del team Zero Trust.
5. Configura i valori sul Worker con `npx wrangler secret put ACCESS_ISSUER`, `npx wrangler secret put ACCESS_AUD` e `npx wrangler secret put FAMILY_MEMBERS`. Il primo valore ha forma `https://nome-team.cloudflareaccess.com` senza barra finale. Il secondo è l’AUD. Il terzo è un JSON su una sola riga. Sostituisci gli indirizzi di esempio con gli indirizzi reali, in minuscolo:

   ```json
   {"toti@example.com":{"name":"Toti","editor":true},"giovanna@example.com":{"name":"Giovanna","editor":false}}
   ```

6. Apri l’indirizzo `workers.dev` in una finestra privata e verifica che richieda accesso. Accedi con un account editor e importa l’Excel se hai dati precedenti. Verifica da un secondo telefono che una modifica compaia entro qualche secondo mentre l’app è aperta. Tutti i familiari possono consultare il calendario e gestire solo i propri extra. Gli editor possono anche gestire rotazioni, scambi, eventi e sostituzioni. Per migrare gli extra di un vecchio Excel, ciascuno li reinserisce dal calendario. Chi ha il ruolo editor può importare i propri extra dal file Excel.
7. Condividi il nuovo link con le persone abilitate. Per l’icona Home, salva il nuovo indirizzo da Safari o Chrome.

Guida ufficiale per [D1](https://developers.cloudflare.com/d1/get-started/) e [Access sui Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
