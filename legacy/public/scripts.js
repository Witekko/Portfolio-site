document.addEventListener("DOMContentLoaded", function () {
    // Efekt pisania
    const phrases = [
        "Developer",
        "Robotics enthusiast",
        "Man of many talents"
    ];
    let currentPhraseIndex = 0;
    let currentCharIndex = 0;
    let isDeleting = false;
    let textElement = document.getElementById("changing-text");

    function typeEffect() {
        const currentPhrase = phrases[currentPhraseIndex];
        if (isDeleting) {
            textElement.textContent = currentPhrase.substring(0, currentCharIndex - 1);
            currentCharIndex--;
            if (currentCharIndex === 0) {
                isDeleting = false;
                currentPhraseIndex = (currentPhraseIndex + 1) % phrases.length;
            }
        } else {
            textElement.textContent = currentPhrase.substring(0, currentCharIndex + 1);
            currentCharIndex++;
            if (currentCharIndex === currentPhrase.length) {
                isDeleting = true;
            }
        }
        setTimeout(typeEffect, isDeleting ? 100 : 200);
    }

    typeEffect();

    // Animacja emoji
    let emoji = document.querySelector(".emoji");
    let isWinking = true;

    setInterval(() => {
        emoji.textContent = isWinking ? "😏" : "😉";
        isWinking = !isWinking;
    }, 1500);

    // Płynne przewijanie i obsługa linków zewnętrznych
    document.querySelectorAll('.nav-link').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href.startsWith('http://') || href.startsWith('https://')) {
                window.location.href = href;
            } else if (href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);
                const target = document.getElementById(targetId);
                if (target) {
                    const headerHeight = document.querySelector("header")?.offsetHeight || 0;
                    const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // Aktywne linki w nawigacji na podstawie widocznej sekcji
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }, {
        root: null,
        threshold: 0.5
    });

    sections.forEach(section => observer.observe(section));

    // Sekcja hobby
    const hobbyCards = document.querySelectorAll(".hobby-card");

    hobbyCards.forEach(card => {
        let noteInterval = null; // Inicjalizujemy zmienną na null
        let isHovered = false; // Flaga do śledzenia, czy kursor jest na kafelku

        card.addEventListener("mouseenter", function () {
            if (isHovered) return; // Jeśli kursor już jest na kafelku, nie wykonuj ponownie
            isHovered = true;

            const hobby = this.getAttribute("data-hobby");
            if (hobby === "rubik") {
                this.querySelector("img").style.transform = "rotate(45deg)";
            } else if (hobby === "music") {
                this.innerHTML += '<audio autoplay><source src="https://www.myinstants.com/media/sounds/guitar-chord.mp3" type="audio/mp3"></audio>';
                const notesContainer = this.querySelector(".music-notes");
                // Generowanie nutek co 300ms, gdy kursor jest na kaflu
                noteInterval = setInterval(() => {
                    if (!isHovered) return; // Nie generuj nutek, jeśli kursor opuścił kafelek
                    const note = document.createElement("span");
                    note.classList.add("note");
                    note.textContent = Math.random() > 0.5 ? "♪" : "♫"; // Losowy symbol nutki
                    note.style.left = `${Math.random() * 80 + 10}%`; // Losowa pozycja od 10% do 90%
                    notesContainer.appendChild(note);
                    note.addEventListener("animationend", () => {
                        note.remove();
                    });
                }, 300);
            } else if (hobby === "games") {
                // Galeria gier jest już obsługiwana przez CSS
            }
        });

        card.addEventListener("mouseleave", function () {
            isHovered = false; // Ustawiamy flagę na false po opuszczeniu kafla

            const hobby = this.getAttribute("data-hobby");
            if (hobby === "rubik") {
                this.querySelector("img").style.transform = "rotate(0deg)";
            } else if (hobby === "music" || hobby === "f1") {
                const audio = this.querySelector("audio");
                if (audio) audio.remove();
                // Zatrzymujemy generowanie nutek
                if (noteInterval) {
                    clearInterval(noteInterval);
                    noteInterval = null; // Resetujemy zmienną
                }
            } else if (hobby === "games") {
                // Nic do zrobienia - galeria jest obsługiwana przez CSS
            }
        });
    });
});