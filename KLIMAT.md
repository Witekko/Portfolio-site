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

## „O mnie”

Sieć neuronowa okazała się zbyt statyczna. Zostaje na gałęzi `feature/about-network`, a nowy pomysł jest po stronie Witka.
