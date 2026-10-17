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

// Booking form: show a thank-you message.
// Note: this does not send the request anywhere yet. To receive bookings
// by email, connect the form to a service like Formspree or Netlify Forms.
const form = document.getElementById("booking-form");
const message = document.getElementById("form-message");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = form.elements.name.value.trim();
  message.textContent = `Thanks, ${name}! We'll reach out soon to confirm your appointment.`;
  form.reset();
});

// Keep the footer year up to date
document.getElementById("year").textContent = new Date().getFullYear();
