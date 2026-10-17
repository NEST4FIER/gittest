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

const calmMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    if (!calmMotion) {
      f.y -= f.speed;
      f.x += f.drift + Math.sin(time / 3000 + f.phase) * 0.15;
      if (f.y < -5) { f.y = h + 5; f.x = Math.random() * w; }
      if (f.x < -5) f.x = w + 5;
      if (f.x > w + 5) f.x = -5;
    }
  });
  if (!calmMotion) requestAnimationFrame(drawFrost);
}

sizeFrost();
requestAnimationFrame(drawFrost);
window.addEventListener("resize", () => {
  sizeFrost();
  if (calmMotion) requestAnimationFrame(drawFrost);
});

// Salon name "decodes" from random characters when the page loads
document.querySelectorAll("[data-scramble]").forEach((el) => {
  if (calmMotion) return;
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

// Keep the footer year up to date
document.getElementById("year").textContent = new Date().getFullYear();
