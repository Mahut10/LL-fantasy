# Lidingöloppet Fantasy

Öppna `index.html` lokalt i en webbläsare för att använda prototypen.

Loggan ligger i `assets/ll-logo.png`. Alla referenser använder relativa sökvägar, så både inloggningssidan och topploggan fungerar från `file://` och efter publicering på GitHub Pages.

`startlists.json` är datakällan för startlistorna. `startlists.js` är samma data i ett format som också kan läsas när `index.html` öppnas direkt via `file://`. Vid publicering via GitHub Pages används samma statiska data — inga förfrågningar görs från appen till Lidingöloppet.

Kör arbetsflödet **Uppdatera fantasydata** manuellt från GitHub när du vill hämta nya data. Det hämtar startlistor, LL-historik och stjärnpriser och sparar dem statiskt i `startlists.json`; den publicerade appen gör aldrig några förfrågningar till Lidingöloppet. Både 15 km och 30 km begränsas till startgrupp 1A.
