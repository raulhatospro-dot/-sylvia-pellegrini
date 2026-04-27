/* ============================================
   SYLVIA PELLEGRINI — Scripts
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {



    // ---------- Year ----------
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // ---------- Header scroll state ----------
    const header = document.getElementById('header');
    const onScroll = () => {
        if (window.scrollY > 40) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ---------- Burger menu ----------
    const burger = document.getElementById('burger');
    const nav = document.getElementById('mainNav');

    const closeMenu = () => {
        burger.classList.remove('active');
        nav.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    };

    burger.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('open');
        burger.classList.toggle('active', isOpen);
        burger.setAttribute('aria-expanded', String(isOpen));
        document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nav.classList.contains('open')) closeMenu();
    });

    // ---------- Smooth scroll (natural CSS handles it, but offset for anchors) ----------
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const id = a.getAttribute('href');
            if (id.length > 1) {
                const target = document.querySelector(id);
                if (target) {
                    e.preventDefault();
                    const top = target.getBoundingClientRect().top + window.scrollY - 70;
                    window.scrollTo({ top, behavior: 'smooth' });
                }
            }
        });
    });

    // ---------- Reveal on scroll ----------
    let revealObserver = null;
    if ('IntersectionObserver' in window) {
        revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    }
    const observeReveals = (root = document) => {
        const els = root.querySelectorAll('.reveal:not(.visible)');
        if (revealObserver) {
            els.forEach(el => revealObserver.observe(el));
        } else {
            els.forEach(el => el.classList.add('visible'));
        }
    };
    observeReveals();

    // ---------- Événements dynamiques (events.json) ----------
    loadEvents(observeReveals);

    // ---------- Contact form → Formspree ----------
    const form = document.getElementById('contactForm');
    const status = document.getElementById('formStatus');
    const successEl = document.getElementById('formSuccess');
    const successBackBtn = document.getElementById('formSuccessBack');
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            status.textContent = '';
            status.className = 'form-status';

            // Validation minimale côté client
            const data = new FormData(form);
            const prenom  = (data.get('prénom')  || '').toString().trim();
            const nom     = (data.get('nom')     || '').toString().trim();
            const email   = (data.get('email')   || '').toString().trim();
            const message = (data.get('message') || '').toString().trim();

            if (!prenom || !nom || !email || !message) {
                status.textContent = 'Merci de remplir tous les champs.';
                status.classList.add('error');
                return;
            }
            const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRx.test(email)) {
                status.textContent = 'Adresse email invalide.';
                status.classList.add('error');
                return;
            }

            // État "envoi en cours"
            const originalBtnText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Envoi en cours...';

            try {
                // Envoi AJAX vers Formspree — l'action du formulaire contient l'URL
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: data,
                    headers: { 'Accept': 'application/json' }
                });

                if (response.ok) {
                    // Succès : on masque le formulaire, on affiche le message
                    form.reset();
                    form.hidden = true;
                    if (successEl) {
                        successEl.hidden = false;
                        successEl.classList.add('visible');
                        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                } else {
                    // Erreur côté Formspree (mauvais form ID, quota, etc.)
                    const json = await response.json().catch(() => ({}));
                    const msg = (json.errors && json.errors[0] && json.errors[0].message)
                        || "Une erreur est survenue. Merci de réessayer.";
                    status.textContent = msg;
                    status.classList.add('error');
                }
            } catch (err) {
                console.error('Formspree error:', err);
                status.textContent = "Erreur réseau. Merci de réessayer ou d'écrire directement à vlisya@hotmail.fr.";
                status.classList.add('error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        });

        // Bouton "Envoyer un autre message" : réaffiche le formulaire
        if (successBackBtn) {
            successBackBtn.addEventListener('click', () => {
                if (successEl) successEl.hidden = true;
                form.hidden = false;
                status.textContent = '';
                status.className = 'form-status';
                const firstField = form.querySelector('input[name="prénom"]');
                if (firstField) firstField.focus();
            });
        }
    }
});

/* ============ CAROUSEL TÉMOIGNAGES ============ */
(function () {
    const carousel = document.getElementById('reviewCarousel');
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const slides = carousel.querySelectorAll('.carousel-slide');
    const prevBtn = carousel.querySelector('.carousel-prev');
    const nextBtn = carousel.querySelector('.carousel-next');
    const dotsContainer = document.getElementById('carouselDots');
    let current = 0;
    const total = slides.length;

    // Create dots
    slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', 'Témoignage ' + (i + 1));
        dot.addEventListener('click', () => goTo(i));
        dotsContainer.appendChild(dot);
    });

    function goTo(index) {
        current = (index + total) % total;
        track.style.transform = 'translateX(-' + (current * 100) + '%)';
        dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) => {
            d.classList.toggle('active', i === current);
        });
    }

    prevBtn.addEventListener('click', () => goTo(current - 1));
    nextBtn.addEventListener('click', () => goTo(current + 1));

    // Auto-advance every 6s
    let autoPlay = setInterval(() => goTo(current + 1), 6000);
    carousel.addEventListener('mouseenter', () => clearInterval(autoPlay));
    carousel.addEventListener('mouseleave', () => {
        autoPlay = setInterval(() => goTo(current + 1), 6000);
    });

    // Swipe support
    let startX = 0;
    track.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', e => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) goTo(current + (diff > 0 ? 1 : -1));
    });
})();

