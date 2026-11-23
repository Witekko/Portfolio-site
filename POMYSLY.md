# Pomysły na później

Pomysły do portfolio, odłożone na później. Prototyp, którego dotyczą: [prototype/immersive/](prototype/immersive/).

## Zrobione

- Podpis „Witold K.” pisany cząsteczkami → głowa 3D (Depth Anything V2) → obrót głowy pod kursorem → kliknięcie otwiera „O mnie”.
- Ramię robota podaje karty projektów z magazynka. Cząsteczkowe formacje projektów zostają w tle.
- Kliknięcie w kartę: ramię wysuwa ją do kamery, kamera podjeżdża, pod spodem są linki.
- Na końcu ramię bierze pióro z kubka i podpisuje się tymi samymi pociągnięciami co w intro.
- Nowe opisy projektów, nowa kolejność i magisterka (G2 Esports) jako projekt 02.
- Przewijany widok: tytuł i jedno zdanie. Przybliżenie karty: kontekst, pełny opis, tagi, linki (demo, PDF, GitHub). Przewinięcie zamyka przybliżenie.
- Zakończenie (pióro i podpis) leci na czasie, niezależnie od przewijania.
- PDF magisterki zanonimizowany (nowa strona tytułowa bez numeru albumu i promotora). Oryginał jest w `.gitignore`.
- Linki do repozytoriów: IKEchecker, AgeOfWar, Dancegame, Portfolio-site. Głowa reaguje na kursor w całym pierwszym ekranie.
- GIF-y zamienione na MP4 z plakatami (62 MB → 5,8 MB), w `assets/video/`.

## Do uzupełnienia

- [ ] IKE Tracker: nowy filmik albo zrzut ekranu, bo obecne nagranie ma długie ciemne fragmenty.
- [ ] Tic-Tac-Toe i Line Follower nie mają podpiętego repozytorium (PAMSI3 jest puste, PROJEKT3 nie zwraca plików). Jeśli kod jest gdzieś indziej, dodaj `data-repo` w sekcji.
- [ ] `lol-draft-predictor` (puste repo): kandydat na przyszłą kartę ML.
- [ ] Polska wersja opisów projektów (teraz są po angielsku, jak reszta strony).
- [ ] Własny podpis (SVG ze ścieżkami), jeśli ma zastąpić czcionkę Hershey Script.

## Następne etapy

1. ~~**Nowa karta „O mnie”**~~: zrobiona jako jazda line followerem po mózgu-planecie (szczegóły w KLIMAT.md i niżej).
2. **Grywalne mini-demo z manipulatorem:** ~~Tic-Tac-Toe~~ zrobione: „Play against the robot” przy projekcie, ramię odkłada kartę, bierze pióro, rysuje planszę na szybie i gra minimaksem (najlepszy wynik to remis). Zostają: Line Follower po narysowanej linii, interaktywny wykres IKE.

## Jazda po mózgu („O mnie”): plan poprawek

Z przeglądu animacji (skill improve-animations, Emil Kowalski) i uwag po przejeździe.

**Zrobione w tej rundzie:**

- [x] **Przyspieszenie jak bug:** pola przyspieszenia schowane. Kółko i gładzik ustawiają teraz „gaz”, a prędkość dochodzi do niego płynnie (~0,3 s w górę, ~0,5 s w dół). Jedno duże zdarzenie albo bezwładność gładzika nie szarpie robotem.
- [x] **Za długo, hobby za późno:** mniejsza planeta (okrążenie ~28 zamiast ~33), bez pit stopu na końcu, meta zaraz po ML. Hobby (bolid F1, pad, kostka, gitara) unoszą się nad linią jak myśli, z podpisami, w przerwach między etapami. Podpis F1 pokazuje twój czas reakcji.
- [x] **Światła F1** tylko przy pierwszym wejściu w sesji, potem od razu jazda.
- [x] **Opis etapu wychodzi z etapu:** pomarańczowa linia od karty do stacji rysuje się, a na stacji ląduje kropka. Tekst jest od razu ułożony (blady), linijki wchodzą od lewej w tempie jazdy i ostatnia jest przed dojazdem do stacji. Karta ma pełne tło i większy tekst.
- [x] **Pomijanie sekcji:** pierwsze przewinięcie w dół z hero wjeżdża w głowę (raz na wizytę). Przycisk „Skip to projects →” jest stale w rogu, a „Projects” w menu też pomija. Po jeździe, pominięciu albo skoku linkiem strona przewija się normalnie.
- [x] **Projekty odsyłają do jazdy:** przy projekcie „built with” i lista umiejętności. Zebrane w jeździe są pomarańczowe, brakujące przerywane, plus link „collect them in my head →”.

