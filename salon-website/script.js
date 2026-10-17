// Phone menu: open and close when the ☰ button is tapped
const toggle = document.querySelector(".menu-toggle");
const links = document.querySelector(".nav-links");

toggle.addEventListener("click", () => {
  const isOpen = links.classList.toggle("open");
  toggle.setAttribute("aria-expanded", isOpen);
});

// Close the phone menu after a link is tapped
links.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    links.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  });
});

// Booking form: email each request to the salon using FormSubmit (formsubmit.co).
// The very first request sends an activation email to this address.
// Click the link in that email once, and every request after that arrives in your inbox.
const SALON_EMAIL = "myworksemail2113@gmail.com";

const form = document.getElementById("booking-form");
const message = document.getElementById("form-message");
const submitButton = form.querySelector("button[type='submit']");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = form.elements.name.value.trim();

  submitButton.disabled = true;
  submitButton.textContent = "Sending...";
  message.textContent = "";

  try {
    const response = await fetch(`https://formsubmit.co/ajax/${SALON_EMAIL}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: `New booking request from ${name}`,
        _template: "table",
        _captcha: "false",
        Name: name,
        Phone: form.elements.phone.value,
        Service: form.elements.service.value,
        Date: form.elements.date.value,
        Time: form.elements.time.value,
        Notes: form.elements.notes.value,
      }),
    });
    if (!response.ok) throw new Error("Request failed");

    message.textContent = `Thanks, ${name}! I'll reach out soon to confirm your appointment.`;
    form.reset();
  } catch (error) {
    message.textContent = "Sorry, your request didn't go through. Please call or text (928) 793-2425 to book.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send Request";
  }
});

// Background music: "Meditation Impromptu 02" by Kevin MacLeod (CC BY 3.0, credited in the footer).
// Browsers only allow sound after a visitor taps something, so it starts from the button.
const musicButton = document.getElementById("music-toggle");
const music = document.getElementById("bg-music");
const MUSIC_VOLUME = 0.6;
let fadeTimer;

// Gently raise or lower the volume instead of starting and stopping abruptly
function fadeTo(target, done) {
  clearInterval(fadeTimer);
  fadeTimer = setInterval(() => {
    const step = target > music.volume ? 0.05 : -0.05;
    const next = music.volume + step;
    if ((step > 0 && next >= target) || (step < 0 && next <= target)) {
      music.volume = target;
      clearInterval(fadeTimer);
      if (done) done();
    } else {
      music.volume = next;
    }
  }, 80);
}

musicButton.addEventListener("click", async () => {
  if (musicButton.getAttribute("aria-pressed") === "true") {
    fadeTo(0, () => music.pause());
    musicButton.setAttribute("aria-pressed", "false");
    musicButton.innerHTML = "&#9835; Play music";
    return;
  }

  try {
    music.volume = 0;
    await music.play();
    fadeTo(MUSIC_VOLUME);
    musicButton.setAttribute("aria-pressed", "true");
    musicButton.innerHTML = "&#10074;&#10074; Pause music";
  } catch (error) {
    musicButton.textContent = "Music unavailable";
  }
});

// Visitors can ask their phone or computer for less motion; check it live so changes apply right away
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const calmMotion = () => motionQuery.matches;
let frostRunning = false;

// Welcome banner: slow, drifting ice particles that glow and twinkle
const frost = document.getElementById("frost");
const ctx = frost.getContext("2d");
let flakes = [];

function sizeFrost() {
  const ratio = window.devicePixelRatio || 1;
  frost.width = frost.offsetWidth * ratio;
  frost.height = frost.offsetHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const count = Math.round((frost.offsetWidth * frost.offsetHeight) / 9000);
  flakes = Array.from({ length: count }, () => ({
    x: Math.random() * frost.offsetWidth,
    y: Math.random() * frost.offsetHeight,
    r: Math.random() * 1.6 + 0.3,
    speed: Math.random() * 0.25 + 0.05,
    drift: Math.random() * 0.4 - 0.2,
    phase: Math.random() * Math.PI * 2,
  }));
}