/* ============================================================
   CHARGEMENT DES ÉVÉNEMENTS
   ------------------------------------------------------------
   Les événements sont lus depuis events.json et triés :
     • les 'upcoming' d'abord, du plus proche au plus lointain
     • les 'past' ensuite, du plus récent au plus ancien
   ============================================================ */
const MONTHS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

function formatDay(dateStr) {
    const parts = dateStr.split('-');
    return parts[2] || '??';
}
function formatMonth(dateStr) {
    const parts = dateStr.split('-');
    const idx = parseInt(parts[1], 10) - 1;
    return MONTHS_FR[idx] || '';
}
function formatYear(dateStr) {
    return dateStr.split('-')[0] || '';
}
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderEvent(ev) {
    const isPast = ev.statut === 'past';
    const day    = escapeHtml(formatDay(ev.date));
    const month  = escapeHtml(formatMonth(ev.date));
    const year   = escapeHtml(formatYear(ev.date));
    const titre  = escapeHtml(ev.titre);
    const lieu   = escapeHtml(ev.lieu);
    const heure  = escapeHtml(ev.heure);
    const type   = escapeHtml(capitalize(ev.type));
    const metaParts = [];
    if (ev.lieu)  metaParts.push(lieu);
    if (ev.heure) metaParts.push(heure);
    const meta = metaParts.join(' — ');

    // CTA : seulement si un lien est fourni ET événement à venir
    let cta = '';
    if (!isPast && ev.lien) {
        cta = `<a href="${escapeHtml(ev.lien)}" target="_blank" rel="noopener" class="event-cta">Réserver →</a>`;
    } else if (isPast) {
        cta = `<span class="event-cta archived">${year}</span>`;
    } else {
        cta = `<a href="#contact" class="event-cta">S'inscrire →</a>`;
    }

    return `
        <article class="event reveal${isPast ? ' event-past' : ''}">
            <div class="event-date">
                <span class="event-day">${day}</span>
                <span class="event-month">${month}</span>
            </div>
            <div class="event-body">
                ${type ? `<span class="event-tag">${type}</span>` : ''}
                <h3>${titre}</h3>
                ${meta ? `<span class="event-meta">${meta}</span>` : ''}
            </div>
            ${cta}
        </article>
    `;
}

function loadEvents(onRendered) {
    const container = document.getElementById('eventsList');
    if (!container) return;

    fetch('events.json', { cache: 'no-cache' })
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(data => {
            const events = Array.isArray(data.events) ? data.events.slice() : [];

            // Tri : upcoming d'abord (asc), past ensuite (desc)
            const upcoming = events
                .filter(e => e.statut === 'upcoming')
                .sort((a, b) => a.date.localeCompare(b.date));
            const past = events
                .filter(e => e.statut === 'past')
                .sort((a, b) => b.date.localeCompare(a.date));

            if (upcoming.length === 0 && past.length === 0) {
                container.innerHTML = '<p class="events-empty">Aucun événement programmé pour le moment. Revenez bientôt !</p>';
                return;
            }

            let html = '';
            upcoming.forEach(ev => { html += renderEvent(ev); });

            if (past.length > 0) {
                html += '<h4 class="events-archive-title">Archives</h4>';
                past.forEach(ev => { html += renderEvent(ev); });
            }

            container.innerHTML = html;
            if (typeof onRendered === 'function') onRendered(container);
        })
        .catch(err => {
            console.error('Erreur chargement events.json:', err);
            container.innerHTML = '<p class="events-empty">Impossible de charger les événements pour le moment.</p>';
        });
}
