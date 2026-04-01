async function loadWebsiteContent() {
  try {
    const response = await fetch("/api/home");
    const data = await response.json();

    document.title = data.title;
    document.getElementById("tagline").textContent = data.tagline;
    document.getElementById("aboutText").textContent = data.about;
    document.getElementById("missionText").textContent = data.mission;

    const statsContainer = document.getElementById("stats");
    statsContainer.innerHTML = data.stats
      .map(
        (item) => `
          <article class="stat-card">
            <span class="stat-value">${item.value}</span>
            <span>${item.label}</span>
          </article>
        `
      )
      .join("");

    const programList = document.getElementById("programList");
    programList.innerHTML = data.programs
      .map(
        (program) => `
          <article class="program-card">
            <h3>${program}</h3>
            <p>We help children receive consistent support, guidance, and care through this program.</p>
          </article>
        `
      )
      .join("");

    const impactList = document.getElementById("impactList");
    impactList.innerHTML = data.donationHighlights
      .map(
        (item) => `
          <div class="impact-item">
            <strong>${item}</strong>
          </div>
        `
      )
      .join("");

    const contactDetails = document.getElementById("contactDetails");
    contactDetails.innerHTML = `
      <div class="contact-item">
        <span>Phone</span>
        <strong>${Array.isArray(data.contact.phone) ? data.contact.phone.join(", ") : data.contact.phone}</strong>
      </div>
      <div class="contact-item">
        <span>Email</span>
        <strong>${data.contact.email}</strong>
      </div>
      <div class="contact-item">
        <span>Address</span>
        <strong>${data.contact.address}</strong>
      </div>
    `;

    document.getElementById("year").textContent = new Date().getFullYear();
  } catch (error) {
    console.error("Unable to load the website content.", error);
  }
}

async function handleDonationSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const status = document.getElementById("donationStatus");

  status.textContent = "Submitting your donation details...";
  status.className = "form-status";

  try {
    const response = await fetch("/api/donations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Unable to submit the donation.");
    }

    form.reset();
    status.textContent = result.message;
    status.className = "form-status status-success";
  } catch (error) {
    status.textContent = error.message;
    status.className = "form-status status-error";
  }
}

loadWebsiteContent();

const donationForm = document.getElementById("donationForm");
if (donationForm) {
  donationForm.addEventListener("submit", handleDonationSubmit);
}
