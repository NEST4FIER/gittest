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

// Keep the footer year up to date
document.getElementById("year").textContent = new Date().getFullYear();
