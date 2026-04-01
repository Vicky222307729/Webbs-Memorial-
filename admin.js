const loginCard = document.getElementById("loginCard");
const dashboardCard = document.getElementById("dashboardCard");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const logoutButton = document.getElementById("logoutButton");
const adminStats = document.getElementById("adminStats");
const donationTableBody = document.getElementById("donationTableBody");
const adminGreeting = document.getElementById("adminGreeting");

function setLoginStatus(message, isError = false) {
  loginStatus.textContent = message;
  loginStatus.className = `form-status ${isError ? "status-error" : "status-success"}`;
}

function showDashboard(isVisible) {
  loginCard.classList.toggle("hidden", isVisible);
  dashboardCard.classList.toggle("hidden", !isVisible);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(amount);
}

function renderDashboard(payload) {
  const { summary, donations } = payload;
  adminStats.innerHTML = `
    <div class="admin-stat-card">
      <span>Total Donations</span>
      <strong>${summary.donationCount}</strong>
    </div>
    <div class="admin-stat-card">
      <span>Total Amount</span>
      <strong>${formatCurrency(summary.totalAmount)}</strong>
    </div>
    <div class="admin-stat-card">
      <span>Average Donation</span>
      <strong>${formatCurrency(summary.averageAmount)}</strong>
    </div>
  `;

  donationTableBody.innerHTML = donations.length
    ? donations
        .map(
          (donation) => `
            <tr>
              <td>${donation.donorName}<br /><small>${donation.donorEmail}</small></td>
              <td>${formatCurrency(donation.amount)}</td>
              <td>${donation.purpose}</td>
              <td>${donation.phone || "-"}</td>
              <td>${donation.message || "-"}</td>
              <td>${new Date(donation.createdAt).toLocaleString("en-IN")}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="6">No donations have been submitted yet.</td>
      </tr>
    `;
}

async function loadDashboard() {
  const response = await fetch("/api/admin/summary");
  if (!response.ok) {
    throw new Error("Unable to load the donation dashboard.");
  }

  const payload = await response.json();
  renderDashboard(payload);
}

async function checkSession() {
  try {
    const response = await fetch("/api/admin/session");
    if (!response.ok) {
      showDashboard(false);
      return;
    }

    const payload = await response.json();
    adminGreeting.textContent = `Welcome back, ${payload.user.username}.`;
    showDashboard(true);
    await loadDashboard();
  } catch (error) {
    showDashboard(false);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  setLoginStatus("Signing in...");

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Login failed.");
    }

    adminGreeting.textContent = `Welcome back, ${result.user.username}.`;
    showDashboard(true);
    setLoginStatus("");
    await loadDashboard();
  } catch (error) {
    setLoginStatus(error.message, true);
  }
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST" });
  showDashboard(false);
  setLoginStatus("You have been logged out.");
});

checkSession();
