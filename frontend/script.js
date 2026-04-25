/* ============================================================
   PREMA — script.js
   prema.red · Mutual Aid Tool by The Red Party
   ============================================================ */

/* ── API ── */
const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3000/api'
  : 'https://dev.prema.red/api';

/* ── CHAIN BUTTON ── */
function buildChains() {
  const left = document.getElementById("chain-left");
  const right = document.getElementById("chain-right");
  if (!left || !right) return;

  // 5 links per side, alternating h/v
  [left, right].forEach((side) => {
    side.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      const link = document.createElement("span");
      link.className = i % 2 === 0 ? "chain-link-h" : "chain-link-v";
      side.appendChild(link);
    }
  });
}

function discardChains() {
  localStorage.setItem("chainsBroken", "true");
  const wrap = document.getElementById("chain-btn-wrap");
  const btn = document.getElementById("chain-btn");
  const frags = document.getElementById("chain-fragments");
  if (!wrap || !btn) return;

  // Gather all visible link positions relative to wrap
  const wrapRect = wrap.getBoundingClientRect();
  const links = btn.querySelectorAll(".chain-link-h, .chain-link-v");

  links.forEach((link, i) => {
    const r = link.getBoundingClientRect();
    const cx = r.left - wrapRect.left + r.width / 2;
    const cy = r.top - wrapRect.top + r.height / 2;
    const isH = link.classList.contains("chain-link-h");

    const frag = document.createElement("span");
    frag.className = "chain-fragment";
    frag.style.cssText = `
      width:  ${isH ? 22 : 13}px;
      height: ${isH ? 13 : 22}px;
      left:   ${cx - (isH ? 11 : 6.5)}px;
      top:    ${cy - (isH ? 6.5 : 11)}px;
      --tx:   ${(Math.random() - 0.5) * 280}px;
      --ty:   ${Math.random() * -200 - 60}px;
      --rot:  ${(Math.random() - 0.5) * 720}deg;
      --dur:  ${0.55 + Math.random() * 0.35}s;
      --delay:${i * 0.025}s;
    `;
    frags.appendChild(frag);

    // Tiny delay so element is in DOM before class triggers animation
    requestAnimationFrame(() => frag.classList.add("breaking"));
  });

  // Hide original links immediately
  btn.querySelectorAll(".chain-side").forEach((s) => {
    s.style.opacity = "0";
  });
  wrap.classList.add("shattering");

  // Dissolve hero after fragments land
  setTimeout(() => {
    const hero = document.querySelector(".hero");
    if (hero) {
      hero.classList.add("dissolving");
      hero.addEventListener("transitionend", () => hero.classList.add("gone"), {
        once: true,
      });
    }
  }, 480);
}

/* ── PAGE ROUTING ── */
let currentPage = "board";

function urlFor(id) {
  const map = {
    board: "/",
    orgs: "/orgs",
    inbox: "/inbox",
    settings: "/settings",
    admin: "/admin",
    about: "/about",
  };
  return map[id] || null;
}

function showPage(id, pushHistory = true) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-link")
    .forEach((l) => l.classList.toggle("active", l.dataset.page === id));
  const page = document.getElementById("page-" + id);
  if (page) {
    page.classList.add("active");
    window.scrollTo(0, 0);
    currentPage = id;
    document.getElementById("nav-links").classList.remove("open");
  }
  if (pushHistory) {
    const url = urlFor(id);
    if (url) window.history.pushState({ page: id }, "", url);
  }
  const hero = document.querySelector(".hero");
  if (hero && id !== "board") hero.classList.add("gone");
  if (id === "board") initBoard();
  if (id === "orgs") initOrgs();
  if (id === "admin") initAdmin();
  if (id === "inbox") loadInbox();
  if (id === "settings") loadSettings();
}

/* ── ROUTER ── */
async function router() {
  const path = window.location.pathname;

  // /orgs/some-slug
  const orgMatch = path.match(/^\/orgs\/([^/]+)$/);
  if (orgMatch) {
    await openOrgDetail(orgMatch[1], "orgs");
    return;
  }

  // /users/some-username
  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch) {
    await viewProfile(userMatch[1]);
    return;
  }

  // /reset-password/:token
  const resetMatch = path.match(/^\/reset-password\/([^/]+)$/);
  if (resetMatch) {
    showPage("board", false);
    document.getElementById("modal-body").innerHTML = buildResetPasswordModal(
      resetMatch[1],
    );
    document.getElementById("overlay").classList.add("open");
    return;
  }

  // Simple pages
  const pageMap = {
    "/": "board",
    "/orgs": "orgs",
    "/inbox": "inbox",
    "/settings": "settings",
    "/admin": "admin",
    "/about": "about",
  };

  showPage(pageMap[path] || "board", false);
}

window.addEventListener("popstate", router);

function toggleMenu() {
  document.getElementById("nav-links").classList.toggle("open");
}

/* ── TOAST ── */
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

function isMobile() {
  return window.innerWidth <= 680;
}

async function detectLocation(targetInputId) {
  if (!navigator.geolocation) {
    showToast("Location not supported by your browser.");
    return;
  }

  showToast("Detecting location…");

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
          { headers: { "Accept-Language": "en" } },
        );
        const data = await res.json();
        const city =
          data.address.city ||
          data.address.town ||
          data.address.village ||
          data.address.suburb ||
          data.address.county;
        const state = data.address.state;
        const location =
          city && state ? `${city}, ${state}` : city || state || "";
        const input = document.getElementById(targetInputId);
        if (input) input.value = location;
        if (
          targetInputId === "need-location" ||
          targetInputId === "offer-location"
        ) {
          pendingLatitude = latitude;
          pendingLongitude = longitude;
        }
        userLatitude = latitude;
        userLongitude = longitude;
      } catch (err) {
        showToast("Could not detect location.");
        console.error("Reverse geocode error:", err);
      }
    },
    () => {
      showToast("Location permission denied.");
    },
  );
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
}

let locationSearchTimeout = null;

async function searchLocations(query, targetInputId) {
  if (query.length < 3) {
    closeLocationDropdown();
    return;
  }

  clearTimeout(locationSearchTimeout);
  locationSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`,
        { headers: { "Accept-Language": "en" } },
      );
      const results = await res.json();
      showLocationDropdown(results, targetInputId);
    } catch (err) {
      console.error("Location search error:", err);
    }
  }, 400);
}

function showLocationDropdown(results, targetInputId) {
  closeLocationDropdown();
  if (!results.length) return;

  const input = document.getElementById(targetInputId);
  if (!input) return;

  const dropdown = document.createElement("div");
  dropdown.className = "location-dropdown";
  dropdown.id = "location-dropdown";

  results.forEach((r) => {
    const city =
      r.address.city ||
      r.address.town ||
      r.address.village ||
      r.address.suburb ||
      r.address.county;
    const state = r.address.state;
    const country = r.address.country;
    const label =
      city && state
        ? `${city}, ${state}`
        : city && country
          ? `${city}, ${country}`
          : r.display_name.split(",").slice(0, 2).join(",");

    const item = document.createElement("div");
    item.className = "location-dropdown-item";
    item.textContent = label;
    item.onclick = () => {
      input.value = label;
      if (
        targetInputId === "need-location" ||
        targetInputId === "offer-location"
      ) {
        pendingLatitude = parseFloat(r.lat);
        pendingLongitude = parseFloat(r.lon);
      }
      userLatitude = parseFloat(r.lat);
      userLongitude = parseFloat(r.lon);
      closeLocationDropdown();
    };
    dropdown.appendChild(item);
  });

  input.parentNode.style.position = "relative";
  input.parentNode.appendChild(dropdown);
}

function closeLocationDropdown() {
  const existing = document.getElementById("location-dropdown");
  if (existing) existing.remove();
}

document.addEventListener("click", (e) => {
  if (
    !e.target.closest(".location-dropdown") &&
    !e.target.closest(".form-field")
  ) {
    closeLocationDropdown();
  }
});

/* ── AUTH STATE ── */
let loggedIn = false;
let currentUser = null;
let pendingAction = null;
let currentOrgSlug = null;
let currentOrgFromPage = null;
let pendingLatitude = null;
let pendingLongitude = null;
let userLatitude = null;
let userLongitude = null;
let currentOrgData = null;

function requireAuth(action) {
  if (loggedIn) {
    action();
    return;
  }
  pendingAction = action;
  openModal("signin");
}

function updateNavAuth() {
  const wrap = document.getElementById("nav-profile-wrap");
  if (!wrap) return;
  if (loggedIn && currentUser) {
    const initial = currentUser.name.charAt(0).toUpperCase();
    wrap.innerHTML = `
      <button class="nav-profile-btn" id="nav-profile-btn" onclick="toggleProfileMenu(event)">
        <span class="nav-profile-avatar">${initial}</span>
        <span class="nav-profile-name">${currentUser.name}</span>
      </button>
      <div class="profile-dropdown" id="profile-dropdown">
        <div class="profile-dropdown-user">
          <div class="profile-dropdown-avatar">${initial}</div>
          <div>
            <div class="profile-dropdown-uname">${currentUser.name}</div>
            <div class="profile-dropdown-loc">${currentUser.location || "No location set"}</div>
          </div>
        </div>
        <div class="profile-dropdown-divider"></div>
        <button class="profile-dropdown-item" onclick="viewProfile('${currentUser.username}'); closeProfileMenu()">My Profile</button>
        <button class="profile-dropdown-item" onclick="showPage('inbox'); closeProfileMenu()">
          Inbox <span class="inbox-badge" id="inbox-badge" style="display:none"></span>
        </button>
        <button class="profile-dropdown-item" onclick="showPage('settings'); closeProfileMenu()">Settings</button>
        ${
          currentUser.is_admin
            ? `
  <div class="profile-dropdown-divider"></div>
  <button class="profile-dropdown-item" onclick="showPage('admin'); closeProfileMenu()">Admin Dashboard</button>
`
            : ""
        }
<div class="profile-dropdown-divider"></div>
<button class="profile-dropdown-item profile-dropdown-signout" onclick="signOut()">Sign Out</button>
      </div>
    `;
  } else {
    wrap.innerHTML = `<button class="nav-signin-btn" onclick="openModal('signin')">Sign In</button>`;
  }
}

async function signOut() {
  try {
    await fetch(`${API}/auth/signout`, {
      method: "POST",
      credentials: "include",
    });
  } catch (err) {
    console.error("Signout error:", err);
  }

  loggedIn = false;
  currentUser = null;
  closeProfileMenu();
  updateNavAuth();
  showPage("board");
  showToast("Signed out.");
}

/* ══════════════════════════════════════
   SETTINGS
══════════════════════════════════════ */
function loadSettings() {
  if (!currentUser) return;
  document.getElementById("settings-displayname").value =
    currentUser.name || "";
  document.getElementById("settings-location").value =
    currentUser.location || "";
  document.getElementById("settings-bio").value = currentUser.bio || "";

  // Avatar preview
  const preview = document.getElementById("settings-avatar-preview");
  const initials = document.getElementById("settings-avatar-initials");
  if (currentUser.avatar_url) {
    preview.src = currentUser.avatar_url.startsWith('http') 
  ? currentUser.avatar_url 
  : `https://dev.prema.red${currentUser.avatar_url}`;
    preview.style.display = "block";
    initials.style.display = "none";
  } else {
    initials.textContent = (currentUser.name || "?")[0].toUpperCase();
    initials.style.display = "flex";
    preview.style.display = "none";
  }

  document
    .getElementById("settings-avatar-input")
    .addEventListener("change", uploadAvatar);
}

async function saveSettings() {
  const display_name = document
    .getElementById("settings-displayname")
    .value.trim();
  const location = document.getElementById("settings-location").value.trim();
  const bio = document.getElementById("settings-bio").value.trim();

  if (!display_name) {
    showToast("Display name cannot be empty.");
    return;
  }

  try {
    const res = await fetch(`${API}/users/me`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ display_name, location, bio }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not save settings.");
      return;
    }

    // Update currentUser in memory
    currentUser.name = data.user.display_name || data.user.username;
    currentUser.location = data.user.location;
    currentUser.bio = data.user.bio;

    // Refresh nav so name change shows immediately
    updateNavAuth();
    showToast("✓ Settings saved.");
  } catch (err) {
    console.error("Save settings error:", err);
    showToast("Could not connect to server.");
  }
}

