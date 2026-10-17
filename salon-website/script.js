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

// Background sound: a flowing river with soft, slow chords, all made by the browser
// (no song file needed). Browsers only allow sound after a visitor taps something,
// so it starts from the button.
const musicButton = document.getElementById("music-toggle");
const CHORD_SECONDS = 10;
const CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // C major 7
  [220.0, 261.63, 329.63, 392.0],  // A minor 7
  [174.61, 220.0, 261.63, 329.63], // F major 7
  [196.0, 246.94, 293.66, 392.0],  // G
];
let audio, master, filter, musicTimer, bubbleTimer, suspendTimer, chordIndex = 0;

// A few seconds of "brown noise", the deep rushing sound that water makes
function makeNoise(seconds) {
  const buffer = audio.createBuffer(1, audio.sampleRate * seconds, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buffer;
}

// Slowly rises and falls a sound's volume, like water swelling and easing
function addSwell(gainNode, base, depth, speed) {
  const lfo = audio.createOscillator();
  const lfoGain = audio.createGain();
  lfo.frequency.value = speed;
  lfoGain.gain.value = depth;
  gainNode.gain.value = base;
  lfo.connect(lfoGain).connect(gainNode.gain);
  lfo.start();
}

function startRiver() {
  const noise = makeNoise(6);

  // Deep, steady flow
  const flow = audio.createBufferSource();
  flow.buffer = noise;
  flow.loop = true;
  const flowFilter = audio.createBiquadFilter();
  flowFilter.type = "lowpass";
  flowFilter.frequency.value = 700;
  const flowGain = audio.createGain();
  addSwell(flowGain, 0.35, 0.1, 0.07);
  flow.connect(flowFilter).connect(flowGain).connect(master);
  flow.start();

  // Lighter rushing water on top
  const rush = audio.createBufferSource();
  rush.buffer = noise;
  rush.loop = true;
  rush.playbackRate.value = 1.7;
  const rushFilter = audio.createBiquadFilter();
  rushFilter.type = "bandpass";
  rushFilter.frequency.value = 1400;
  rushFilter.Q.value = 0.7;
  const rushGain = audio.createGain();
  addSwell(rushGain, 0.12, 0.06, 0.19);
  rush.connect(rushFilter).connect(rushGain).connect(master);
  rush.start();

  scheduleBubble();
}

// Little water bubbles and trickles at random moments
function scheduleBubble() {
  bubbleTimer = setTimeout(() => {
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const pitch = 500 + Math.random() * 700;
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.8, t + 0.06);
    gain.gain.setValueAtTime(0.015 + Math.random() * 0.015, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.1);
    scheduleBubble();
  }, 120 + Math.random() * 700);
}

function playChord(notes, start) {
  // Soft, slow pad that fades in and out under the water
  notes.forEach((freq) => {
    ["sine", "triangle"].forEach((type, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.value = i ? freq / 2 : freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.022, start + 4);
      gain.gain.linearRampToValueAtTime(0, start + CHORD_SECONDS + 4);
      osc.connect(gain).connect(filter);
      osc.start(start);
      osc.stop(start + CHORD_SECONDS + 4.5);
    });
  });
  // Two gentle, far-away bell notes
  for (let beat = 0; beat < 2; beat++) {
    const t = start + beat * (CHORD_SECONDS / 2) + 1 + Math.random();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = notes[Math.floor(Math.random() * notes.length)] * 2;
    gain.gain.setValueAtTime(0.015, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    osc.connect(gain).connect(filter);
    osc.start(t);
    osc.stop(t + 4.1);
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
    clearTimeout(bubbleTimer);
    master.gain.setTargetAtTime(0, audio.currentTime, 0.4);
    suspendTimer = setTimeout(() => audio.suspend(), 2000);
    musicButton.setAttribute("aria-pressed", "false");
    musicButton.innerHTML = "&#9835; Play music";
    return;
  }

  clearTimeout(suspendTimer);
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    master = audio.createGain();
    master.gain.value = 0;
    master.connect(audio.destination);
    filter = audio.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    filter.connect(master);
    await audio.resume();
    startRiver();
  } else {
    await audio.resume();
    scheduleBubble();
  }
  master.gain.setTargetAtTime(0.8, audio.currentTime, 1);
  nextChord();
  musicTimer = setInterval(nextChord, CHORD_SECONDS * 1000);
  musicButton.setAttribute("aria-pressed", "true");
  musicButton.innerHTML = "&#10074;&#10074; Pause music";
});

// Keep the footer year up to date
document.getElementById("year").textContent = new Date().getFullYear();
