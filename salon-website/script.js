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

// Background music: calm spa-style chords made by the browser (no song file needed).
// Browsers only allow sound after a visitor taps something, so it starts from the button.
const musicButton = document.getElementById("music-toggle");
const CHORD_SECONDS = 6;
const CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // C major 7
  [220.0, 261.63, 329.63, 392.0],  // A minor 7
  [174.61, 220.0, 261.63, 329.63], // F major 7
  [196.0, 246.94, 293.66, 392.0],  // G
];
let audio, master, filter, musicTimer, suspendTimer, chordIndex = 0;

function playChord(notes, start) {
  notes.forEach((freq) => {
    // Soft, slow pad
    ["sine", "triangle"].forEach((type, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.value = i ? freq / 2 : freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.04, start + 2);
      gain.gain.linearRampToValueAtTime(0, start + CHORD_SECONDS + 2);
      osc.connect(gain).connect(filter);
      osc.start(start);
      osc.stop(start + CHORD_SECONDS + 2.5);
    });
  });
  // A few gentle bell notes on top
  for (let beat = 0; beat < 3; beat++) {
    const t = start + beat * (CHORD_SECONDS / 3) + 0.5;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = notes[Math.floor(Math.random() * notes.length)] * 2;
    gain.gain.setValueAtTime(0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    osc.connect(gain).connect(filter);
    osc.start(t);
    osc.stop(t + 2.6);
  }
}

function nextChord() {
  playChord(CHORDS[chordIndex], audio.currentTime + 0.1);
  chordIndex = (chordIndex + 1) % CHORDS.length;
}

musicButton.addEventListener("click", async () => {
  const isPlaying = musicButton.getAttribute("aria-pressed") === "true";

  if (isPlaying) {
    clearInterval(musicTimer);
    master.gain.setTargetAtTime(0, audio.currentTime, 0.3);
    suspendTimer = setTimeout(() => audio.suspend(), 1500);
    musicButton.setAttribute("aria-pressed", "false");
    musicButton.innerHTML = "&#9835; Play music";
    return;
  }

  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    master = audio.createGain();
    master.gain.value = 0;
    filter.connect(master).connect(audio.destination);
  }
  clearTimeout(suspendTimer);
  await audio.resume();
  master.gain.setTargetAtTime(0.8, audio.currentTime, 0.5);
  nextChord();
  musicTimer = setInterval(nextChord, CHORD_SECONDS * 1000);
  musicButton.setAttribute("aria-pressed", "true");
  musicButton.innerHTML = "&#10074;&#10074; Pause music";
});

// Keep the footer year up to date
document.getElementById("year").textContent = new Date().getFullYear();