async function uploadAvatar() {
  const file = document.getElementById("settings-avatar-input").files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("avatar", file);

  try {
    const res = await fetch(`${API}/upload/user`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Upload failed."); return; }

    currentUser.avatar_url = data.avatar_url;
    const preview = document.getElementById("settings-avatar-preview");
    preview.src =  `https://dev.prema.red${data.avatar_url}`;
    preview.style.display = "block";
    document.getElementById("settings-avatar-initials").style.display = "none";
    updateNavAuth();
    showToast("✓ Photo updated.");
  } catch (err) {
    console.error("Avatar upload error:", err);
    showToast("Could not upload photo.");
  }
}

function buildSignInModal() {
  const hint = pendingAction ? '<p class="auth-gate-hint">Sign in to continue.</p>' : '';
  return `
    <div class="modal-title">Sign In</div>
    <p class="modal-sub">Welcome back. The community needs you.</p>${hint}
    <div class="form-field">
      <label class="form-label">Email</label>
      <input type="email" class="form-input" id="signin-email" placeholder="your@email.com">
    </div>
    <div class="form-field">
      <label class="form-label">Password</label>
      <input type="password" class="form-input" id="signin-password" placeholder="••••••••">
    </div>
    <button class="form-submit" onclick="submitSignIn()">Sign In →</button>
    <p class="auth-switch">Don't have an account? <span class="auth-link" onclick="openModal('signup')">Create one →</span></p>
    <p class="auth-switch">Didn't get a verification email? <span class="auth-link" onclick="resendVerification()">Resend it →</span></p>
  `;
}

async function submitSignIn() {
  const email = document.getElementById("signin-email")?.value.trim();
  const pass = document.getElementById("signin-password")?.value.trim();
  if (!email || !pass) {
    showToast("Please fill in both fields.");
    return;
  }

  try {
    const res = await fetch(`${API}/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password: pass }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not sign in.");
      return;
    }

    loggedIn = true;
    currentUser = {
      id: data.user.id,
      name: data.user.display_name || data.user.username,
      username: data.user.username,
      location: data.user.location,
      bio: data.user.bio,
      is_admin: data.user.is_admin,
    };

    closeModal();
    updateNavAuth();
    loadInbox();
    showToast("Welcome back, " + currentUser.name.split(" ")[0] + ".");
    if (pendingAction) {
      const fn = pendingAction;
      pendingAction = null;
      setTimeout(fn, 250);
    }
  } catch (err) {
    console.error("Signin error:", err);
    showToast("Could not connect to server.");
  }
}

async function resendVerification() {
  const email = document.getElementById('signin-email')?.value.trim();
  if (!email) {
    showToast('Enter your email above first.');
    return;
  }
  try {
    const res = await fetch(`${API}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    showToast(data.message || 'If that email needs verification, a new link has been sent.');
  } catch (err) {
    console.error('Resend verification error:', err);
    showToast('Could not connect to server.');
  }
}

/* ══════════════════════════════════════
   FORGOT / RESET PASSWORD
══════════════════════════════════════ */

function buildForgotPasswordModal() {
  return `
    <div class="modal-title">Reset Password</div>
    <p class="modal-sub">Enter your email and we'll send you a reset link.</p>
    <div class="form-field">
      <label class="form-label">Email</label>
      <input type="email" class="form-input" id="forgot-email" placeholder="your@email.com"
        onkeydown="if(event.key==='Enter') submitForgotPassword()">
    </div>
    <button class="form-submit" onclick="submitForgotPassword()">Send Reset Link →</button>
    <p class="auth-switch">
      <span class="auth-link" onclick="openModal('signin')">← Back to sign in</span>
    </p>
  `;
}

async function submitForgotPassword() {
  const email = document.getElementById("forgot-email")?.value.trim();
  if (!email) {
    showToast("Please enter your email.");
    return;
  }

  try {
    await fetch(`${API}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    closeModal();
    showToast("If that email exists, a reset link has been sent.");
  } catch (err) {
    console.error("Forgot password error:", err);
    showToast("Could not connect to server.");
  }
}

function buildResetPasswordModal(token) {
  return `
    <div class="modal-title">Choose a New Password</div>
    <p class="modal-sub">Pick something you'll remember.</p>
    <div class="form-field">
      <label class="form-label">New Password</label>
      <input type="password" class="form-input" id="reset-password" placeholder="••••••••"
        onkeydown="if(event.key==='Enter') submitResetPassword('${token}')">
    </div>
    <div class="form-field">
      <label class="form-label">Confirm New Password</label>
      <input type="password" class="form-input" id="reset-password-confirm" placeholder="••••••••"
        onkeydown="if(event.key==='Enter') submitResetPassword('${token}')">
    </div>
    <button class="form-submit" onclick="submitResetPassword('${token}')">Set New Password →</button>
  `;
}

async function submitResetPassword(token) {
  const password = document.getElementById("reset-password")?.value.trim();
  const confirm = document
    .getElementById("reset-password-confirm")
    ?.value.trim();
  if (!password || !confirm) {
    showToast("Please fill in both fields.");
    return;
  }
  if (password !== confirm) {
    showToast("Passwords do not match.");
    return;
  }

  try {
    const res = await fetch(`${API}/auth/reset-password/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not reset password.");
      return;
    }

    closeModal();
    showToast("Password updated. You can now sign in.");
    openModal("signin");
    window.history.replaceState({}, "", "/");
  } catch (err) {
    console.error("Reset password error:", err);
    showToast("Could not connect to server.");
  }
}

let signupData = {};

function buildSignUpModal(step) {
  step = step || 1;
  signupData._step = step;
  if (step === 1)
    return `
    <div class="modal-step-indicator">Step 1 of 4</div>
    <div class="modal-title">Create an Account</div>
    <p class="modal-sub">Free, always. No catch.</p>
    <div class="form-field">
      <label class="form-label">Username</label>
      <input type="text" class="form-input" id="su-username" placeholder="how others will find you"
        onkeydown="if(event.key==='Enter') signupNext(1)">
    </div>
    <div class="form-field">
      <label class="form-label">Email</label>
      <input type="email" class="form-input" id="su-email" placeholder="your@email.com"
        onkeydown="if(event.key==='Enter') signupNext(1)">
    </div>
    <div class="form-field">
      <label class="form-label">Password</label>
      <input type="password" class="form-input" id="su-password" placeholder="••••••••"
        onkeydown="if(event.key==='Enter') signupNext(1)">
    </div>
    <div class="form-field">
      <label class="form-label">Confirm Password</label>
      <input type="password" class="form-input" id="su-password-confirm" placeholder="••••••••"
        onkeydown="if(event.key==='Enter') signupNext(1)">
    </div>
    <button class="form-submit" onclick="signupNext(1)">Continue →</button>
    <p class="auth-switch">Already have an account? <span class="auth-link" onclick="openModal('signin')">Sign in →</span></p>
  `;
  if (step === 2)
    return `
    <div class="modal-step-indicator">Step 2 of 4</div>
    <div class="modal-title">Tell us about yourself</div>
    <p class="modal-sub">This is what others see on your profile.</p>
    <div class="form-field">
      <label class="form-label">Display Name</label>
      <input type="text" class="form-input" id="su-displayname" placeholder="Can match your username" value="${signupData.username || ""}">
    </div>
    <div class="form-field">
  <label class="form-label">General Location <span style="opacity:0.5;font-weight:400;text-transform:none;letter-spacing:0">(neighborhood or city — never exact address)</span></label>
  <input type="text" class="form-input" id="su-location" placeholder="e.g. Northside, DC" oninput="searchLocations(this.value, 'su-location')">
  <button type="button" class="location-detect-btn" onclick="detectLocation('su-location')">⊕ Use my location</button>
</div>
    <div class="form-field">
      <label class="form-label">Short Bio <span style="opacity:0.5;font-weight:400;text-transform:none;letter-spacing:0">(optional but encouraged)</span></label>
      <textarea class="form-textarea" id="su-bio" placeholder="What do you bring to the community? What do you care about?" rows="3"></textarea>
    </div>
    <button class="form-submit" onclick="signupNext(2)">Continue →</button>
  `;
  if (step === 3)
    return `
    <div class="modal-step-indicator">Step 3 of 4</div>
    <div class="modal-title">What brings you here?</div>
    <p class="modal-sub">This helps us show you the right things first.</p>
    <div class="signup-options">
      <label class="signup-option">
        <input type="radio" name="su-intent" value="offer">
        <span class="signup-option-label">I have abilities to offer</span>
      </label>
      <label class="signup-option">
        <input type="radio" name="su-intent" value="need">
        <span class="signup-option-label">I have needs I'm looking for help with</span>
      </label>
      <label class="signup-option">
        <input type="radio" name="su-intent" value="both">
        <span class="signup-option-label">Both</span>
      </label>
      <label class="signup-option">
        <input type="radio" name="su-intent" value="orgs">
        <span class="signup-option-label">I'm looking for local groups and orgs</span>
      </label>
    </div>
    <button class="form-submit" onclick="signupNext(3)">Continue →</button>
  `;
  if (step === 4)
    return `
    <div class="signup-welcome">
      <div class="signup-welcome-star">★</div>
      <div class="modal-title" style="margin-bottom:0.5rem">Welcome to Prema</div>
      <p class="modal-sub" style="margin-bottom:1.5rem">You're in. The community is better for it.</p>
      <div class="signup-welcome-name">${signupData.displayname || signupData.username}</div>
      <p class="signup-welcome-loc">📍 ${signupData.location || "Location not set"}</p>
      ${signupData.bio ? `<p class="signup-welcome-bio">${signupData.bio}</p>` : ""}
    </div>
    <button class="form-submit" onclick="signupFinish()">Go to the Board →</button>
  `;
}

function signupNext(step) {
  if (step === 1) {
    const username = document.getElementById("su-username")?.value.trim();
    const email = document.getElementById("su-email")?.value.trim();
    const password = document.getElementById("su-password")?.value.trim();
    const confirm = document
      .getElementById("su-password-confirm")
      ?.value.trim();
    if (!username || !email || !password || !confirm) {
      showToast("Please fill in all fields.");
      return;
    }
    if (password !== confirm) {
      showToast("Passwords do not match.");
      return;
    }
    signupData.username = username;
    signupData.email = email;
    signupData.password = password;
  }
  if (step === 2) {
    signupData.displayname =
      document.getElementById("su-displayname")?.value.trim() ||
      signupData.username;
    signupData.location = document.getElementById("su-location")?.value.trim();
    signupData.bio = document.getElementById("su-bio")?.value.trim();
  }
  if (step === 3) {
    const intent = document.querySelector('input[name="su-intent"]:checked');
    if (!intent) {
      showToast("Choose what brings you here.");
      return;
    }
    signupData.intent = intent.value;
  }
  if (step === 4) {
    submitSignUp();
    return;
  }
  document.getElementById("modal-body").innerHTML = buildSignUpModal(step + 1);
}

async function submitSignUp() {
  try {
    const res = await fetch(`${API}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        username: signupData.username,
        email: signupData.email,
        password: signupData.password,
        display_name: signupData.displayname,
        location: signupData.location,
        bio: signupData.bio,
        intent: signupData.intent,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not create account.");
      return;
    }

    closeModal();
    showToast("Account created! Check your email to verify your account.");
  } catch (err) {
    console.error("Signup error:", err);
    showToast("Could not connect to server.");
  }
}

async function signupFinish() {
  try {
    const res = await fetch(`${API}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        username: signupData.username,
        email: signupData.email,
        password: signupData.password,
        display_name: signupData.displayname,
        location: signupData.location,
        bio: signupData.bio,
        intent: signupData.intent,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not create account.");
      return;
    }

    closeModal();
    showToast("Account created! Check your email to verify before signing in.");
  } catch (err) {
    console.error("Signup error:", err);
    showToast("Could not connect to server.");
  }
}

/* ── MODAL ── */
function openModal(type) {
  if ((type === "post-need" || type === "post-offer") && !loggedIn) {
    requireAuth(() => openModal(type));
    return;
  }
  document.getElementById("modal-body").innerHTML = buildModal(type);
  document.getElementById("overlay").classList.add("open");
}
function closeModal() {
  document.getElementById("overlay").classList.remove("open");
}
function handleOverlay(e) {
  if (e.target === document.getElementById("overlay")) closeModal();
}

function buildModal(type) {
  if (type === "signin") return buildSignInModal();
  if (type === "signup") return buildSignUpModal(1);
  if (type === "forgot-password") return buildForgotPasswordModal();
  if (type === "post-need") {
    return `
      <div class="modal-title">Post a Need</div>
      <p class="modal-sub">Tell the community what you need. No judgment. No means test. You need it — that's enough.</p>
      <div class="form-field">
        <label class="form-label">What do you need?</label>
        <input type="text" id="need-title" class="form-input" placeholder="e.g. Grocery run, Legal advice, Someone to talk to">
      </div>
      <div class="form-field">
        <label class="form-label">Tell us more</label>
        <textarea id="need-body" class="form-textarea" placeholder="Describe what you need and when. As much or as little as you want."></textarea>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Category</label>
          <select id="need-cat" class="form-select">${catOptionsHTML(currentTab)}</select>
        </div>
        <div class="form-field">
          <label class="form-label">Your neighborhood or city</label>
          <input type="text" id="need-location" class="form-input" placeholder="${currentTab === "local" ? "e.g. Northside, DC" : "Remote"}" oninput="searchLocations(this.value, 'need-location')">
          <button type="button" class="location-detect-btn" onclick="detectLocation('need-location')">⊕ Use my location</button>
        </div>
      </div>
      <button class="form-submit" onclick="submitPost('need')">Post this Need →</button>
    `;
  }
  if (type === "post-offer") {
    return `
      <div class="modal-title">Post an Ability</div>
      <p class="modal-sub">What can you give? Your time, your skill, your care — offered directly to someone who needs it.</p>
      <div class="form-field">
        <label class="form-label">What can you offer?</label>
        <input type="text" id="offer-title" class="form-input" placeholder="e.g. Rides, Cooking, Web design, Tutoring, A listening ear">
      </div>
      <div class="form-field">
        <label class="form-label">Tell us more</label>
        <textarea id="offer-body" class="form-textarea" placeholder="Describe what you can do and how you can help. Be specific — it helps people know if you're the right fit."></textarea>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Category</label>
          <select id="offer-cat" class="form-select">${catOptionsHTML(currentTab)}</select>
        </div>
        <div class="form-field">
          <label class="form-label">Your neighborhood or city</label>
          <input type="text" id="offer-location" class="form-input" placeholder="${currentTab === "local" ? "e.g. East End, Richmond" : "Remote"}" oninput="searchLocations(this.value, 'offer-location')">
          <button type="button" class="location-detect-btn" onclick="detectLocation('offer-location')">⊕ Use my location</button>
        </div>
      </div>
      <button class="form-submit" onclick="submitPost('offer')">Post this Ability →</button>
    `;
  }
  if (type === 'post-org') {
    if (!currentOrgData) return '';
    const { org, events } = currentOrgData;
    const eventOptions = events.map(e =>
      `<option value="${e.id}">${e.title}</option>`
    ).join('');

    return `
      <div class="modal-title">Post to ${org.name}</div>
      <p class="modal-sub">Create a need or an ability for your org.</p>

      <div class="form-field">
        <label class="form-label">Type</label>
        <div class="form-radio-row">
          <label class="form-radio">
            <input type="radio" name="org-post-type" value="need" checked>
            <span>I need something</span>
          </label>
          <label class="form-radio">
            <input type="radio" name="org-post-type" value="ability">
            <span>I can offer something</span>
          </label>
        </div>
      </div>

      <div class="form-field">
        <label class="form-label">Attach to</label>
        <select id="org-post-event" class="form-select">
          <option value="">General — not tied to an event</option>
          ${eventOptions}
        </select>
      </div>

      <div class="form-field">
        <label class="form-label">Title</label>
        <input type="text" id="org-post-title" class="form-input" placeholder="What's the request?">
      </div>

      <div class="form-field">
        <label class="form-label">Details</label>
        <textarea id="org-post-body" class="form-textarea" placeholder="Give some context. The more specific, the better."></textarea>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Category</label>
          <select id="org-post-cat" class="form-select">${catOptionsHTML(org.scope)}</select>
        </div>
        <div class="form-field">
          <label class="form-label">Visibility</label>
          <select id="org-post-privacy" class="form-select">
            <option value="true" selected>Members only</option>
            <option value="false">Public — anyone can help</option>
          </select>
        </div>
      </div>

      <button class="form-submit" onclick="submitOrgPost()">Post →</button>
    `;
  }
  if (type === "add-org") {
    return `
      <div class="modal-title">Add an Organization</div>
      <p class="modal-sub">Add your mutual aid group, union, community org, or collective to the directory. Free, always.</p>
      <div class="form-field">
        <label class="form-label">Organization name</label>
        <input type="text" id="org-name" class="form-input" placeholder="Name of your group">
      </div>
      <div class="form-field">
        <label class="form-label">What do you do?</label>
        <textarea id="org-desc" class="form-textarea" placeholder="Describe your organization and who you serve."></textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Your values <span style="opacity:0.5;font-weight:400;text-transform:none;letter-spacing:0">(what do you stand for?)</span></label>
        <textarea id="org-values" class="form-textarea" placeholder="Tell us about your values and principles." rows="3"></textarea>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Scope</label>
          <select id="org-scope" class="form-select">
            <option value="local">Local (in-person)</option>
            <option value="global">Global (online)</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Location</label>
          <input type="text" id="org-location" class="form-input" placeholder="City or 'Remote'">
        </div>
      </div>
     <div class="form-field">
        <label class="form-label">Contact email</label>
        <input type="email" id="org-email" class="form-input" placeholder="contact@yourorg.org">
      </div>

      <div class="contribution-section">
        <div class="contribution-title">Contribute to Prema</div>
        <p class="contribution-blurb">
          Prema is free. Your contribution covers the server, email, and the time it takes to build this.
          <strong>Pay what you can — $0 is always okay.</strong>
        </p>
        <div class="form-field contribution-amount-field">
          <label class="form-label">Contribution (USD)</label>
          <div class="contribution-input-wrap">
            <span class="contribution-dollar">$</span>
            <input type="number" id="org-contribution" class="form-input contribution-input" value="10" min="0" step="1">
          </div>
        </div>
      </div>

      <button class="form-submit" onclick="submitOrg()">Submit Organization →</button>
    `;
  }
  return "";
}

function catOptionsHTML(tab) {
  const cats =
    tab === "global"
      ? [
          "All",
          "Tech / Code",
          "Legal",
          "Art / Design",
          "Writing",
          "Education",
          "Advice",
          "Other",
        ]
      : [
          "All",
          "Food",
          "Cleaning",
          "Transport",
          "Housing",
          "Healthcare",
          "Infrastructure",
          "Other",
        ];
  return cats.map((c) => `<option>${c}</option>`).join("");
}

async function submitPost(kind) {
  if (!loggedIn) {
    closeModal();
    setTimeout(
      () =>
        requireAuth(() =>
          openModal(kind === "need" ? "post-need" : "post-offer"),
        ),
      100,
    );
    return;
  }

  const isNeed = kind === "need";
  const title = document
    .getElementById(isNeed ? "need-title" : "offer-title")
    ?.value.trim();
  const body = document
    .getElementById(isNeed ? "need-body" : "offer-body")
    ?.value.trim();
  const category = document.getElementById(
    isNeed ? "need-cat" : "offer-cat",
  )?.value;
  const scope = currentTab === "local" ? "local" : "global";
  const location = document
    .getElementById(isNeed ? "need-location" : "offer-location")
    ?.value.trim();

  if (!title || !body || !category || !scope) {
    showToast("Please fill in all required fields.");
    return;
  }

  try {
    const res = await fetch(`${API}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: isNeed ? "need" : "ability",
        scope,
        category,
        title,
        body,
        location,
        latitude: pendingLatitude,
        longitude: pendingLongitude,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not create post.");
      return;
    }

    closeModal();
    pendingLatitude = null;
    pendingLongitude = null;
    showToast(
      isNeed
        ? "★ Your need has been posted."
        : "★ Your ability has been posted.",
    );
    fetchAndRenderCards();
  } catch (err) {
    console.error("Submit post error:", err);
    showToast("Could not connect to server.");
  }
}

async function submitOrgPost() {
  if (!currentOrgData) return;
  const { org } = currentOrgData;

  const type = document.querySelector('input[name="org-post-type"]:checked')?.value;
  const eventId = document.getElementById('org-post-event')?.value;
  const title = document.getElementById('org-post-title')?.value.trim();
  const body = document.getElementById('org-post-body')?.value.trim();
  const category = document.getElementById('org-post-cat')?.value;
  const membersOnly = document.getElementById('org-post-privacy')?.value === 'true';

  if (!title || !body || !category) {
    showToast('Please fill in all required fields.');
    return;
  }

  try {
    const res = await fetch(`${API}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        type,
        scope: org.scope,
        category,
        title,
        body,
        org_id: org.id,
        event_id: eventId || null,
        members_only: membersOnly
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not post.');
      return;
    }

    closeModal();
    showToast(`★ Posted to ${org.name}.`);
    openOrgDetail(currentOrgSlug, currentOrgFromPage);
  } catch (err) {
    console.error('Submit org post error:', err);
    showToast('Could not connect to server.');
  }
}

async function submitOrg() {
  const name = document.getElementById("org-name")?.value.trim();
  const description = document.getElementById("org-desc")?.value.trim();
  const scope = document.getElementById("org-scope")?.value;
  const location = document.getElementById("org-location")?.value.trim();
  const email = document.getElementById("org-email")?.value.trim();
  const values = document.getElementById("org-values")?.value.trim();

  // Read contribution amount (integer dollars, min 0)
  const contributionRaw = document.getElementById("org-contribution")?.value;
  let contributionDollars = parseInt(contributionRaw, 10);
  if (isNaN(contributionDollars) || contributionDollars < 0) contributionDollars = 0;

  if (!name || !description || !scope) {
    showToast("Please fill in all required fields.");
    return;
  }

  try {
    const res = await fetch(`${API}/orgs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name,
        description,
        scope,
        location,
        contact_email: email,
        values_statement: values,
        contribution_dollars: contributionDollars,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not create organization.");
      return;
    }

    // $0 contribution → org is already active, done
    if (data.status === "active") {
      closeModal();
      showToast("★ Organization created.");
      fetchAndRenderOrgs();
      return;
    }

    // Paid contribution → create Stripe Checkout session and redirect
    try {
      const checkoutRes = await fetch(`${API}/orgs/${data.orgId}/checkout`, {
        method: "POST",
        credentials: "include",
      });

      const checkoutData = await checkoutRes.json();

      if (!checkoutRes.ok || !checkoutData.url) {
        showToast(checkoutData.error || "Could not start checkout. Your org was saved; try again from the org page.");
        return;
      }

      // Redirect the whole window to Stripe's hosted checkout
      window.location.href = checkoutData.url;

    } catch (err) {
      console.error("Checkout error:", err);
      showToast("Could not connect to Stripe. Try again shortly.");
    }

  } catch (err) {
    console.error("Submit org error:", err);
    showToast("Could not connect to server.");
  }
}

/* ══════════════════════════════════════
   FILTERS
══════════════════════════════════════ */

const filterSets = {
  local: [
    "all",
    "food",
    "cleaning",
    "transport",
    "housing",
    "healthcare",
    "infrastructure",
    "other",
  ],
  global: [
    "all",
    "tech",
    "legal",
    "art",
    "writing",
    "advice",
    "education",
    "comrade-support",
    "other",
  ],
};
const filterLabels = {
  all: "All",
  food: "Food",
  cleaning: "Cleaning",
  transport: "Transport",
  housing: "Housing",
  healthcare: "Healthcare",
  infrastructure: "Infrastructure",
  tech: "Tech/Code",
  legal: "Legal",
  art: "Art/Design",
  writing: "Writing",
  advice: "Advice",
  education: "Education",
  "comrade-support": "Comrade Support",
  other: "Other",
};

/* ══════════════════════════════════════
   BOARD
══════════════════════════════════════ */
let currentTab = "local";
let currentFilter = "all";
let boardReady = false;
let boardData = { local: [], global: [] };

/* ── RSVP STATE ── */
const rsvpSet = new Set(); // event ids the current user has RSVP'd to

/* ── REPORT SYSTEM ── */
function openReport(contentType, contentId, contentLabel) {
  requireAuth(() => {
    const body = `
      <div class="modal-title">Report</div>
      <p class="modal-sub">You're reporting: <strong>${contentLabel}</strong></p>
      <p class="report-policy">Reports are reviewed by Cariño moderators. At 5 reports, content is automatically taken down and pushed to the review queue. You will not be identified to the person being reported.</p>
      <div class="form-field">
        <label class="form-label">Reason</label>
        <div class="report-reasons">
          <label class="report-reason"><input type="radio" name="report-reason" value="spam"> <span>Spam or misleading</span></label>
          <label class="report-reason"><input type="radio" name="report-reason" value="harassment"> <span>Harassment or abuse</span></label>
          <label class="report-reason"><input type="radio" name="report-reason" value="hate"> <span>Hate speech or discrimination</span></label>
          <label class="report-reason"><input type="radio" name="report-reason" value="predatory"> <span>Predatory or dangerous behavior</span></label>
          <label class="report-reason"><input type="radio" name="report-reason" value="other"> <span>Other</span></label>
        </div>
      </div>
      <div class="form-field" id="report-other-wrap" style="display:none">
        <label class="form-label">Tell us more</label>
        <textarea class="form-textarea" id="report-other-text" placeholder="Describe what's wrong." rows="3"></textarea>
      </div>
      <button class="form-submit" onclick="submitReport('${contentType}', ${contentId})">Submit Report →</button>
    `;
    document.getElementById("modal-body").innerHTML = body;
    document.getElementById("overlay").classList.add("open");
    document.querySelectorAll('input[name="report-reason"]').forEach((r) => {
      r.addEventListener("change", () => {
        document.getElementById("report-other-wrap").style.display =
          r.value === "other" && r.checked ? "block" : "none";
      });
    });
  });
}

async function submitReport(contentType, contentId) {
  const reason = document.querySelector('input[name="report-reason"]:checked');
  if (!reason) {
    showToast("Please select a reason.");
    return;
  }

  const otherText = document.getElementById("report-other-text")?.value.trim();

  try {
    let url;
    if (contentType === "post") url = `${API}/posts/${contentId}/report`;
    if (contentType === "profile") url = `${API}/users/${contentId}/report`;
    if (contentType === "org") url = `${API}/orgs/${contentId}/report`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason: reason.value, other_text: otherText }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not submit report.");
      return;
    }

    closeModal();
    showToast("Report submitted. Moderators will review it.");
  } catch (err) {
    console.error("Report error:", err);
    showToast("Could not connect to server.");
  }
}

function initBoard() {
  if (boardReady) return;
  boardReady = true;
  renderFilters();
  fetchAndRenderCards();
}

function switchTab(tab) {
  currentTab = tab;
  currentFilter = "all";

  document
    .querySelectorAll(".board-tab[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

  document.getElementById("panel-title").innerHTML =
    tab === "local"
      ? "Local <em>Abilities &amp; Needs</em>"
      : "Global <em>Abilities &amp; Needs</em>";
  document.getElementById("panel-sub").textContent =
    tab === "local"
      ? "In-person help in your community."
      : "Remote help — skills, code, advice, writing, anything you can give from anywhere.";
  document.getElementById("sidebar-label").textContent =
    tab === "local" ? "Local Groups" : "Global Groups";

  renderFilters();
  fetchAndRenderCards();
}

function renderFilters() {
  const chips = filterSets[currentTab]
    .map(
      (f) => `
    <button class="filter-chip${f === currentFilter ? " active" : ""}"
            onclick="setFilter('${f}')">${filterLabels[f]}</button>
  `,
    )
    .join("");
  document.getElementById("board-filters").innerHTML = chips;
}

function setFilter(f) {
  currentFilter = f;
  renderFilters();
  fetchAndRenderCards();
}

async function fetchAndRenderCards() {
  const search = (document.getElementById("board-search")?.value || "").trim();
  const sort = document.getElementById("board-sort")?.value || "all";

  const params = new URLSearchParams();
  params.append("scope", currentTab === "local" ? "local" : "global");
  if (currentFilter !== "all") params.append("category", currentFilter);
  if (sort === "offers") params.append("type", "ability");
  if (sort === "needs") params.append("type", "need");
  if (search) params.append("q", search);

  try {
    const res = await fetch(`${API}/posts?${params}`);
    const data = await res.json();

    const posts = data.posts.map((p) => ({
      id: p.id,
      user_id: p.user_id,
      username: p.username,
      type: p.type === "ability" ? "offer" : "need",
      cat: p.category,
      title: p.title,
      body: p.body,
      name: p.display_name || p.username,
      loc: p.user_location || p.location || "Unknown",
      time: new Date(p.created_at).toLocaleDateString(),
      latitude: p.latitude,
      longitude: p.longitude,
    }));

    boardData[currentTab] = posts;
    renderCards();
  } catch (err) {
    console.error("Failed to fetch posts:", err);
    document.getElementById("cards-grid").innerHTML =
      '<div class="no-results">Could not load posts. Is the server running?</div>';
  }
}

function renderCards() {
  const search = (document.getElementById("board-search")?.value || "")
    .toLowerCase()
    .trim();
  const sort = document.getElementById("board-sort")?.value || "all";
  let posts = [...boardData[currentTab]];

  if (currentFilter !== "all")
    posts = posts.filter((p) => p.cat === currentFilter);
  if (sort === "offers") posts = posts.filter((p) => p.type === "offer");
  if (sort === "needs") posts = posts.filter((p) => p.type === "need");
  if (search)
    posts = posts.filter(
      (p) =>
        p.title.toLowerCase().includes(search) ||
        p.body.toLowerCase().includes(search) ||
        p.name.toLowerCase().includes(search),
    );

  if (!posts.length) {
    document.getElementById("cards-grid").innerHTML =
      '<div class="no-results">Nothing here yet. Be the first to post.</div>';
    return;
  }

  document.getElementById("cards-grid").innerHTML = posts
    .map(
      (p) => `
    <div class="card">
      <div class="card-top">
        <span class="badge badge-${p.type}">${p.type === "offer" ? "Offering" : "Needs Help"}</span>
        <span class="card-time">${p.time}</span>
      </div>
      <div class="card-title">${p.title}</div>
      <div class="card-body">${p.body}</div>
      <div class="card-footer">
        <div class="card-meta">
  <span class="card-name" onclick="openProfileModal('${p.username}')">${p.name}</span>
  ${
    userLatitude && userLongitude && p.latitude && p.longitude
      ? `<span class="card-distance">${calculateDistance(userLatitude, userLongitude, p.latitude, p.longitude)} mi away</span>`
      : p.loc
        ? `<span class="card-distance">${p.loc}</span>`
        : ""
  }
</div>
        <div class="card-actions">
          <button class="card-report-btn" onclick="openReport('post', ${p.id}, '${p.title}')" title="Report this post">⚑</button>
          ${currentUser && currentUser.id === p.user_id ? `<button class="card-delete-btn" onclick="deletePost(${p.id}, this)">Delete</button>` : ""}
          <button class="card-cta" onclick="respondToPost(${p.user_id}, '${p.name}', '${p.title}')">Respond</button>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

async function deletePost(postId, btn) {
  if (!confirm("Delete this post?")) return;
  try {
    const res = await fetch(`${API}/posts/${postId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      showToast("Post deleted.");
      fetchAndRenderCards();
    } else {
      const data = await res.json();
      showToast(data.error || "Could not delete post.");
    }
  } catch (err) {
    console.error("Delete post error:", err);
    showToast("Could not connect to server.");
  }
}

/* ══════════════════════════════════════
   ORGANIZATIONS
══════════════════════════════════════ */
let orgsTab = "local";
let orgsReady = false;

function initOrgs() {
  if (orgsReady) return;
  orgsReady = true;
  fetchAndRenderOrgs();
}

function switchOrgsTab(tab) {
  orgsTab = tab;
  document
    .querySelectorAll(".board-tab[data-orgtab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.orgtab === tab));
  fetchAndRenderOrgs();
}

async function fetchAndRenderOrgs() {
  const search = (document.getElementById("orgs-search")?.value || "").trim();

  const params = new URLSearchParams();
  params.append("scope", orgsTab);
  if (search) params.append("q", search);

  try {
    const res = await fetch(`${API}/orgs?${params}`, {
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Could not load orgs:", data.error);
      return;
    }

    renderOrgs(data.orgs);
  } catch (err) {
    console.error("Fetch orgs error:", err);
    document.getElementById("orgs-grid").innerHTML =
      '<div class="no-results" style="grid-column:1/-1">Could not load organizations.</div>';
  }
}

function renderOrgs(orgs) {
  if (!orgs || !orgs.length) {
    document.getElementById("orgs-grid").innerHTML =
      '<div class="no-results" style="grid-column:1/-1">No organizations found.</div>';
    return;
  }

  document.getElementById("orgs-grid").innerHTML = orgs
    .map(
      (o) => `
    <div class="org-card" onclick="openOrgDetail('${o.slug}', 'orgs')">
      <div class="org-emoji">🤝</div>
      <div class="org-name">${o.name}</div>
      <div class="org-desc">${o.description}</div>
      <div class="org-footer">
        <div class="org-meta">${o.member_count} members · ${o.location || "Remote"}</div>
        <span class="org-tag">${o.scope === "local" ? "📍 Local" : "🌐 Global"}</span>
      </div>
    </div>
  `,
    )
    .join("");
}

/* ══════════════════════════════════════
   ORG DETAIL
══════════════════════════════════════ */
function switchOdTab(name, btn) {
  document
    .querySelectorAll(".od-tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".od-tab-panel")
    .forEach((p) => p.classList.add("od-tab-panel-hidden"));
  btn.classList.add("active");
  document
    .getElementById("od-panel-" + name)
    ?.classList.remove("od-tab-panel-hidden");
}

async function openOrgDetail(slug, fromPage) {
  console.log('[openOrgDetail] CALLED', new Date().toISOString(), { slug, fromPage }, new Error().stack);
  currentOrgSlug = slug;
  currentOrgFromPage = fromPage;

  // Read & strip ?contribution=success|canceled from URL before pushState
  const urlObj = new URL(window.location.href);
  const contributionParam = urlObj.searchParams.get('contribution');
  // Always push a clean URL so the param doesn't persist on back/forward navigation
  window.history.pushState({ page: "org-detail", slug }, "", `/orgs/${slug}`);

  try {
    const res = await fetch(`${API}/orgs/${slug}`, {
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      showToast("Could not load organization.");
      return;
    }

    const { org, announcements, events } = data;

     // Auto-activate if pending_payment and the viewer is the owner
    // (covers: Stripe redirect back with cancel, stale pending from abandoned tab, etc.)
    if (org.status === 'pending_payment' && loggedIn && currentUser?.id === org.created_by) {
      try {
        const actRes = await fetch(`${API}/orgs/${org.id}/activate-without-payment`, {
          method: 'POST',
          credentials: 'include'
        });
        const actData = await actRes.json();
        if (actData.activated) {
          org.status = 'active';
        }
      } catch (err) {
        console.error('Auto-activate error:', err);
      }
    }

    // Fetch org-scoped posts (needs & abilities)
    let orgPosts = [];
    try {
      const postsRes = await fetch(`${API}/posts?org_id=${org.id}`, {
        credentials: 'include'
      });
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        orgPosts = postsData.posts || [];
      }
    } catch (err) {
      console.error('Load org posts error:', err);
    }

    // Check membership status + role if logged in
    let memberStatus = "none";
    let isOrgAdmin = false;
    if (loggedIn) {
      const memRes = await fetch(`${API}/orgs/${org.id}/membership`, {
        credentials: "include",
      });
      const memData = await memRes.json();
      memberStatus = memData.status || "none";
      isOrgAdmin = memData.role === "admin" && memData.status === "active";
      currentOrgData = { org, events, memberStatus, isOrgAdmin };
    }

    const annCount = announcements.length;
    const evCount = events.length;

    // Render org posts, grouped by General + per event
    const renderPostCard = (p) => {
      const typeBadge = p.type === 'need'
        ? '<span class="od-post-badge od-post-badge-need">NEED</span>'
        : '<span class="od-post-badge od-post-badge-ability">ABILITY</span>';

      let status = '';
      if (p.fulfilled_at) {
        status = '<div class="od-post-status od-post-status-fulfilled">✓ Fulfilled</div>';
      } else if (p.claimed_by) {
        const claimerName = p.claimed_by === currentUser?.id
          ? 'you'
          : (p.claimer_name || p.claimer_username || 'someone');
        status = `<div class="od-post-status od-post-status-claimed">✓ Claimed by ${claimerName}</div>`;
      }

      let actionBtn = '';
      if (!p.fulfilled_at) {
        if (p.type === 'need' && !p.claimed_by && p.user_id !== currentUser?.id) {
          actionBtn = `<button class="od-post-btn" onclick="claimPost(${p.id})">I got this</button>`;
        } else if (p.claimed_by === currentUser?.id) {
          actionBtn = `<button class="od-post-btn od-post-btn-secondary" onclick="unclaimPost(${p.id})">Unclaim</button>`;
        }
        // Fulfill button for post owner or org admin
        if ((p.user_id === currentUser?.id || isOrgAdmin) && p.claimed_by) {
          actionBtn += `<button class="od-post-btn" onclick="fulfillPost(${p.id})">Mark fulfilled</button>`;
        }
      }

      const privacyHint = p.members_only
        ? '<span class="od-post-privacy">🔒 Members only</span>'
        : '<span class="od-post-privacy">🌐 Public</span>';

      return `
        <div class="od-post">
          <div class="od-post-top">
            ${typeBadge}
            ${privacyHint}
          </div>
          <div class="od-post-title">${p.title}</div>
          <div class="od-post-body">${p.body}</div>
          <div class="od-post-footer">
            <span class="od-post-author">Posted by ${p.display_name || p.username}</span>
            <div class="od-post-actions">${actionBtn}</div>
          </div>
          ${status}
        </div>
      `;
    };

    // Group posts: general (no event) + by event
    const generalPosts = orgPosts.filter(p => !p.event_id);
    const postsByEvent = {};
    orgPosts.filter(p => p.event_id).forEach(p => {
      if (!postsByEvent[p.event_id]) postsByEvent[p.event_id] = [];
      postsByEvent[p.event_id].push(p);
    });

    const generalSection = `
      <div class="od-post-section">
        <div class="od-post-section-hd">General</div>
        ${generalPosts.length > 0
          ? generalPosts.map(renderPostCard).join('')
          : '<p class="od-empty">No general needs or abilities yet.</p>'}
      </div>
    `;

    const eventSections = events.map(ev => {
      const eventPosts = postsByEvent[ev.id] || [];
      if (eventPosts.length === 0) return '';
      return `
        <div class="od-post-section">
          <div class="od-post-section-hd">
            ${ev.title}
            ${ev.event_date ? `<span class="od-post-section-date">${ev.event_date}</span>` : ''}
          </div>
          ${eventPosts.map(renderPostCard).join('')}
        </div>
      `;
    }).join('');

    const postBtn = memberStatus === 'active' ? `
      <button class="od-post-create-btn" onclick="openModal('post-org')">
        + Post to ${org.name}
      </button>
    ` : '';

    const postsHTML = postBtn + generalSection + eventSections;
    const openNeedsTotal = org.open_needs_count || 0;

    const annHTML =
      annCount > 0
        ? announcements
            .map(
              (a) => `
      <div class="od-announcement">
        <div class="od-ann-header">
          <div class="od-ann-title">${a.title}</div>
          <div class="od-ann-date">${new Date(a.created_at).toLocaleDateString()}</div>
        </div>
        <p class="od-ann-body">${a.body}</p>
      </div>
    `,
            )
            .join("")
        : '<p class="od-empty">No announcements yet.</p>';

    const evHTML =
      evCount > 0
        ? events
            .map(
              (e) => `
      <div class="od-event">
        <div class="od-event-top">
          <span class="od-event-badge">${e.type || "Event"}</span>
        </div>
        <div class="od-event-title">${e.title}</div>
        <div class="od-event-date">${e.event_date ? new Date(e.event_date).toLocaleDateString() : "Date TBD"}</div>
        <div class="od-event-desc">${e.description || ""}</div>
        <div class="od-event-footer">
          <span class="ev-spots-open">${e.rsvp_count} going</span>
          <button class="rsvp-btn" onclick="rsvpEvent(${org.id}, ${e.id}, this)">RSVP</button>
        </div>
      </div>
    `,
            )
            .join("")
        : '<p class="od-empty">No events yet.</p>';

    const joinLabel =
      memberStatus === "active"
        ? "✓ Member"
        : memberStatus === "pending"
          ? "⧖ Request Pending"
          : "Request to Join";
    const joinClass =
      memberStatus === "active"
        ? " od-aside-join-joined"
        : memberStatus === "pending"
          ? " od-aside-join-pending"
          : "";

    const annAdminHTML = isOrgAdmin
      ? `
      <div class="od-admin-form" id="od-ann-form" style="display:none">
        <input class="od-admin-input" id="od-ann-title" placeholder="Announcement title" />
        <textarea class="od-admin-textarea" id="od-ann-body" placeholder="What do you want to tell your members?" rows="3"></textarea>
        <div class="od-admin-form-actions">
          <button class="od-admin-btn" onclick="postAnnouncement(${org.id})">Post</button>
          <button class="od-admin-btn-cancel" onclick="toggleOdForm('od-ann-form', 'od-ann-toggle')">Cancel</button>
        </div>
      </div>
      <button class="od-admin-toggle" id="od-ann-toggle" onclick="toggleOdForm('od-ann-form', 'od-ann-toggle')">+ Post Announcement</button>
    `
      : "";

    const evAdminHTML = isOrgAdmin
      ? `
      <div class="od-admin-form" id="od-ev-form" style="display:none">
        <input class="od-admin-input" id="od-ev-title" placeholder="Event title" />
        <textarea class="od-admin-textarea" id="od-ev-desc" placeholder="Description (optional)" rows="2"></textarea>
        <div class="od-admin-form-row">
          <input class="od-admin-input" id="od-ev-date" type="datetime-local" />
          <input class="od-admin-input" id="od-ev-location" placeholder="Location (optional)" />
        </div>
        <div class="od-admin-form-row">
          <input class="od-admin-input" id="od-ev-capacity" type="number" placeholder="Capacity (optional)" min="1" />
          <select class="od-admin-select" id="od-ev-type">
            <option value="event">General Event</option>
            <option value="action">Direct Action</option>
            <option value="meeting">Meeting</option>
            <option value="workshop">Workshop</option>
            <option value="social">Social</option>
          </select>
        </div>
        <div class="od-admin-form-actions">
          <button class="od-admin-btn" onclick="createOrgEvent(${org.id})">Create Event</button>
          <button class="od-admin-btn-cancel" onclick="toggleOdForm('od-ev-form', 'od-ev-toggle')">Cancel</button>
        </div>
      </div>
      <button class="od-admin-toggle" id="od-ev-toggle" onclick="toggleOdForm('od-ev-form', 'od-ev-toggle')">+ Create Event</button>
    `
      : "";

    const membersTabBtn = isOrgAdmin
      ? `
      <button class="od-tab" onclick="switchOdTab('members', this)">Members</button>
    `
      : "";

    const membersTabPanel = isOrgAdmin
      ? `
      <div class="od-tab-panel od-tab-panel-hidden" id="od-panel-members">
        <div id="od-members-list"><p class="od-empty">Loading members…</p></div>
      </div>
    `
      : "";

         // Build contribution banner if user is returning from Stripe
    let contributionBanner = '';
    if (contributionParam === 'success') {
      contributionBanner = `
        <div class="contribution-banner contribution-banner-success">
          <span class="contribution-banner-mark">★</span>
          <div class="contribution-banner-text">
            <strong>Thanks for contributing.</strong> Your org is live and your contribution helps keep Prema running.
          </div>
        </div>
      `;
    } else if (contributionParam === 'canceled') {
      contributionBanner = `
        <div class="contribution-banner contribution-banner-neutral">
          <span class="contribution-banner-mark">🌹</span>
          <div class="contribution-banner-text">
            <strong>Your org is live.</strong> Pay what you can — $0 is always okay.
          </div>
          <button class="contribution-banner-close" onclick="this.parentElement.remove()" aria-label="Dismiss">×</button>
        </div>
      `;
    }

    document.getElementById("page-org-detail").innerHTML = `
      <div class="page-hero-sm">
        <div class="page-hero-inner">
          <button class="org-detail-back" onclick="showPage('${fromPage}')">← Back</button>
          <h1 class="page-hero-title" style="margin-top:0.7rem">🤝 <em>${org.name}</em></h1>
          <p class="page-hero-sub">${org.member_count} members · ${org.location || "Remote"}</p>
        </div>
      </div>

      <div class="od-about-static">
            <p class="od-about">${org.description || ""}</p>
            ${org.values_statement ? `<p class="od-about" style="margin-top:1rem;opacity:0.7">${org.values_statement}</p>` : ""}
      </div>

      <div class="org-detail-body">
        <div>
          <div class="od-tabs">
            <button class="od-tab active" onclick="switchOdTab('announcements', this)">
              Announcements${annCount > 0 ? ` <span class="od-tab-badge">${annCount}</span>` : ""}
            </button>
            <button class="od-tab" onclick="switchOdTab('events', this)">
              Events${evCount > 0 ? ` <span class="od-tab-badge">${evCount}</span>` : ""}
            </button>
            <button class="od-tab" onclick="switchOdTab('posts', this)">
              Needs &amp; Offers${openNeedsTotal > 0 ? ` <span class="od-tab-badge">${openNeedsTotal}</span>` : ''}
            </button>
            ${membersTabBtn}
          </div>

          <div class="od-tab-panel" id="od-panel-announcements">
            ${annAdminHTML}
            <div class="od-announcements">${annHTML}</div>
          </div>

          <div class="od-tab-panel od-tab-panel-hidden" id="od-panel-events">
            ${evAdminHTML}
            <div class="od-events">${evHTML}</div>
          </div>

           <div class="od-tab-panel od-tab-panel-hidden" id="od-panel-posts">
            ${postsHTML}
          </div>

          ${membersTabPanel}
        </div>

        <aside class="org-detail-aside">
          <div class="od-aside-box">
            <div class="od-aside-emoji">🤝</div>
            <div class="od-aside-name">${org.name}</div>
            <div class="od-aside-count">${org.member_count} members</div>
            ${isOrgAdmin ? '<div class="od-aside-admin-badge">⚙ Org Admin</div>' : ""}
            <button class="od-aside-join${joinClass}" id="od-join-btn"
              onclick="joinOrg(${org.id}, this)">${joinLabel}</button>
            <button class="od-aside-report" onclick="openReport('org','${org.name}')">⚑ Report this Organization</button>
            ${org.location ? `<div class="od-aside-lbl">Location</div><div class="od-aside-val">${org.location}</div>` : ""}
            ${org.contact_email ? `<div class="od-aside-lbl">Contact</div><div class="od-aside-val">${org.contact_email}</div>` : ""}
            ${org.website ? `<div class="od-aside-lbl">Website</div><div class="od-aside-val"><a href="${org.website}" target="_blank">${org.website}</a></div>` : ""}
            <div class="od-aside-lbl">Type</div>
            <div class="od-aside-val">${org.scope === "local" ? "📍 Local" : "🌐 Global"}</div>
          </div>
        </aside>
      </div>
    `;

    showPage("org-detail", false);

    if (isOrgAdmin) {
      loadOrgMembers(org.id);
    }
  } catch (err) {
    console.error("Open org detail error:", err);
    showToast("Could not load organization.");
  }
}

async function joinOrg(orgId, btn) {
  if (!loggedIn) {
    requireAuth(() => joinOrg(orgId, btn));
    return;
  }

  try {
    const res = await fetch(`${API}/orgs/${orgId}/join`, {
      method: "POST",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not send join request.");
      return;
    }

    btn.textContent = "⧖ Request Pending";
    btn.classList.add("od-aside-join-pending");
    showToast("Join request sent.");
  } catch (err) {
    console.error("Join org error:", err);
    showToast("Could not connect to server.");
  }
}

async function rsvpEvent(orgId, eventId, btn) {
  if (!loggedIn) {
    requireAuth(() => rsvpEvent(orgId, eventId, btn));
    return;
  }

  try {
    const res = await fetch(`${API}/orgs/${orgId}/events/${eventId}/rsvp`, {
      method: "POST",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not RSVP.");
      return;
    }

    btn.textContent = "✓ Going";
    btn.classList.add("rsvp-btn-going");
    showToast("RSVP confirmed.");
  } catch (err) {
    console.error("RSVP error:", err);
    showToast("Could not connect to server.");
  }
}

async function claimPost(postId) {
  if (!loggedIn) { requireAuth(() => claimPost(postId)); return; }

  try {
    const res = await fetch(`${API}/posts/${postId}/claim`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Could not claim.'); return; }
    showToast('✓ Claimed. A thread was opened so you can coordinate.');
    openOrgDetail(currentOrgSlug, currentOrgFromPage);
  } catch (err) {
    console.error('Claim error:', err);
    showToast('Could not connect to server.');
  }
}

async function unclaimPost(postId) {
  try {
    const res = await fetch(`${API}/posts/${postId}/claim`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Could not unclaim.'); return; }
    showToast('Unclaimed.');
    openOrgDetail(currentOrgSlug, currentOrgFromPage);
  } catch (err) {
    console.error('Unclaim error:', err);
    showToast('Could not connect to server.');
  }
}

async function fulfillPost(postId) {
  if (!confirm('Mark this post as fulfilled? This cannot be undone.')) return;
  try {
    const res = await fetch(`${API}/posts/${postId}/fulfill`, {
      method: 'POST',
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Could not fulfill.'); return; }
    showToast('✓ Marked fulfilled. Thank you.');
    openOrgDetail(currentOrgSlug, currentOrgFromPage);
  } catch (err) {
    console.error('Fulfill error:', err);
    showToast('Could not connect to server.');
  }
}

/* ══════════════════════════════════════
   ORG ADMIN
══════════════════════════════════════ */

function toggleOdForm(formId, btnId) {
  const form = document.getElementById(formId);
  const btn = document.getElementById(btnId);
  if (!form) return;
  const isHidden = form.style.display === "none";
  form.style.display = isHidden ? "block" : "none";
  if (btn) btn.style.display = isHidden ? "none" : "inline-block";
}

async function postAnnouncement(orgId) {
  const title = document.getElementById("od-ann-title")?.value.trim();
  const body = document.getElementById("od-ann-body")?.value.trim();
  if (!title || !body) {
    showToast("Title and body are required.");
    return;
  }

  try {
    const res = await fetch(`${API}/orgs/${orgId}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, body }),
    });

    if (res.ok) {
      showToast("Announcement posted.");
      openOrgDetail(currentOrgSlug, currentOrgFromPage);
    } else {
      const err = await res.json();
      showToast(err.error || "Could not post announcement.");
    }
  } catch (err) {
    console.error("Post announcement error:", err);
  }
}

async function createOrgEvent(orgId) {
  const title = document.getElementById("od-ev-title")?.value.trim();
  const desc = document.getElementById("od-ev-desc")?.value.trim();
  const date = document.getElementById("od-ev-date")?.value;
  const location = document.getElementById("od-ev-location")?.value.trim();
  const capacity = document.getElementById("od-ev-capacity")?.value;
  const type = document.getElementById("od-ev-type")?.value;
  if (!title) {
    showToast("Event title is required.");
    return;
  }

  try {
    const res = await fetch(`${API}/orgs/${orgId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title,
        description: desc,
        event_date: date || null,
        location,
        capacity: capacity || null,
        type,
      }),
    });

    if (res.ok) {
      showToast("Event created.");
      openOrgDetail(currentOrgSlug, currentOrgFromPage);
    } else {
      const err = await res.json();
      showToast(err.error || "Could not create event.");
    }
  } catch (err) {
    console.error("Create event error:", err);
  }
}

async function loadOrgMembers(orgId) {
  try {
    const res = await fetch(`${API}/orgs/${orgId}/members`, {
      credentials: "include",
    });

    if (!res.ok) return;
    const data = await res.json();
    const list = document.getElementById("od-members-list");
    if (!list) return;

    const pending = data.members.filter((m) => m.status === "pending");
    const active = data.members.filter((m) => m.status === "active");

    let html = "";

    if (pending.length > 0) {
      html += `<div class="od-members-section-hd">Pending Requests</div>`;
      html += pending
        .map(
          (m) => `
        <div class="od-member-row od-member-pending">
          <div class="od-member-info">
            <span class="od-member-name" onclick="openProfileModal('${m.username}')">${m.display_name || m.username}</span>
            <span class="od-member-username">@${m.username}</span>
          </div>
          <div class="od-member-actions">
            <button class="od-member-btn od-member-approve" onclick="manageMember(${orgId}, ${m.user_id}, 'approve', this)">Approve</button>
            <button class="od-member-btn od-member-reject" onclick="manageMember(${orgId}, ${m.user_id}, 'reject', this)">Reject</button>
          </div>
        </div>
      `,
        )
        .join("");
    }

    if (active.length > 0) {
      html += `<div class="od-members-section-hd">Members</div>`;
      html += active
        .map(
          (m) => `
        <div class="od-member-row">
          <div class="od-member-info">
            <span class="od-member-name" onclick="openProfileModal('${m.username}')">${m.display_name || m.username}</span>
            <span class="od-member-username">@${m.username}</span>
            ${m.role === "admin" ? '<span class="od-member-admin-badge">Admin</span>' : ""}
          </div>
          <div class="od-member-actions">
            ${m.role !== "admin" ? `<button class="od-member-btn od-member-promote" onclick="promoteOrgMember(${orgId}, ${m.user_id}, this)">Make Admin</button>` : ""}
          </div>
        </div>
      `,
        )
        .join("");
    }

    if (!pending.length && !active.length) {
      html = '<p class="od-empty">No members yet.</p>';
    }

    list.innerHTML = html;
  } catch (err) {
    console.error("Load members error:", err);
  }
}

async function manageMember(orgId, userId, action, btn) {
  try {
    const res = await fetch(`${API}/orgs/${orgId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action }),
    });

    if (res.ok) {
      showToast(
        action === "approve" ? "Member approved." : "Request rejected.",
      );
      loadOrgMembers(orgId);
    } else {
      const err = await res.json();
      showToast(err.error || "Could not update member.");
    }
  } catch (err) {
    console.error("Manage member error:", err);
  }
}