**Schowane na później** (kod jest, przełączniki `SHOW` w `src/journey.js`). Dodamy tam, gdzie na trasie zrobi się pusto:

- [ ] Łuki synaps nad linią (błyskają przy przejeździe).
- [ ] Wspomnienia projektów przy linii (line follower, kółko i krzyżyk, gra taneczna, Age of Sigma).
- [ ] Pola przyspieszenia (jeśli wrócą: widoczne z daleka i z łagodnym rozpędem).

**Pomysły na dalej:**

- [ ] Hasła namalowane na drodze, np. „11.84 s”, „50 respondents”, „FIFO”: krótkie, czytane w przejeździe.
- [ ] Zapowiedź jazdy w hero: kawałek linii i robot czekający pod bramą START.
- [ ] Jedna linijka „O mnie w 10 sekund” pod hero dla tych, którzy nie pojadą.
- [x] Kostka i gitara w jeździe (decyzja po przeglądzie skillem find-animation-opportunities: bez zabawek do obsługi, tylko chwila przy przejeździe). Kostka zjeżdża obok robota, układa się w 5 ruchach, chwilę leci z nim i rozsypuje się. Gitara: drgające struny, cichy akord a-moll, nutki z cząstek.
- [ ] Sprawdzić na prawdziwym gładziku i telefonie, czy gaz jest dobrze wyważony.

## Pomysły na kliknięcie w kartę

To alternatywa dla obecnego przybliżenia albo rozwinięcie go.

1. **Czytnik kartridży.** Ramię wkłada kartę do „konsoli” albo terminala obok magazynka. Ekran się włącza, z krótkim efektem CRT, i odpala filmik na dużym ekranie z opisem. Pasuje szczególnie do gier (Age of Sigma, Dance Game).
2. **Projektor.** Ramię podnosi kartę pod projektor, wiązka światła wyświetla filmik na całym tle, a strona przygasa jak w kinie.
3. **Karta rozsypuje się w cząsteczki,** które układają się w duży ekran. Wokół krążą etykiety technologii.
4. **Odwrócenie karty** jak karty kolekcjonerskiej. Na tyle: stack, moja rola, czas, największe wyzwanie, linki.
5. **Grywalne mini-demo dla wybranych projektów:**
   - Tic-Tac-Toe: zagraj z robotem, który fizycznie stawia swoje znaki (minimax).
   - Line Follower: narysuj linię kursorem, a mały robot z cząsteczek po niej jedzie.
   - IKE Tracker: interaktywny wykres zamiast filmiku.

## Alternatywny układ: ramię i tytuły projektów jako główny element

Zamiast przewijania po kolei: magazynek z tytułami projektów na „zakładkach” kart. Kliknięcie w tytuł → ramię wyciąga kartę → jedna z reakcji powyżej (najlepiej czytnik kartridży albo mini-demo). Przewijanie mogłoby wtedy przewijać zakładki, a nie całe sceny.

## Inne pomysły

- **Umiejętności jako magazynek narzędzi:** ramię wymienia końcówki z etykietami Python, SQL, C#, JS, jak robot w fabryce z wymiennikiem narzędzi.
- **Hobby: kostka Rubika z cząsteczek,** która po kliknięciu układa się w dokładnie 11,84 s (rekord).
- **Ekran ładowania „kalibracja robota”** zamiast pustej strony, zanim wczyta się zdjęcie i model.
- **Ciche dźwięki serw** przy ruchach ramienia, domyślnie wyłączone, z przełącznikiem.
- **Publikacja:** podmiana starej strony na prototyp i wdrożenie na GitHub Pages albo Vercel.