function drawFrost(time) {
  const w = frost.offsetWidth;
  const h = frost.offsetHeight;
  ctx.clearRect(0, 0, w, h);
  flakes.forEach((f) => {
    const twinkle = 0.45 + 0.55 * Math.sin(time / 900 + f.phase);
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(215, 235, 255, ${0.15 + twinkle * 0.6})`;
    ctx.shadowColor = "rgba(111, 179, 255, 0.9)";
    ctx.shadowBlur = f.r * 6;
    ctx.fill();
    if (!calmMotion()) {
      f.y -= f.speed;
      f.x += f.drift + Math.sin(time / 3000 + f.phase) * 0.15;
      if (f.y < -5) { f.y = h + 5; f.x = Math.random() * w; }
      if (f.x < -5) f.x = w + 5;
      if (f.x > w + 5) f.x = -5;
    }
  });
  frostRunning = !calmMotion();
  if (frostRunning) requestAnimationFrame(drawFrost);
}

sizeFrost();
requestAnimationFrame(drawFrost);
window.addEventListener("resize", () => {
  sizeFrost();
  if (!frostRunning) requestAnimationFrame(drawFrost);
});
motionQuery.addEventListener("change", () => {
  if (!frostRunning) requestAnimationFrame(drawFrost);
});

// Salon name "decodes" from random characters when the page loads
document.querySelectorAll("[data-scramble]").forEach((el) => {
  if (calmMotion()) return;
  const finalText = el.textContent;
  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*/<>[]";
  el.setAttribute("aria-label", finalText);
  let frame = 0;
  const timer = setInterval(() => {
    el.textContent = finalText
      .split("")
      .map((ch, i) => {
        if (ch === " " || i < frame / 3) return ch;
        return glyphs[Math.floor(Math.random() * glyphs.length)];
      })
      .join("");
    frame++;
    if (frame / 3 > finalText.length) {
      clearInterval(timer);
      el.textContent = finalText;
    }
  }, 45);
});

// Services list: when the mouse passes over a service, its letters slowly melt like
// snow (blur, drift and fade) and softly re-form in a wave across the word, an icy glow
// follows the mouse, and snowflakes drift down from the cursor.
// Clicking a service picks it in the booking form.
const SNOW = "·•°*";
const MELT_MS = 1600;     // how long each letter takes to melt and re-form
const LETTER_GAP_MS = 60; // pause between letters, so the melt rolls across the word
const serviceList = document.querySelector(".service-list");

// Split each name and price into letters (grouped by word so lines still wrap between words)
document.querySelectorAll("[data-snow]").forEach((el) => {
  const words = el.textContent.split(" ");
  let index = 0;
  el.textContent = "";
  words.forEach((word, w) => {
    if (w > 0) {
      el.append(" ");
      index++;
    }
    const wordBox = document.createElement("span");
    wordBox.className = "snow-word";
    [...word].forEach((ch) => {
      const letter = document.createElement("span");
      letter.className = "snow-letter";
      letter.textContent = ch;
      letter.dataset.ch = ch;
      letter.style.setProperty("--i", index++);
      wordBox.append(letter);
    });
    el.append(wordBox);
  });
});

function meltText(el) {
  if (el.classList.contains("melting")) return; // let a melt finish smoothly before starting again
  const letters = el.querySelectorAll(".snow-letter");
  el.classList.add("melting");
  letters.forEach((letter) => {
    const start = Number(letter.style.getPropertyValue("--i")) * LETTER_GAP_MS;
    // While the letter is blurred and faint, it briefly becomes a snowflake
    setTimeout(() => {
      letter.textContent = SNOW[Math.floor(Math.random() * SNOW.length)];
    }, start + MELT_MS * 0.32);
    setTimeout(() => {
      letter.textContent = letter.dataset.ch;
    }, start + MELT_MS * 0.7);
  });
  const total = (letters.length - 1) * LETTER_GAP_MS + MELT_MS;
  setTimeout(() => el.classList.remove("melting"), total + 50);
}

function dropSnowflake(x, y) {
  if (serviceList.querySelectorAll(".snowflake").length > 60) return;
  const flake = document.createElement("span");
  const size = 2 + Math.random() * 2.5;
  const life = 2.2 + Math.random() * 1.4;
  flake.className = "snowflake";
  flake.setAttribute("aria-hidden", "true");
  flake.style.left = `${x - size / 2}px`;
  flake.style.top = `${y - size / 2}px`;
  flake.style.setProperty("--size", `${size}px`);
  flake.style.setProperty("--sway", `${(Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 10)}px`);
  flake.style.setProperty("--dy", `${50 + Math.random() * 60}px`);
  flake.style.setProperty("--life", `${life}s`);
  serviceList.append(flake);
  // Removed on a timer (not on animation end) so flakes never get stuck on screen
  setTimeout(() => flake.remove(), life * 1000 + 100);
}

document.querySelectorAll(".service-row").forEach((row) => {
  const snowText = row.querySelectorAll("[data-snow]");
  // Screen readers get the plain words, never the snow symbols
  row.setAttribute(
    "aria-label",
    [...row.querySelectorAll(".service-name, .service-note, .service-price")]
      .map((el) => el.textContent.trim())
      .join(", ") + ". Book this service."
  );
  let lastFlake = 0;

  const melt = () => {
    if (!calmMotion()) snowText.forEach(meltText);
  };
  row.addEventListener("pointerenter", melt);
  row.addEventListener("focus", melt);

  row.addEventListener("pointermove", (event) => {
    const box = row.getBoundingClientRect();
    row.style.setProperty("--x", `${event.clientX - box.left}px`);
    row.style.setProperty("--y", `${event.clientY - box.top}px`);
    if (!calmMotion() && event.timeStamp - lastFlake > 90) {
      lastFlake = event.timeStamp;
      const listBox = serviceList.getBoundingClientRect();
      dropSnowflake(event.clientX - listBox.left, event.clientY - listBox.top);
    }
  });

  row.addEventListener("click", () => {
    form.elements.service.value = row.dataset.service;
  });
});

// Keep the footer year up to date
document.getElementById("year").textContent = new Date().getFullYear();