async function promoteOrgMember(orgId, userId, btn) {
  if (!confirm("Promote this member to org admin?")) return;
  try {
    const res = await fetch(`${API}/orgs/${orgId}/members/${userId}/role`, {
      method: "PATCH",
      credentials: "include",
    });

    if (res.ok) {
      showToast("Member promoted to org admin.");
      loadOrgMembers(orgId);
    } else {
      const err = await res.json();
      showToast(err.error || "Could not promote member.");
    }
  } catch (err) {
    console.error("Promote member error:", err);
  }
}

/* ══════════════════════════════════════
   ADMIN DASHBOARD
══════════════════════════════════════ */
let adminTab = "reports";

function switchAdminTab(tab, btn) {
  adminTab = tab;
  document
    .querySelectorAll(".admin-tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".admin-panel")
    .forEach((p) => p.classList.add("admin-panel-hidden"));
  btn.classList.add("active");
  document
    .getElementById(`admin-panel-${tab}`)
    ?.classList.remove("admin-panel-hidden");
  loadAdminTab(tab);
}

async function loadAdminTab(tab) {
  if (tab === "reports") loadAdminReports();
  if (tab === "users") loadAdminUsers();
  if (tab === "orgs") loadAdminOrgs();
}

async function initAdmin() {
  try {
    const res = await fetch(`${API}/admin/stats`, {
      credentials: "include",
    });
    const data = await res.json();

    if (data.pendingReports > 0) {
      document.getElementById("admin-reports-badge").textContent =
        data.pendingReports;
    }
    if (data.pendingOrgs > 0) {
      document.getElementById("admin-orgs-badge").textContent =
        data.pendingOrgs;
    }
  } catch (err) {
    console.error("Admin stats error:", err);
  }

  loadAdminReports();
}

async function loadAdminReports() {
  try {
    const res = await fetch(`${API}/admin/reports`, {
      credentials: "include",
    });
    const data = await res.json();

    const list = document.getElementById("admin-reports-list");

    if (!data.reports.length) {
      list.innerHTML = '<p class="admin-empty">No pending reports.</p>';
      return;
    }

    list.innerHTML = data.reports
      .map(
        (r) => `
      <div class="admin-report-card">
        <div class="admin-report-header">
          <span class="admin-report-type">${r.content_type}</span>
          <span class="admin-report-id">ID: ${r.content_id}</span>
          <span class="admin-report-date">${new Date(r.created_at).toLocaleDateString()}</span>
        </div>
        <div class="admin-report-reason"><strong>Reason:</strong> ${r.reason}</div>
        ${r.other_text ? `<div class="admin-report-note">${r.other_text}</div>` : ""}
        <div class="admin-report-reporter">Reported by: ${r.reporter_name || r.reporter_username}</div>
        <div class="admin-report-actions">
          <button class="admin-btn admin-btn-dismiss" onclick="resolveReport(${r.id}, 'dismissed')">Dismiss</button>
          <button class="admin-btn admin-btn-remove" onclick="resolveReport(${r.id}, 'actioned')">Remove Content</button>
          ${r.content_type === "post" ? `<button class="admin-btn admin-btn-view" onclick="viewReportedPost(${r.content_id})">View Post</button>` : ""}
        </div>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    console.error("Load reports error:", err);
  }
}

async function resolveReport(reportId, action) {
  try {
    const res = await fetch(`${API}/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action }),
    });

    if (res.ok) {
      showToast(
        action === "dismissed" ? "Report dismissed." : "Content removed.",
      );
      loadAdminReports();
    }
  } catch (err) {
    console.error("Resolve report error:", err);
  }
}

