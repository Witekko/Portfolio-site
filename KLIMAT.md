# Koncept: klimat całej strony

Punkt wyjścia: [Noomo Labs](https://labs.noomoagency.com/). Co tam buduje wrażenie „wchodzę do innego świata”:

- **brama wejścia:** ekran ładowania z licznikiem %, potem przycisk „Immerse me”,
- **dźwięk** z przełącznikiem (ikona fal): muzyka w tle pasuje do ruchu meduzy, a do tego subtelne efekty, np. pojawienie się szklanej kuli,
- **panel „customize me”** z suwakami parametrów, czyli poczucie laboratorium i zabawy.

U nas efekty już są (podpis, głowa, robot), brakuje **wejścia, dźwięku i powietrza** między scenami.

## 1. Brama wejścia: „kalibracja” ⭐

- Czarny ekran, mono: `calibrating arm… 63%`. Procent liczony z prawdziwego ładowania (zdjęcie, mapa głębi, Three.js, czcionki).
- Po załadowaniu dwa przyciski: **Enter with sound** / **Enter in silence**.
- Kliknięcie robi trzy rzeczy naraz: przeglądarka pozwala włączyć dźwięk (wymaga gestu), dopiero wtedy rusza podpis (koniec z przewijaniem w trakcie intro), a całość dostaje moment „wejścia”.
- Przejście: ekran rozjaśnia się od środka, a z ciemności zaczyna się pisać podpis.

## 2. Dźwięk ⭐

**Muzyka: generowana w przeglądarce (Web Audio), bez plików i licencji.**
- Hipnotyczny dron: dwa-trzy niskie tony z wolnym LFO, szum przez filtr, delikatny pogłos.
- Reaguje na historię:
  - hero: ciemno i nisko,
  - projekty: filtr się otwiera i dochodzi rytmiczny puls,
  - „O mnie”: wnętrze głowy, czyli pogłos i wyższe harmoniczne,
  - kontakt: wszystko cichnie pod podpis.
- Alternatywa: gotowy utwór ambient z licencją (np. Artlist). Prostsze, ale cięższe (2–5 MB) i nie reaguje na stronę.

**Efekty związane z tym, co widać:**

| Moment | Dźwięk |
|---|---|
| Pisanie podpisu (intro i robot) | ciche skrobanie pióra, głośność = prędkość pióra (z planu pióra, więc zawsze w synchronie) |
| Ruch ramienia | szum serwa, wysokość tonu = prędkość przegubów (mamy to z IK) |
| Chwyt karty | krótki mechaniczny „klik” |
| Lot kamery do głowy | „whoosh” |
| Najechanie na kartę / neuron | ledwo słyszalny „tick” |

**Zasady:** przełącznik (fale) w menu, wybór zapamiętany, przy `prefers-reduced-motion` start bez dźwięku, nigdy nic głośnego.

## 3. Obraz: powietrze i światło

- **Pył w tle przez całą stronę:** wolno dryfujące cząsteczki w głębi, lekko uciekające od kursora. Jeden świat zamiast osobnych scen.
- **Postprocessing:** delikatne ziarno, winieta i **bloom** tylko na pomarańczowym (pióro, przeguby robota, akcenty). Na telefonach w wersji lżejszej.
- **Światło sceny zmienia się z historią:** chłodne w hero, cieplejsze przy robocie, ciemne przy podpisie.

## 4. Ruch i interfejs

- **Płynne przewijanie z bezwładnością** (Lenis): spokojniejsze, „hipnotyczne” tempo.
- **Własny kursor:** pierścień, który rośnie nad kartą („look closer”) i nad twarzą („meet me”).
- **Rozdziały jak w systemie:** cienkie mono-etykiety przy przejściach, np. `01 — signal`, `02 — the arm`, `03 — signature`, i krótkie komunikaty robota (`arm: ready`, `grip: ok`).

## 5. Laboratorium (opcjonalnie, jak „customize me”)

Mały panel „tune me”: gęstość cząsteczek, kolor akcentu, prędkość robota. Zabawa dla ciekawskich, ale też pokaz umiejętności.

## Kolejność

1. **Brama + dźwięk:** największy skok klimatu, rozwiązuje też blokadę intro.
2. **Pył, ziarno i bloom, kursor.**
3. **Lenis, etykiety rozdziałów, panel „tune me”.**

## Ryzyka

- **Wydajność:** bloom na 60 tys. cząsteczek trzeba mierzyć, na telefonach wersja lżejsza.
- **Dostępność:** dźwięk zawsze z wyborem i wyłącznikiem, a reduced-motion wyłącza efekty.
- **Brama** to dodatkowe kliknięcie przed treścią. Dlatego krótka, z widocznym postępem.

## „O mnie”: jazda po mózgu

Pierwszy zarys (przewijane rozdziały z linią z boku) odpadł: kamera nie wchodziła do głowy, a całość była zwykłym przewijaniem. Teraz:

- **Wejście:** kamera wlatuje w twarz, przez moment ciemno, a potem widać mózg-planetę z góry i kamera zjeżdża za line followera.
- **Start:** światła F1, pierwszy ruch po zgaśnięciu to czas reakcji (do usunięcia, jeśli się nie sprawdzi).
- **Jazda:** kółko, strzałki albo przesunięcie palcem to gaz; kamera zza robota jak w grze. Planeta obraca się pod robotem, horyzont się zakrzywia.
- **Etapy** wyrastają po prawej z cząsteczek: ramię robota, praca o G2, wagon z danymi, sieć ML w 37%. Przed każdym stoi brama nad linią z nazwą etapu (jak na torze), robot przejeżdża pod nią.
- **Umiejętności** to żetony na linii (z CV); robot je zbiera do ekwipunku na dole. Najbliższy żeton ma ostrą nazwę aż do zebrania, dalsze są rozmyte. Najechanie na slot w ekwipunku pokazuje opis umiejętności i skąd jest. Odcinek ML: linia przerywana i zablokowane żetony „?” (zapadają się w mózg).
- **Rozdział 03 to dwa równorzędne etapy:** praca „by day” (wagon, tory, po prawej) i IKE Tracker „evenings” (wykres jako stacja, po lewej, własna brama i karta). IKE jest tak samo ważny w szukaniu pracy.
- **Uczelnie:** budynki z cząsteczek po lewej przy etapach 01 (politechnika: wieża z zegarem, okna laboratoriów, kopuła) i 02 (portyk z kolumnami i szklane skrzydło).
- **Sceneria:** wspomnienia projektów po lewej z podpisami (line follower, kółko i krzyżyk, gra taneczna, Age of Sigma, ta strona), łuki synaps nad linią, które błyskają przy przejeździe, tory na odcinku kolejowym, 3 pola przyspieszenia, płaty mózgu w lekko innych kolorach. Okrążenie krótsze (mniejsza planeta).
- **Ruch (przegląd skillem Emila):** wspólne krzywe  i , wyjście szybsze niż wejście (karta, komunikat, Esc 1,8 s zamiast 3 s), okienko w ekwipunku rośnie ze slotu i między slotami przeskakuje bez animacji, hover tylko przy myszy.
- **Pit stop:** kostka przy linii, karta z hobby, czasem reakcji i liczbą umiejętności (interakcje kostki i gitary później).
- **Meta:** trasa to zamknięte okrążenie, brama START na końcu staje się metą „Projects →”. Za metą kamera wznosi się nad planetę, ciemność i lądowanie nisko przy podłodze robota, w pierwszym projekcie.
- **Z projektów do środka:** „About” w projektach prowadzi przez podłogę pod robotem zamiast przez twarz; „Back” wraca tą samą drogą. „Projects” w menu w trakcie jazdy też wychodzi przez robota.
- Bez WebGL albo przy ograniczonym ruchu zostają zwykłe rozdziały (about.js).

Do zrobienia: kostka do kręcenia (11,84 s), gitara, osiągnięcia, bio Witka.