async function loadAdminUsers() {
  const q = document.getElementById("admin-user-search")?.value.trim();

  try {
    const params = new URLSearchParams();
    if (q) params.append("q", q);

    const res = await fetch(`${API}/admin/users?${params}`, {
      credentials: "include",
    });
    const data = await res.json();

    const list = document.getElementById("admin-users-list");

    if (!data.users.length) {
      list.innerHTML = '<p class="admin-empty">No users found.</p>';
      return;
    }

    list.innerHTML = data.users
      .map(
        (u) => `
      <div class="admin-user-card ${u.is_banned ? "admin-user-banned" : ""}">
        <div class="admin-user-info">
          <div class="admin-user-name">${u.display_name || u.username} <span class="admin-user-handle">@${u.username}</span></div>
          <div class="admin-user-email">${u.email}</div>
          <div class="admin-user-meta">
            ${u.is_admin ? '<span class="admin-badge">Admin</span>' : ""}
            ${u.is_banned ? `<span class="banned-badge">Banned — ${u.ban_reason || "no reason given"}</span>` : ""}
            Joined ${new Date(u.created_at).toLocaleDateString()}
          </div>
        </div>
        <div class="admin-user-actions">
          <button class="admin-btn admin-btn-view" onclick="viewProfile('${u.username}')">View Profile</button>
          ${
            u.is_banned
              ? `<button class="admin-btn admin-btn-approve" onclick="unbanUser(${u.id})">Unban</button>`
              : `<button class="admin-btn admin-btn-remove" onclick="banUser(${u.id}, '${u.username}')">Ban</button>`
          }
        </div>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    console.error("Load users error:", err);
  }
}

function searchAdminUsers() {
  loadAdminUsers();
}

async function banUser(userId, username) {
  const reason = prompt(`Reason for banning @${username}?`);
  if (!reason) return;

  try {
    const res = await fetch(`${API}/admin/users/${userId}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason }),
    });

    if (res.ok) {
      showToast(`@${username} has been banned.`);
      loadAdminUsers();
    }
  } catch (err) {
    console.error("Ban user error:", err);
  }
}

async function unbanUser(userId) {
  try {
    const res = await fetch(`${API}/admin/users/${userId}/unban`, {
      method: "POST",
      credentials: "include",
    });

    if (res.ok) {
      showToast("User unbanned.");
      loadAdminUsers();
    }
  } catch (err) {
    console.error("Unban user error:", err);
  }
}

async function loadAdminOrgs() {
  try {
    const res = await fetch(`${API}/admin/org-requests`, {
      credentials: "include",
    });
    const data = await res.json();

    const list = document.getElementById("admin-orgs-list");

    if (!data.requests.length) {
      list.innerHTML = '<p class="admin-empty">No pending org requests.</p>';
      return;
    }

    list.innerHTML = data.requests
      .map(
        (r) => `
      <div class="admin-org-card">
        <div class="admin-org-name">${r.name}</div>
        <div class="admin-org-meta">${r.scope} · Submitted by ${r.display_name || r.username} on ${new Date(r.created_at).toLocaleDateString()}</div>
        <div class="admin-org-desc">${r.description}</div>
        ${r.values_statement ? `<div class="admin-org-values"><strong>Values:</strong> ${r.values_statement}</div>` : ""}
        ${r.website ? `<div class="admin-org-website"><strong>Website:</strong> ${r.website}</div>` : ""}
        ${r.contact_email ? `<div class="admin-org-contact"><strong>Contact:</strong> ${r.contact_email}</div>` : ""}
        <div class="admin-report-actions">
          <button class="admin-btn admin-btn-approve" onclick="approveOrg(${r.id})">Approve</button>
          <button class="admin-btn admin-btn-remove" onclick="rejectOrg(${r.id})">Reject</button>
        </div>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    console.error("Load org requests error:", err);
  }
}

async function approveOrg(requestId) {
  try {
    const res = await fetch(`${API}/admin/org-requests/${requestId}/approve`, {
      method: "POST",
      credentials: "include",
    });

    if (res.ok) {
      showToast("Organization approved.");
      loadAdminOrgs();
    }
  } catch (err) {
    console.error("Approve org error:", err);
  }
}

async function rejectOrg(requestId) {
  try {
    const res = await fetch(`${API}/admin/org-requests/${requestId}/reject`, {
      method: "POST",
      credentials: "include",
    });

    if (res.ok) {
      showToast("Request rejected.");
      loadAdminOrgs();
    }
  } catch (err) {
    console.error("Reject org error:", err);
  }
}

/* ── INIT ── */
document.addEventListener("DOMContentLoaded", async () => {
  buildChains();

  // Check if user is already logged in
  try {
    const res = await fetch(`${API}/auth/me`, {
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      loggedIn = true;
      currentUser = {
        id: data.user.id,
        name: data.user.display_name || data.user.username,
        username: data.user.username,
        location: data.user.location,
        bio: data.user.bio,
        is_admin: data.user.is_admin,
      };
      updateNavAuth();
      loadInbox();
    }
  } catch (err) {
    console.error("Session check failed:", err);
  }

  // Handle email verification redirect
  const params = new URLSearchParams(window.location.search);
  const verified = params.get("verified");
  if (verified === "true") {
    showToast("✓ Email verified — you can now sign in.");
    openModal("signin");
    window.history.replaceState({}, "", window.location.pathname);
  } else if (verified === "expired") {
    showToast("Verification link has expired. Please sign up again.");
    window.history.replaceState({}, "", window.location.pathname);
  } else if (verified === "invalid") {
    showToast("Invalid verification link.");
    window.history.replaceState({}, "", window.location.pathname);
  }

  if (localStorage.getItem("chainsBroken")) {
    const hero = document.querySelector(".hero");
    if (hero) hero.classList.add("gone");
  }

  await router();
});

/* ══════════════════════════════════════
   PROFILE DROPDOWN
══════════════════════════════════════ */
function toggleProfileMenu(e) {
  e.stopPropagation();
  document.getElementById("profile-dropdown").classList.toggle("open");
}
function closeProfileMenu() {
  const dropdown = document.getElementById("profile-dropdown");
  if (dropdown) dropdown.classList.remove("open");
}
document.addEventListener("click", () => closeProfileMenu());

/* ══════════════════════════════════════
   PROFILE MODAL (quick card)
══════════════════════════════════════ */
async function openProfileModal(username) {
  try {
    const res = await fetch(`${API}/users/${username}`, {
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      showToast("Could not load profile.");
      return;
    }

    const { user, vouches, completedHelps } = data;
    const initial = (user.display_name || user.username)
      .charAt(0)
      .toUpperCase();

    const body = `
      <div class="profile-modal-wrap">
        <div class="profile-modal-avatar">${initial}</div>
        <div>
          <div class="profile-modal-name">${user.display_name || user.username}</div>
          <div class="profile-modal-loc">📍 ${user.location || "Location not set"}</div>
          <div class="profile-modal-bio">${user.bio || ""}</div>
        </div>
      </div>
      <div class="profile-modal-stats">
        <div class="profile-modal-stat">
          <span class="profile-modal-stat-num">${completedHelps}</span>
          <span class="profile-modal-stat-label">Helps given</span>
        </div>
        <div class="profile-modal-stat">
          <span class="profile-modal-stat-num">${vouches.length}</span>
          <span class="profile-modal-stat-label">Vouches</span>
        </div>
      </div>
      <div class="profile-modal-actions">
        <button class="profile-modal-btn-primary" onclick="closeModal(); showPage('inbox')">Send Message</button>
        <button class="profile-modal-btn-secondary" onclick="closeModal(); viewProfile('${user.username}')">View Full Profile →</button>
      </div>
    `;

    document.getElementById("modal-body").innerHTML = body;
    document.getElementById("overlay").classList.add("open");
  } catch (err) {
    console.error("Profile modal error:", err);
    showToast("Could not load profile.");
  }
}

/* ══════════════════════════════════════
   PROFILE PAGE
══════════════════════════════════════ */

async function viewProfile(username) {
  window.history.pushState(
    { page: "profile", username },
    "",
    `/users/${username}`,
  );
  try {
    const res = await fetch(`${API}/users/${username}`, {
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      showToast("Could not load profile.");
      return;
    }

    const { user, posts, vouches, thankYouNotes, completedHelps } = data;
    const initial = (user.display_name || user.username)
      .charAt(0)
      .toUpperCase();
    const memberSince = new Date(user.created_at).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    document.getElementById("profile-avatar").textContent = initial;
    document.getElementById("profile-display-name").textContent =
      user.display_name || user.username;
    document.getElementById("profile-location").textContent =
      "📍 " + (user.location || "Location not set");
    document.getElementById("profile-member-since").textContent =
      "Member since " + memberSince;
    document.getElementById("profile-bio").textContent = user.bio || "";
    document.getElementById("profile-helps").textContent = completedHelps;
    document.getElementById("profile-vouches-count").textContent =
      vouches.length;
    document.getElementById("profile-vouches-label").textContent =
      vouches.length;
    document.getElementById("profile-report-btn").onclick = () =>
      openReport("profile", username);

    // Posts
    const postsList = document.getElementById("profile-posts-list");
    postsList.innerHTML = posts.length
      ? posts
          .map(
            (p) => `
      <div class="profile-post-card ${p.type === "ability" ? "offer" : "need"}">
        <span class="profile-post-type">${p.type === "ability" ? "Ability" : "Need"}</span>
        <div class="profile-post-title">${p.title}</div>
        <div class="profile-post-body">${p.body}</div>
        <div class="profile-post-meta">${p.category} · ${p.location || ""} · ${new Date(p.created_at).toLocaleDateString()}</div>
      </div>
    `,
          )
          .join("")
      : '<p style="opacity:0.4">No active posts.</p>';

    // Vouches
    const vouchesList = document.getElementById("profile-vouches-list");
    vouchesList.innerHTML = vouches.length
      ? vouches
          .map(
            (v) => `
      <div class="profile-vouch">
        <div class="profile-vouch-header">
          <span class="profile-vouch-from">${v.voucher_name || v.voucher_username}</span>
          <span class="profile-vouch-date">${new Date(v.created_at).toLocaleDateString()}</span>
        </div>
        ${v.note ? `<p class="profile-vouch-note">${v.note}</p>` : ""}
      </div>
    `,
          )
          .join("")
      : '<p style="opacity:0.4">No vouches yet.</p>';

    // Thank you notes
    const thanksList = document.getElementById("profile-thanks-list");
    thanksList.innerHTML = thankYouNotes.length
      ? thankYouNotes
          .map(
            (n) => `
      <div class="profile-thank">
        <p class="profile-thank-note">"${n.body}"</p>
        <div class="profile-thank-from">— ${n.author_name}, ${new Date(n.created_at).toLocaleDateString()}</div>
      </div>
    `,
          )
          .join("")
      : '<p style="opacity:0.4">No thank you notes yet.</p>';

    showPage("profile", false);
  } catch (err) {
    console.error("View profile error:", err);
    showToast("Could not load profile.");
  }
}

/* ══════════════════════════════════════
   INBOX
══════════════════════════════════════ */
let inboxThreads = [];

async function loadInbox() {
  try {
    const res = await fetch(`${API}/threads`, {
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Could not load inbox:", data.error);
      return;
    }

    inboxThreads = data.threads;
    renderInbox();
    updateInboxBadge();
  } catch (err) {
    console.error("Load inbox error:", err);
  }
}

function renderInbox() {
  if (isMobile()) {
    document.querySelector(".inbox-shell").classList.remove("show-thread");
  }
  const threadList = document.getElementById("inbox-thread-list");
  if (!threadList) return;

  if (!inboxThreads.length) {
    threadList.innerHTML = '<div class="inbox-empty">No messages yet.</div>';
    return;
  }

  threadList.innerHTML = inboxThreads
    .map((t, i) => {
      const isMe = t.participant_a === currentUser?.id;
      const otherName = isMe
        ? t.user_b_name || t.user_b_username
        : t.user_a_name || t.user_a_username;
      const initial = otherName ? otherName.charAt(0).toUpperCase() : "?";
      const preview = t.last_message || "No messages yet";
      const unread = parseInt(t.unread_count) > 0;

      return `
      <div class="inbox-thread ${i === 0 ? "active" : ""}" onclick="openThreadById(${t.id})">
        <div class="inbox-thread-avatar">${initial}</div>
        <div class="inbox-thread-info">
          <div class="inbox-thread-name">${otherName}</div>
          <div class="inbox-thread-preview">${preview}</div>
        </div>
        <div class="inbox-thread-meta">
          <div class="inbox-thread-time">${t.last_message_at ? new Date(t.last_message_at).toLocaleDateString() : ""}</div>
          ${unread ? '<div class="inbox-unread-dot"></div>' : ""}
        </div>
      </div>
    `;
    })
    .join("");

  // Auto open first thread
  if (inboxThreads.length > 0 && !isMobile()) {
    openThreadById(inboxThreads[0].id);
  }
}

function updateInboxBadge() {
  const badge = document.getElementById("inbox-badge");
  if (!badge) return;
  const total = inboxThreads.reduce(
    (sum, t) => sum + (parseInt(t.unread_count) || 0),
    0,
  );
  if (total > 0) {
    badge.textContent = total;
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}

async function openThreadById(threadId) {
  if (isMobile()) {
    document.querySelector(".inbox-shell").classList.add("show-thread");
  }

  function closeMobileThread() {
    document.querySelector(".inbox-shell").classList.remove("show-thread");
  }

  try {
    const res = await fetch(`${API}/threads/${threadId}`, {
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Could not load thread:", data.error);
      return;
    }

    const { thread, messages } = data;

    const isMe = thread.participant_a === currentUser?.id;
    const otherName = isMe
      ? thread.user_b_name || thread.user_b_username
      : thread.user_a_name || thread.user_a_username;
    const initial = otherName ? otherName.charAt(0).toUpperCase() : "?";

    // Update header
    document.getElementById("inbox-thread-hd").innerHTML = `
  <div class="inbox-mobile-back" onclick="closeMobileThread()">← Back</div>
  <div class="inbox-thread-hd-avatar">${initial}</div>
  <div class="inbox-thread-hd-info">
    <div class="inbox-thread-hd-name">${otherName}</div>
    <div class="inbox-thread-hd-re">${thread.post_title ? "Re: " + thread.post_title : "Direct message"}</div>
  </div>
`;

    // Render messages
    const messagesEl = document.getElementById("inbox-messages");
    if (!messages.length) {
      messagesEl.innerHTML =
        '<div class="inbox-empty-thread">No messages yet. Say hello.</div>';
    } else {
      messagesEl.innerHTML = messages
        .map(
          (m) => `
        <div class="inbox-msg ${m.sender_id === currentUser?.id ? "mine" : "theirs"}">
          <div class="inbox-msg-bubble">${m.body}</div>
          <div class="inbox-msg-time">${new Date(m.created_at).toLocaleTimeString()}</div>
        </div>
      `,
        )
        .join("");
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Show compose box and set current thread
    document.getElementById("inbox-compose").style.display = "flex";
    document.getElementById("inbox-compose-input").placeholder =
      `Message ${otherName}…`;
    window.currentThreadId = threadId;

    // Mark thread as read locally and update badge
    const t = inboxThreads.find((t) => t.id === threadId);
    if (t) {
      t.unread_count = 0;
      updateInboxBadge();
    }
  } catch (err) {
    console.error("Open thread error:", err);
  }
}

function toggleJoinOrg(orgName, btn) {
  if (joinedOrgs.has(orgName)) return; // already a member
  if (btn.classList.contains("od-aside-join-pending")) return; // already pending

  // Open request modal
  const body = `
    <div class="modal-title">Request to Join</div>
    <p class="modal-sub">You're requesting to join <strong>${orgName}</strong>. Tell them why you belong here.</p>
    <div class="form-field">
      <label class="form-label">Why do you fit in here?</label>
      <textarea class="form-textarea" id="join-request-msg" placeholder="Tell ${orgName} how your values and skills align with what they're doing. Be specific — this is your introduction." rows="5"></textarea>
    </div>
    <p class="form-hint">This message goes directly to the group's admins. They'll review your request and get back to you.</p>
    <button class="form-submit" onclick="submitJoinRequest('${orgName}')">Send Request →</button>
  `;
  document.getElementById("modal-body").innerHTML = body;
  document.getElementById("overlay").classList.add("open");
  setTimeout(() => document.getElementById("join-request-msg")?.focus(), 100);
}

function submitJoinRequest(orgName) {
  const msg = document.getElementById("join-request-msg")?.value.trim();
  if (!msg) {
    showToast("Tell them why you fit in here first.");
    return;
  }
  closeModal();
  // Find the join button and set it to pending
  const btn = document.getElementById("od-join-btn");
  if (btn) {
    btn.textContent = "⧖ Request Pending";
    btn.classList.add("od-aside-join-pending");
  }
  showToast(`Request sent to ${orgName}`);
}

async function respondToPost(userId, posterName, postTitle) {
  if (!loggedIn) {
    requireAuth(() => respondToPost(userId, posterName, postTitle));
    return;
  }

  try {
    const res = await fetch(`${API}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ recipient_id: userId }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not start conversation.");
      return;
    }

    showPage("inbox");
    loadInbox();
  } catch (err) {
    console.error("Respond error:", err);
    showToast("Could not connect to server.");
  }
}

function confirmMarkDone(idx) {
  const thread = inboxThreads[idx];
  const body = `
    <div class="modal-title">Mark as Done?</div>
    <p class="modal-sub">You're marking your interaction with <strong>${thread.name}</strong> as complete.</p>
    <p class="form-hint">Both of you will be asked to confirm. Once confirmed, thank you notes and vouching unlock.</p>
    <button class="form-submit" onclick="markDone(${idx})">Yes, we're done →</button>
  `;
  document.getElementById("modal-body").innerHTML = body;
  document.getElementById("overlay").classList.add("open");
}

function markDone(idx) {
  closeModal();
  const thread = inboxThreads[idx];
  thread.status = "complete";
  thread.messages.push({
    system: true,
    complete: true,
    text: "This interaction is complete. You can leave a thank you note or vouch for each other below.",
  });
  openThread(idx);
  showToast("★ Marked as done. Thank you notes and vouching are now unlocked.");
}

function openThankYouModal(idx) {
  const thread = inboxThreads[idx];
  const body = `
    <div class="modal-title">Leave a Thank You Note</div>
    <p class="modal-sub">For <strong>${thread.name}</strong>. Short, human, honest.</p>
    <div class="form-field">
      <textarea class="form-textarea" id="thankyou-text" placeholder="What did they do? What did it mean to you?" rows="4"></textarea>
    </div>
    <div class="form-field">
      <label class="form-label">Post as</label>
      <div class="signup-options" style="gap:0.35rem">
        <label class="signup-option" style="padding:0.5rem 0.75rem">
          <input type="radio" name="ty-anon" value="named" checked>
          <span style="font-size:0.72rem">My name (${currentUser ? currentUser.name : "You"})</span>
        </label>
        <label class="signup-option" style="padding:0.5rem 0.75rem">
          <input type="radio" name="ty-anon" value="anon">
          <span style="font-size:0.72rem">Community member (anonymous)</span>
        </label>
      </div>
    </div>
    <p class="form-hint">The recipient chooses whether to display it on their profile. Once posted you can't edit it.</p>
    <button class="form-submit" onclick="submitThankYou(${idx})">Send Note →</button>
  `;
  document.getElementById("modal-body").innerHTML = body;
  document.getElementById("overlay").classList.add("open");
}

function submitThankYou(idx) {
  const text = document.getElementById("thankyou-text")?.value.trim();
  if (!text) {
    showToast("Write something first.");
    return;
  }
  const thread = inboxThreads[idx];
  closeModal();
  showToast("Thank you note sent to " + thread.name + ".");
}

function openVouchModal(idx) {
  const thread = inboxThreads[idx];
  const body = `
    <div class="modal-title">Vouch for ${thread.name}</div>
    <p class="modal-sub">A vouch says: I have worked with this person and I stand behind them.</p>
    <div class="form-field">
      <label class="form-label">Add a note <span style="opacity:0.5;font-weight:400;text-transform:none;letter-spacing:0">(optional but meaningful)</span></label>
      <textarea class="form-textarea" id="vouch-note" placeholder="What was it like working with them? What would you want others to know?" rows="3"></textarea>
    </div>
    <p class="form-hint">Vouches are visible on their public profile. You can only vouch once per completed interaction.</p>
    <button class="form-submit" onclick="submitVouch(${idx})">Vouch for ${thread.name} →</button>
  `;
  document.getElementById("modal-body").innerHTML = body;
  document.getElementById("overlay").classList.add("open");
}

function submitVouch(idx) {
  const thread = inboxThreads[idx];
  closeModal();
  showToast(
    "★ You vouched for " + thread.name + ". It will appear on their profile.",
  );
}

function openThread(idx) {
  activeThread = idx;
  document.querySelectorAll(".inbox-thread").forEach((el, i) => {
    el.classList.toggle("active", i === idx);
  });
  const dot = document.querySelectorAll(".inbox-unread-dot")[idx];
  if (dot) dot.remove();

  const thread = inboxThreads[idx];
  document.querySelector(".inbox-thread-hd-avatar").textContent =
    thread.initial;
  document.querySelector(".inbox-thread-hd-name").textContent = thread.name;
  document.querySelector(".inbox-thread-hd-re").textContent = thread.re;

  // Render header action button based on status
  const hdInfo = document.querySelector(".inbox-thread-hd-info");
  let hdAction = "";
  if (thread.status === "active" || thread.status === "pending-completion") {
    hdAction = `<button class="inbox-mark-done-btn" onclick="confirmMarkDone(${idx})">Mark as Done</button>`;
  } else if (thread.status === "complete") {
    hdAction = `<span class="inbox-complete-badge">✓ Complete</span>`;
  }
  document.querySelector(".inbox-thread-hd").innerHTML = `
    <div class="inbox-thread-hd-avatar">${thread.initial}</div>
    <div class="inbox-thread-hd-info">
      <div class="inbox-thread-hd-name">${thread.name}</div>
      <div class="inbox-thread-hd-re">${thread.re}</div>
    </div>
    ${hdAction}
  `;

  // Add system message for pending-completion
  const msgs = [...thread.messages];
  if (thread.status === "pending-completion" && !msgs.find((m) => m.system)) {
    msgs.push({
      system: true,
      text: `${thread.name} said the help is done. Mark as complete to unlock thank you notes and vouching.`,
    });
  }
  if (
    thread.status === "complete" &&
    !msgs.find((m) => m.system && m.complete)
  ) {
    msgs.push({
      system: true,
      complete: true,
      text: "This interaction is complete. You can leave a thank you note or vouch for each other below.",
    });
  }

  const container = document.getElementById("inbox-messages");
  container.innerHTML = msgs
    .map((m) =>
      m.system
        ? `
    <div class="inbox-msg-system">${m.text}</div>
  `
        : `
    <div class="inbox-msg ${m.mine ? "mine" : "theirs"}">
      <div class="inbox-msg-bubble">${m.text}</div>
      <div class="inbox-msg-time">${m.time}</div>
    </div>
  `,
    )
    .join("");
  container.scrollTop = container.scrollHeight;

  // Render compose or post-completion actions
  const compose = document.getElementById("inbox-compose");
  if (thread.status === "complete") {
    compose.innerHTML = `
      <div class="inbox-post-completion">
        <p class="inbox-completion-label">Interaction complete —</p>
        <button class="inbox-completion-btn" onclick="openThankYouModal(${idx})">Leave a Thank You Note</button>
        <button class="inbox-completion-btn inbox-vouch-btn" onclick="openVouchModal(${idx})">Vouch for ${thread.name}</button>
      </div>
    `;
  } else {
    compose.innerHTML = `
      <textarea class="inbox-compose-input" id="inbox-compose-input" placeholder="Write a message…" rows="2"></textarea>
      <button class="inbox-compose-send" onclick="sendMessage()">Send →</button>
    `;
  }
}

async function sendMessage() {
  const input = document.getElementById("inbox-compose-input");
  const text = input.value.trim();
  if (!text) return;

  if (!window.currentThreadId) {
    showToast("No thread selected.");
    return;
  }

  try {
    const res = await fetch(
      `${API}/threads/${window.currentThreadId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: text }),
      },
    );

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Could not send message.");
      return;
    }

    input.value = "";
    openThreadById(window.currentThreadId);
  } catch (err) {
    console.error("Send message error:", err);
    showToast("Could not connect to server.");
  }
}

/* Make usernames on board cards clickable */
function attachCardProfileClicks() {
  document.querySelectorAll(".card-name").forEach((el) => {
    el.style.cursor = "pointer";
    el.style.textDecoration = "underline dotted";
    el.onclick = (e) => {
      e.stopPropagation();
      const name = el.textContent;
      openProfileModal(
        name,
        "Local area",
        "Member of the Cariño community.",
        Math.floor(Math.random() * 10) + 1,
        Math.floor(Math.random() * 8),
      );
    };
  });
}
